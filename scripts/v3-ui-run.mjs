import fs from 'node:fs';
let source=fs.readFileSync('scripts/v3-connect-ui.mjs','utf8');
for(const [before,after] of [
 ['  const activate = (row: Row) => {','  const activate = (row: Row | undefined) => {'],
 ['if (screen === "integrations") { const intent = integrationRowIntent(row.id, s);','if (row && screen === "integrations") { const intent = integrationRowIntent(row.id, s);'],
 ['export type Screen = "integrations" |','export type Screen = "integrations"']
]){if(!source.includes(before))throw Error('Migration anchor missing: '+before);source=source.replaceAll(before,after);}
fs.writeFileSync('scripts/.v3-connect-ui-runtime.mjs',source);
await import('./.v3-connect-ui-runtime.mjs');
const path='src/integrations/credentials.ts';let credentials=fs.readFileSync(path,'utf8');
if(!credentials.includes('let bytes=Buffer.from(stored.data,"base64");'))throw Error('Buffer anchor missing');
fs.writeFileSync(path,credentials.replace('let bytes=Buffer.from(stored.data,"base64");','let bytes: Buffer=Buffer.from(stored.data,"base64");'));
const desktop='src/integrations/desktop/session.ts';let native=fs.readFileSync(desktop,'utf8');
const start=native.indexOf('    const properties = (await this.winapp(['),end=native.indexOf('    let command: string[];',start);
if(start<0||end<0)throw Error('Password safety anchor missing');
fs.writeFileSync(desktop,'import { assertNonPasswordControl } from "./password.js";\n'+native.slice(0,start)+'    await assertNonPasswordControl((await desktopBinaries()).guard, this.work, this.grant, element, this.signal);\n'+native.slice(end));
