export { browserDriver } from "./browser-driver.js";
/** Trusted sources run inside the sandbox, never in the credential-bearing control process. */
export const commandDriver = String.raw`
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
export const remotionDriver = String.raw`
import {cp,readFile,writeFile,access,symlink,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const spec=JSON.parse(await readFile('/spec.json','utf8'));await cp('/input','/workspace',{recursive:true});
try{await access('/opt/deps/node_modules');await symlink('/opt/deps/node_modules','/workspace/node_modules');}catch{}
const require=createRequire('/workspace/package.json');
const {bundle}=require('@remotion/bundler'),{selectComposition,renderStill,renderMedia,getVideoMetadata}=require('@remotion/renderer');
// No browser downloads during verification: use a browser from the explicitly prepared image.
let browserExecutable;
for(const folder of (await readdir('/ms-playwright')).filter(n=>n.startsWith('chromium-')).sort().reverse()){
  for(const suffix of ['chrome-linux64/chrome','chrome-linux/chrome']){
    const candidate=join('/ms-playwright',folder,suffix);try{await access(candidate);browserExecutable=candidate;break;}catch{}
  }
  if(browserExecutable)break;
}
if(!browserExecutable)throw Error('Prepared render image has no approved Chromium executable');
const logs=[],onBrowserLog=log=>{if(log.type==='error')logs.push(log.text);};
const serveUrl=await bundle({entryPoint:'/workspace/'+spec.entry,outDir:'/tmp/remotion-bundle',enableCaching:false});
const common={serveUrl,browserExecutable,inputProps:spec.inputProps??{},onBrowserLog};
const composition=await selectComposition({...common,id:spec.composition});
for(const field of ['fps','durationInFrames','width','height']){const expected=field==='durationInFrames'?spec.durationFrames:spec[field];if(composition[field]!==expected)throw Error('Composition '+field+' does not meet acceptance criteria');}
for(const frame of spec.frames){if(frame>=composition.durationInFrames)throw Error('Frame outside duration');await renderStill({...common,composition,frame,output:'/output/frame-'+frame+'.png'});}
await renderMedia({...common,composition,codec:'h264',concurrency:1,outputLocation:'/output/video.mp4'});
const metadata=await getVideoMetadata('/output/video.mp4');
if(metadata.width!==spec.width||metadata.height!==spec.height||Math.abs(metadata.fps-spec.fps)>0.01||Math.abs(metadata.durationInSeconds-spec.durationFrames/spec.fps)>1/spec.fps)
  throw Error('Encoded video metadata does not match the acceptance contract');
if(logs.length)throw Error('Browser console errors during rendering: '+logs.join('; '));
await writeFile('/output/remotion-report.json',JSON.stringify({composition,frames:spec.frames,metadata,browserExecutable,logs},null,2));
`;
