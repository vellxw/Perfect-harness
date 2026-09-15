import fs from'node:fs';
const p='scripts/v4-release-source.mjs';let source=fs.readFileSync(p,'utf8');
const line=source.split('\n').find(l=>l.startsWith("change('scripts/package-windows.ps1',\"@{version="));if(!line)throw Error('Expected obsolete metadata patch');source=source.replace(line,'// The complete version/commit manifest is generated from dist/build-info.json above.');fs.writeFileSync(p,source);await import('./v4-release-source.mjs');
