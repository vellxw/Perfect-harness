import fs from 'node:fs';
let source=fs.readFileSync('scripts/desktop-smoke.mjs','utf8');
const before="const previous=snapshot.snapshot;";
if(!source.includes(before))throw Error('Diagnostic anchor missing');
source=source.replace(before,`const properties=await session.winapp(['get-property','MessageInput','--property','IsPassword']);
 await writeFile(join(out,'password-property.json'),JSON.stringify(properties,null,2));console.log('SYNTHETIC_PASSWORD_PROPERTY',JSON.stringify(properties));
 const previous=snapshot.snapshot;`);
fs.writeFileSync('scripts/.desktop-smoke-diagnostic.mjs',source);
await import('./.desktop-smoke-diagnostic.mjs');
