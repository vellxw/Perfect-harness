/** Trusted runner sources mounted read-only; project code never runs in the control process. */
export const commandDriver = String.raw`
import { cp, readFile, access, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const spec = JSON.parse(await readFile('/spec.json','utf8'));
await cp('/input','/workspace',{recursive:true});
try { await access('/opt/deps/node_modules'); await symlink('/opt/deps/node_modules','/workspace/node_modules'); } catch {}
const cwd=resolve('/workspace',spec.cwd??'.');
if(cwd!=='/workspace'&&!cwd.startsWith('/workspace/'))throw Error('Invalid cwd');
const child=spawn(spec.executable,spec.args,{cwd,stdio:'inherit',env:{...process.env,HOME:'/tmp',PORT:String(spec.port??3000)}});
child.on('error',e=>{console.error(e.message);process.exitCode=127;});
child.on('exit',code=>{process.exitCode=code??137;});
process.on('SIGTERM',()=>child.kill('SIGTERM'));
`;

export const browserDriver = String.raw`
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const spec=JSON.parse(await readFile('/spec.json','utf8'));
const base='http://app:'+spec.port;
const failures=[];const captures=[];const comparisons=[];
let ready=false;
for(let n=0;n<120;n++){
  try{const response=await fetch(base+spec.readyPath,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
}
if(!ready)throw Error('Runtime did not become healthy');
const browser=await chromium.launch({headless:true});
try{
  for(const viewport of spec.viewports){
    const label=viewport.width+'x'+viewport.height;
    const context=await browser.newContext({viewport,deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC',colorScheme:'light'});
    await context.tracing.start({screenshots:true,snapshots:true,sources:false});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    try{
      await page.goto(base+spec.path,{waitUntil:'networkidle',timeout:30000});
      await page.evaluate(()=>document.fonts.ready);
      for(const action of spec.actions){
        const locator=page.locator(action.selector);
        if(action.type==='click')await locator.click();
        if(action.type==='fill')await locator.fill(action.value);
        if(action.type==='expectText'&&!(await locator.innerText()).includes(action.value))throw Error('Text assertion: '+action.selector);
        if(action.type==='expectVisible'&&!(await locator.isVisible()))throw Error('Visibility assertion: '+action.selector);
      }
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      if(overflow)failures.push('Horizontal overflow at '+label);
      const frames=spec.frames.length?spec.frames:[null];
      for(const frame of frames){
        if(frame!==null)await page.evaluate(f=>{if(typeof window.__perfectSeek!=='function')throw Error('Animation requires window.__perfectSeek(frame)');return window.__perfectSeek(f);},frame);
        const name=label+(frame===null?'':'-frame-'+frame)+'.png';
        await page.screenshot({path:'/output/'+name,fullPage:true,animations:frame===null?'disabled':'allow'});captures.push(name);
      }
      if(errors.length>spec.maxConsoleErrors)failures.push('Console errors at '+label+': '+errors.join('; '));
    }catch(e){failures.push(label+': '+e.message);}
    finally{await context.tracing.stop({path:'/output/'+label+'.trace.zip'});await context.close();}
  }
  for(let i=0;i<Math.min(captures.length,spec.targetFiles.length);i++){
    const sha=b=>createHash('sha256').update(b).digest('hex');
    comparisons.push({actual:captures[i],target:spec.targetFiles[i],identicalBytes:sha(await readFile('/output/'+captures[i]))===sha(await readFile('/targets/'+i+'.png'))});
  }
}finally{await browser.close();}
await writeFile('/output/browser-report.json',JSON.stringify({failures,captures,comparisons},null,2));
console.log(JSON.stringify({failures,captures,comparisons}));
process.exitCode=failures.length?1:0;
`;

export const remotionDriver = String.raw`
import { cp, readFile, writeFile, access, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
const spec=JSON.parse(await readFile('/spec.json','utf8'));
await cp('/input','/workspace',{recursive:true});
try{await access('/opt/deps/node_modules');await symlink('/opt/deps/node_modules','/workspace/node_modules');}catch{}
const require=createRequire('/workspace/package.json');
const {bundle}=require('@remotion/bundler');
const {selectComposition,renderStill,renderMedia}=require('@remotion/renderer');
const serveUrl=await bundle({entryPoint:'/workspace/'+spec.entry});
const composition=await selectComposition({serveUrl,id:spec.composition});
for(const field of ['fps','durationInFrames','width','height']){
  const expected=field==='durationInFrames'?spec.durationFrames:spec[field];
  if(composition[field]!==expected)throw Error('Composition '+field+' does not meet acceptance criteria');
}
for(const frame of spec.frames){
  if(frame>=composition.durationInFrames)throw Error('Frame outside duration');
  await renderStill({serveUrl,composition,frame,output:'/output/frame-'+frame+'.png'});
}
await renderMedia({serveUrl,composition,codec:'h264',outputLocation:'/output/video.mp4'});
await writeFile('/output/remotion-report.json',JSON.stringify({composition,frames:spec.frames},null,2));
`;
