import fs from'node:fs';
const p='scripts/v4-release-source.mjs';let source=fs.readFileSync(p,'utf8');
const line=source.split('\n').find(l=>l.startsWith("change('scripts/package-windows.ps1',\"@{version="));if(!line)throw Error('Expected obsolete metadata patch');source=source.replace(line,'// Complete version/commit manifest comes from dist/build-info.json.');fs.writeFileSync(p,source);await import('./v4-release-source.mjs');
const path='src/cli/main.ts',text=fs.readFileSync(path,'utf8'),before='.version("0.3.0")';if(text.split(before).length!==2)throw Error('Unexpected CLI version source');fs.writeFileSync(path,text.replace(before,'.version(JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")).version)'));
