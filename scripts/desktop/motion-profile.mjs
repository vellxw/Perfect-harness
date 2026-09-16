import {_electron as electron} from 'playwright';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

// Diagnostic experiment, not an acceptance bypass. Compare identical real UI
// interactions with/without screencast and one explicitly labeled CSS hypothesis.
// Production files, motion preferences and security settings remain unchanged.
const output=resolve(process.env.PERFECT_MOTION_REPORT??'test-results/desktop/motion-diagnosis');
const root=await mkdtemp(join(tmpdir(),'perfect-motion-profile-'));
await mkdir(output,{recursive:true});
const identity=JSON.parse(await readFile('desktop/build-info.json','utf8'));
const report={...identity,kind:'DIAGNOSTIC_NOT_ACCEPTANCE',cases:[],errors:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(values,p)=>{const s=[...values].sort((a,b)=>a-b);return s[Math.max(0,Math.ceil(s.length*p)-1)]??null;};
let app;
try{
 const workspace=join(root,'project');await mkdir(workspace);await writeFile(join(workspace,'README.md'),'# Datos sintéticos para perfilar la interfaz\n');
 for(const [variant,record]of[['normal',false],['no-full-window-backdrop-blur',false],['normal',true],['no-full-window-backdrop-blur',true]]){
  const id=variant+'-'+(record?'recorded':'unrecorded'),home=join(root,id);await mkdir(home);
  app=await electron.launch({args:[resolve('desktop'),'--home',home,'--workspace',workspace],timeout:30000,...(record?{recordVideo:{dir:join(output,id),size:{width:1440,height:900}}}:{})});
  const page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.locator('.connection').filter({hasText:'Motor conectado'}).waitFor({timeout:30000});
  assert.equal((await page.evaluate(()=>window.perfect.boot())).buildId,identity.sourceCommit);
  if(variant!=='normal')await app.evaluate(async({BrowserWindow})=>{await BrowserWindow.getAllWindows()[0].webContents.insertCSS('.modal::backdrop { backdrop-filter: none !important; }');});
  await page.evaluate(()=>{
   const state={active:true,phase:'quiet',samples:[],longFrames:[],longTasks:[],observers:[]};window.__perfectMotionDiagnosis=state;
   let before,previousPhase;
   const frame=time=>{if(!state.active)return;const animated=document.getAnimations().some(a=>a.playState==='running');if(before!==undefined&&previousPhase===state.phase)state.samples.push({dt:time-before,phase:state.phase,animated});before=time;previousPhase=state.phase;requestAnimationFrame(frame);};requestAnimationFrame(frame);
   for(const [type,key]of[['long-animation-frame','longFrames'],['longtask','longTasks']])if(PerformanceObserver.supportedEntryTypes.includes(type)){const observer=new PerformanceObserver(entries=>{for(const e of entries.getEntries())state[key].push({phase:state.phase,start:e.startTime,duration:e.duration,blockingDuration:e.blockingDuration,renderStart:e.renderStart,styleAndLayoutStart:e.styleAndLayoutStart,scripts:e.scripts?.map(s=>({functionName:s.sourceFunctionName,url:s.sourceURL,duration:s.duration,forcedStyleAndLayoutDuration:s.forcedStyleAndLayoutDuration}))});});observer.observe({type,buffered:false});state.observers.push(observer);}
  });
  await sleep(2000);
  const phase=name=>page.evaluate(name=>{window.__perfectMotionDiagnosis.phase=name;},name);
  const open=()=>page.getByRole('button',{name:'Abrir comandos y navegación'}).click();
  const navigate=async name=>{await open();await page.getByRole('textbox',{name:'Buscar sección'}).fill(name);await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();await page.getByRole('textbox',{name:'Buscar sección'}).waitFor({state:'hidden'});};
  await phase('palette-animation');
  for(let i=0;i<20;i++){await open();await sleep(240);await page.keyboard.press('Escape');await sleep(100);}
  await phase('model-form');await navigate('Perfiles y modelos');
  for(let i=0;i<12;i++){await page.getByRole('button',{name:'Cambiar modelo',exact:true}).first().click();await page.getByLabel('Modelo exacto',{exact:true}).waitFor();await sleep(240);await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await sleep(120);}
  await phase('skills-scroll');await navigate('Habilidades');
  for(let i=0;i<20;i++){await page.locator('main').hover();await page.mouse.wheel(0,i%2?-500:500);await sleep(160);}
  await phase('finished');await sleep(200);
  const raw=await page.evaluate(()=>{const s=window.__perfectMotionDiagnosis;s.active=false;for(const o of s.observers)o.disconnect();return {samples:s.samples,longFrames:s.longFrames,longTasks:s.longTasks,display:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},motion:document.querySelector('[data-motion]')?.getAttribute('data-motion'),backdrop:getComputedStyle(document.querySelector('dialog')??document.body,'::backdrop').backdropFilter};});
  const result={id,recorded:record,variant,phases:Object.fromEntries([...new Set(raw.samples.map(x=>x.phase))].filter(p=>p!=='finished').map(p=>{const v=raw.samples.filter(s=>s.phase===p).map(s=>s.dt),active=raw.samples.filter(s=>s.phase===p&&s.animated).map(s=>s.dt);return [p,{frames:v.length,p50Ms:percentile(v,.5),p95Ms:percentile(v,.95),over34ms:v.filter(n=>n>34).length,animationFrames:active.length,animationP95Ms:percentile(active,.95)}];})),raw};
  report.cases.push(result);console.log(JSON.stringify({id,phases:result.phases,longFrames:raw.longFrames.length,longTasks:raw.longTasks.length}));
  await page.screenshot({path:join(output,id+'.png')});
  await app.close();app=undefined;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
 }
 assert.deepEqual(report.errors,[]);
 report.completed=true;
} catch(error){report.error=String(error);throw error;}
finally{if(app)await app.close().catch(()=>{});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await rm(root,{recursive:true,force:true,maxRetries:6});}
