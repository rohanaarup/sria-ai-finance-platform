/**
 * Discovery (G2-03 step 0/4): turn a service's `$metadata` into an evidence document.
 *
 * It answers one question: "does this SAP system's service actually contain the fields the adapter
 * reads?" — and records the answer as a field traceability table.
 *
 * Usage:
 *   node apps/cap/scripts/s4-discover.ts --file path/to/metadata.xml [--entity A_JournalEntryItemBasic] [--out evidence.md]
 *   node apps/cap/scripts/s4-discover.ts --destination MY_DESTINATION [--out evidence.md]   (live, read-only GET of $metadata)
 *
 * Exit code 0 = every field the adapter needs is present; 1 = something is missing; 2 = bad usage/unreadable.
 * Review the output before committing it: it contains service and field names only (no data), but
 * remove anything that identifies your landscape if the repository is public.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMetadata, traceabilityTable } from '../srv/lib/providers/s4hana/metadata.ts';
import type { ServiceMetadata } from '../srv/lib/providers/s4hana/metadata.ts';
import { SELECTED_FIELDS } from '../srv/lib/providers/s4hana/mapper.ts';

export function renderEvidence(meta: ServiceMetadata, entitySet: string, source: string, date: string): { md: string; ok: boolean } {
  const table = traceabilityTable(meta, entitySet, SELECTED_FIELDS);
  const missing = table.filter((t) => !t.inMetadata);
  const es = meta.entitySets.find((e) => e.name === entitySet);
  let md = `## Service metadata evidence (${date})\n\nSource: ${source}\n\n`;
  md += `- EDMX version: ${meta.version ?? 'unknown'}\n- Entity sets found: ${meta.entitySets.map((e) => e.name).join(', ')}\n`;
  md += es ? `- Entity set \`${entitySet}\` found; key fields: ${es.keys.join(', ') || 'none declared'}\n\n` : `- **Entity set \`${entitySet}\` NOT found.** The adapter cannot run until the correct service/entity set is chosen (decision D-07).\n\n`;
  md += '| Field the adapter reads | In metadata | EDM type |\n|---|---|---|\n';
  for (const t of table) md += `| \`${t.field}\` | ${t.inMetadata ? 'yes' : '**NO**'} | ${t.edmType} |\n`;
  md += missing.length
    ? `\n**Missing fields (${missing.length}): ${missing.map((m) => m.field).join(', ')}.** Either choose a different released API/view (D-07) or adjust the adapter's field list and mapping with Finance before any data is requested.\n`
    : '\nEvery field the adapter reads is present in the metadata. Next: confirm the amount convention, debit/credit codes and account ranges by reconciliation (runbook step 6).\n';
  const extra = es ? es.properties.filter((p) => !(SELECTED_FIELDS as readonly string[]).includes(p.name)).map((p) => p.name) : [];
  if (extra.length) md += `\nOther properties available in this entity set (not read by the adapter): ${extra.join(', ')}\n`;
  return { md, ok: missing.length === 0 && !!es };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const entity = opt('entity') ?? (await import('../srv/lib/config/app-config.ts')).loadConfig().s4.entitySet;
  let xml: string, source: string;
  if (opt('file')) { xml = readFileSync(resolve(opt('file')!), 'utf8'); source = `file ${opt('file')}`; }
  else if (opt('destination')) {
    const { DestinationTransport } = await import('../srv/lib/providers/s4hana/odata-client.ts');
    const root = (await import('../srv/lib/config/app-config.ts')).loadConfig().s4.serviceRoot;
    const res = await new DestinationTransport(opt('destination')!).get(`${root}/$metadata`, {}, { timeoutMs: 15000, accept: 'xml' });
    if (res.status !== 200) { console.error(`Could not read $metadata (HTTP ${res.status}).`); process.exit(2); }
    xml = res.text; source = `destination ${opt('destination')}`;
  } else { console.error('Usage: node apps/cap/scripts/s4-discover.ts --file metadata.xml | --destination NAME [--entity NAME] [--out file.md]'); process.exit(2); }
  const { md, ok } = renderEvidence(parseMetadata(xml!), entity, source!, new Date().toISOString().slice(0, 10));
  if (opt('out')) writeFileSync(resolve(opt('out')!), md); else console.log(md);
  process.exit(ok ? 0 : 1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
