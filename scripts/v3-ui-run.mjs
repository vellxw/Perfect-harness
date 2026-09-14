import fs from 'node:fs';
let source=fs.readFileSync('scripts/v3-connect-ui.mjs','utf8');
for(const [before,after] of [
 ['  const activate = (row: Row) => {','  const activate = (row: Row | undefined) => {'],
 ['if (screen === "integrations") { const intent = integrationRowIntent(row.id, s);','if (row && screen === "integrations") { const intent = integrationRowIntent(row.id, s);'],
 ['export type Screen = "integrations" |','export type Screen = "integrations"']
]){if(!source.includes(before))throw Error('Migration anchor missing: '+before);source=source.replaceAll(before,after);}
fs.writeFileSync('scripts/.v3-connect-ui-runtime.mjs',source);
await import('./.v3-connect-ui-runtime.mjs');
