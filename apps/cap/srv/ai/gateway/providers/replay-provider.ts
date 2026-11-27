/**
 * ReplayProvider and RecordingProvider (G2-04): deterministic testing of a non-deterministic system.
 *
 * A real model may answer the same question differently each time, and every call costs money.
 * That makes it unsuitable for automatic tests that run on every code change. The solution is
 * RECORD AND REPLAY:
 *   1. RECORD: run the real (or mock) provider once and save every request/answer pair to a file.
 *   2. REPLAY: in CI, answer from that file. Same input -> same answer, no network, no cost.
 *
 * Lookup key = (prompt version, input hash). The input hash is the SHA-256 of everything the model
 * would see (model, system prompt, messages, schema name, temperature). If the prompt, the model or
 * the input changes, the key changes, the replay finds nothing (REPLAY_MISS) and the test tells you
 * to re-record — so a recording can never silently answer a different question.
 *
 * Files contain redacted request text only through the hash, never the request itself; answers
 * are stored because they are the test expectation. Recordings from a real provider must be
 * reviewed for sensitive content before they are committed (this repository is public).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProviderV2, ProviderRequest, ProviderResponse } from '../types.ts';
import { LLMError } from '../types.ts';

export interface ReplayEntry { text: string; usage: { inputTokens: number; outputTokens: number }; modelId: string }
export interface ReplayFile {
  _note: string;
  /** how the recording was made: 'mock' (simulated test double) or 'live' */
  source: 'mock' | 'live';
  recordedAt: string;
  entries: Record<string, ReplayEntry>;
}

/** The hash that identifies "exactly this question to exactly this model". */
export function inputHashOf(r: Pick<ProviderRequest, 'model' | 'system' | 'messages' | 'schema' | 'temperature'>): string {
  return createHash('sha256').update(JSON.stringify({ m: r.model, s: r.system, msg: r.messages, sch: r.schema?.name ?? null, t: r.temperature })).digest('hex');
}
export const replayKey = (promptVersion: string, inputHash: string) => `${promptVersion}:${inputHash}`;

export class ReplayProvider implements ProviderV2 {
  readonly name = 'replay';
  readonly mode = 'replay' as const;
  private readonly entries: Record<string, ReplayEntry>;
  readonly meta: Pick<ReplayFile, '_note' | 'source' | 'recordedAt'>;
  misses = 0;

  constructor(file: ReplayFile) { this.entries = file.entries; this.meta = { _note: file._note, source: file.source, recordedAt: file.recordedAt }; }

  static fromPath(path: string): ReplayProvider { return new ReplayProvider(JSON.parse(readFileSync(path, 'utf8')) as ReplayFile); }

  async isAvailable() { return true; }

  async complete(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    if (signal.aborted) throw new LLMError('ABORTED', 'The request was cancelled.');
    const hit = this.entries[replayKey(req.promptVersion, req.inputHash)];
    if (!hit) {
      this.misses++;
      throw new LLMError('REPLAY_MISS', `No recorded answer for prompt ${req.promptVersion} and this input (${req.inputHash.slice(0, 12)}…). Re-record the replay file: node tests/eval/run.ts --mode record`);
    }
    return { text: hit.text, usage: hit.usage, modelId: hit.modelId, finishReason: 'stop' };
  }
}

/** Wraps any provider and remembers every request/answer pair so it can be saved as a replay file. */
export class RecordingProvider implements ProviderV2 {
  readonly name: string;
  readonly mode: 'mock' | 'replay' | 'live';
  private readonly inner: ProviderV2;
  readonly entries: Record<string, ReplayEntry> = {};

  constructor(inner: ProviderV2) { this.inner = inner; this.name = `recording(${inner.name})`; this.mode = inner.mode; }
  isAvailable() { return this.inner.isAvailable(); }

  async complete(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    const res = await this.inner.complete(req, signal);
    this.entries[replayKey(req.promptVersion, req.inputHash)] = { text: res.text, usage: res.usage, modelId: res.modelId };
    return res;
  }

  save(path: string, source: 'mock' | 'live', note: string): void {
    mkdirSync(dirname(path), { recursive: true });
    const sorted = Object.fromEntries(Object.entries(this.entries).sort(([a], [b]) => (a < b ? -1 : 1)));
    const file: ReplayFile = { _note: note, source, recordedAt: new Date().toISOString().slice(0, 10), entries: sorted };
    writeFileSync(path, JSON.stringify(file, null, 1) + '\n');
  }
}
