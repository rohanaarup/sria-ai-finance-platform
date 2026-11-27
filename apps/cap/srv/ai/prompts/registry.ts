/**
 * Prompt registry (G2-04): prompts are VERSIONED FILES that the code really loads.
 *
 * Why this matters: a prompt is code. A one-word edit can change what a model does. So each prompt
 * lives in a file with an id and a version, and every model call records the version and the
 * SHA-256 hash of the exact file used. Later, when an answer looks wrong, you can tell which prompt
 * produced it, and an evaluation run can be compared before and after a prompt change.
 *
 * File name: <id>.v<major>.md, starting with a front-matter block:
 *   ---
 *   id: goal-understanding
 *   version: 2.0.0
 *   task: goal_understanding
 *   ---
 * The body may contain {{placeholders}} that are filled with SYSTEM-GENERATED data only. Lists are
 * inserted as JSON strings (quotes escaped, control characters removed) so that text coming from
 * data, such as a glossary alias, cannot break out of its data block and read as an instruction.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));

export interface LoadedPrompt { id: string; version: string; task: string; hash: string; template: string; file: string }

const cache = new Map<string, LoadedPrompt>();

function parse(file: string): LoadedPrompt {
  const raw = readFileSync(join(DIR, file), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`Prompt file ${file} has no front matter`);
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) { const kv = /^(\w+):\s*(.+)$/.exec(line.trim()); if (kv) meta[kv[1]!] = kv[2]!.trim(); }
  if (!meta['id'] || !meta['version'] || !meta['task']) throw new Error(`Prompt file ${file} needs id, version and task`);
  return { id: meta['id'], version: meta['version'], task: meta['task'], hash: createHash('sha256').update(raw).digest('hex'), template: m[2]!, file };
}

export function listPrompts(): LoadedPrompt[] {
  return readdirSync(DIR).filter((f) => /\.v\d+\.md$/.test(f)).map(parse);
}

/** Load the newest version of a prompt id (or an exact version). Throws if it does not exist. */
export function loadPrompt(id: string, version?: string): LoadedPrompt {
  const key = `${id}@${version ?? 'latest'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const all = listPrompts().filter((p) => p.id === id && (!version || p.version === version));
  if (!all.length) throw new Error(`No prompt "${id}"${version ? ` version ${version}` : ''} in the registry`);
  all.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  cache.set(key, all[0]!);
  return all[0]!;
}

/** Render a list or object as a one-line JSON string that is safe inside a data block. */
export function asData(value: unknown): string {
  // strip control characters and line breaks anywhere in strings, then JSON-encode (escapes quotes and backslashes)
  const clean = JSON.stringify(value, (_k, v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').slice(0, 200) : v));
  return clean;
}

/** Fill {{name}} placeholders. Every placeholder must be supplied and no unknown value may be left over. */
export function renderPrompt(p: LoadedPrompt, vars: Record<string, string>): string {
  const names = new Set([...p.template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!));
  for (const n of names) if (!(n in vars)) throw new Error(`Prompt ${p.id}@${p.version}: missing value for {{${n}}}`);
  for (const n of Object.keys(vars)) if (!names.has(n)) throw new Error(`Prompt ${p.id}@${p.version}: unknown placeholder {{${n}}}`);
  return p.template.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => vars[n]!);
}
