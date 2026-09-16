import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

// Diagnostic instrumentation of the test launcher only. Does not warm up or
// alter product UI, disable security, adjust acceptance limits or drop cold-0.
const mode=process.argv.includes('--explicit-executable')?'explicit-executable':'playwright-loader';
const output=resolve('test-results/desktop/startup-profile-'+mode);
await mkdir(output,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'perfect-startup-profile-'));
const workspace=join(root,'project');await mkdir(workspace);
await writeFile(join(workspace,'README.md'),'# Proyecto sintético de diagnóstico de arranque\n');
const identity=JSON.parse(await readFile('desktop/build-info.json','utf8'));
const entries=[];
const originalSpawn=childProcess.spawn;
let current;
childProcess.spawn=function(command,args,options){
 const isElectron=String(command).endsWith('/electron/dist/electron');
 const record=isElectron&&current?{callAt:performance.now()-current.start,events:[]}:undefined;
 if(record)current.spawn=record;
 const child=originalSpawn.call(this,command,args,options);
 if(record){
  record.pid=child.pid;
  child.once('spawn',()=>record.events.push({type:'os-spawn',at:performance.now()-current.start}));
  const started=current.start;
  child.stderr?.on('data',bytes=>{
   const text=String(bytes).replace(/ws:\/\/[^\s]+/g,'[local-debug-endpoint]').slice(0,4000);
   if(record.events.length<50)record.events.push({type:'stderr',at:performance.now()-started,text});
  });
 }
 return child;
};
syncBuiltinESMExports();
const {_electron:electron}=await import('playwright');
let app;
try{
 for(let i=0;i<3;i++){
  const home=join(root,'home-'+i);await mkdir(home);
  current={index:i,mode,start:performance.now(),wallStart:Date.now()};
  app=await electron.launch({args:[resolve('desktop'),'--home',home,'--workspace',workspace],...(mode==='explicit-executable'?{executablePath:resolve('node_modules/electron/dist/electron')}:{}),timeout:30000});
  current.launchResolvedMs=performance.now()-current.start;
  const page=await app.firstWindow();current.firstWindowMs=performance.now()-current.start;
  const field=page.getByRole('textbox',{name:'¿Qué querés construir?',exact:true});await field.waitFor({state:'visible'});assert.equal(await field.isEnabled(),true);
  current.composerMs=performance.now()-current.start;
  current.renderer=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,now:performance.now(),readyState:document.readyState,navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),paint:performance.getEntriesByType('paint').map(e=>e.toJSON())}));
  current.main=await app.evaluate(({app,BrowserWindow})=>({uptime:process.uptime(),wallNow:Date.now(),ready:app.isReady(),windows:BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),loading:w.webContents.isLoading()}))}));
  await field.fill('Borrador de diagnóstico ñ');
  await page.locator('.connection').filter({hasText:'Motor conectado'}).waitFor();
  current.motorReadyMs=performance.now()-current.start;
  const boot=await page.evaluate(()=>window.perfect.boot());assert.equal(boot.buildId,identity.sourceCommit);assert.equal(boot.snapshot.goal,undefined);
  await page.screenshot({path:join(output,`cold-${i}.png`)});
  await app.close();app=undefined;
  entries.push({...current,start:undefined});console.log(JSON.stringify(entries.at(-1)));
 }
}finally{
 if(app)await app.close().catch(()=>{});
 childProcess.spawn=originalSpawn;syncBuiltinESMExports();
 await writeFile(join(output,'report.json'),JSON.stringify({...identity,mode,method:'Diagnostic only. Clock before launcher API, intercepted actual child_process.spawn, main uptime and renderer navigation timing all retained. No first-sample exclusion.',entries},null,2));
 await rm(root,{recursive:true,force:true,maxRetries:5});
}
