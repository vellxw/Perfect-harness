export {browserDriver} from './browser-driver.js';
/** Trusted sources run inside the sandbox, never in the credential-bearing control process. */
export const commandDriver=String.raw`
import {cp,readFile,access,symlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const spec=JSON.parse(await readFile('/spec.json','utf8'));
await cp('/input','/workspace',{recursive:true});
try{await access('/opt/deps/node_modules');await symlink('/opt/deps/node_modules','/workspace/node_modules');}catch{}
const cwd=resolve('/workspace',spec.cwd??'.');if(cwd!=='/workspace'&&!cwd.startsWith('/workspace/'))throw Error('Invalid cwd');
const child=spawn(spec.executable,spec.args,{cwd,stdio:'inherit',env:{...process.env,HOME:'/tmp',PORT:String(spec.port??3000)}});
child.on('error',error=>{console.error(error.message);process.exitCode=127;});child.on('exit',code=>{process.exitCode=code??137;});process.on('SIGTERM',()=>child.kill('SIGTERM'));
`;
export const remotionDriver=String.raw`
import {cp,readFile,writeFile,access,symlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
const spec=JSON.parse(await readFile('/spec.json','utf8'));await cp('/input','/workspace',{recursive:true});
try{await access('/opt/deps/node_modules');await symlink('/opt/deps/node_modules','/workspace/node_modules');}catch{}
const require=createRequire('/workspace/package.json');
const {bundle}=require('@remotion/bundler'),{selectComposition,renderStill,renderMedia}=require('@remotion/renderer');
const serveUrl=await bundle({entryPoint:'/workspace/'+spec.entry});
const composition=await selectComposition({serveUrl,id:spec.composition});
for(const field of ['fps','durationInFrames','width','height']){const expected=field==='durationInFrames'?spec.durationFrames:spec[field];if(composition[field]!==expected)throw Error('Composition '+field+' does not meet acceptance criteria');}
for(const frame of spec.frames){if(frame>=composition.durationInFrames)throw Error('Frame outside duration');await renderStill({serveUrl,composition,frame,output:'/output/frame-'+frame+'.png'});}
await renderMedia({serveUrl,composition,codec:'h264',outputLocation:'/output/video.mp4'});
await writeFile('/output/remotion-report.json',JSON.stringify({composition,frames:spec.frames},null,2));
`;
