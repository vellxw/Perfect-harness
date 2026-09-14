import fs from 'node:fs';
const path='src/integrations/desktop/session.ts';let source=fs.readFileSync(path,'utf8');
const start=source.indexOf('    const properties = await this.winapp([');
const end=source.indexOf('    let command: string[];',start);
if(start<0||end<0)throw Error('Password safety anchor missing');
source='import { assertNonPasswordControl } from "./password.js";\n'+source.slice(0,start)+'    await assertNonPasswordControl((await desktopBinaries()).guard, this.work, this.grant, element, this.signal);\n'+source.slice(end);
fs.writeFileSync(path,source);
await import('./desktop-smoke.mjs');
