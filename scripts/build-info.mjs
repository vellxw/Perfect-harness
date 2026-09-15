import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync}from'node:child_process';
const pkg=JSON.parse(await readFile('package.json','utf8'));let sourceCommit='unknown';
try{const actual=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(/^[a-f0-9]{40}$/.test(actual))sourceCommit=actual;}catch{}
let dirty=false;try{dirty=Boolean(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim());}catch{}
await mkdir('dist',{recursive:true});await writeFile('dist/build-info.json',JSON.stringify({version:pkg.version,sourceCommit,dirty,node:process.version,pi:pkg.dependencies['@earendil-works/pi-coding-agent'],opentui:pkg.dependencies['@opentui/core'],three:pkg.dependencies.three,generatedBy:'scripts/build-info.mjs'},null,2)+'\n');
console.log(`Build ${pkg.version} from ${sourceCommit}${dirty?' (working tree has changes)':''}`);
