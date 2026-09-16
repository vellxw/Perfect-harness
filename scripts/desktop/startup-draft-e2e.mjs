import {_electron as electron} from 'playwright';
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

// The real core process is suspended before startup, not replaced by a UI fake.
// Only the child whose complete command includes this owned temporary home is touched.
if(process.platform!=='linux')throw Error('This process-suspension regression runs on Linux');
const root=await mkdtemp(join(tmpdir(),'perfect-draft-startup-')),home=join(root,'state'),workspace=join(root,'project');
await mkdir(home);await mkdir(workspace);await writeFile(join(workspace,'README.md'),'# Proyecto sintético de arranque\n');
let app,page,pausedPid;
const out=resolve('test-results/desktop/startup-draft');await mkdir(out,{recursive:true});
const report={passed:false,method:'Actual Electron and core; SIGSTOP/SIGCONT only on owned test engine. Draft stays local and is not auto-submitted.',errors:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const launching=electron.launch({args:[resolve('desktop'),'--home',home,'--workspace',workspace],timeout:30000});
 const end=Date.now()+15000;
 while(!pausedPid&&Date.now()<end){
  for(const entry of await readdir('/proc')){
   if(!/^\d+$/.test(entry))continue;
   let args;try{args=(await readFile('/proc/'+entry+'/cmdline','utf8')).split('\0');}catch{continue;}
   if(args.length>=3&&args[1]?.endsWith('/dist/desktop/engine/entry.js')&&args[2]===home){
    const pid=Number(entry);process.kill(pid,'SIGSTOP');pausedPid=pid;break;
   }
  }
  if(!pausedPid)await delay(10);
 }
 app=await launching;
 assert.ok(pausedPid,'Owned engine was not suspended; no simulated success');
 page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(String(e)));
 const field=page.getByRole('textbox',{name:'¿Qué querés construir?',exact:true});
 await field.waitFor({state:'visible',timeout:8000});assert.equal(await field.isEnabled(),true);
 const before=await page.evaluate(()=>window.perfect.boot());
 assert.equal(before.connected,false);assert.equal(before.snapshot,undefined);
 assert.notEqual(before.workspaceId,'unselected');
 const value='Crear una aplicación con revisión visual ñ y PostgreSQL cuando lo necesite';
 await field.fill(value);await field.press('Control+Enter');
 assert.equal(await page.getByRole('button',{name:'Esperando al motor',exact:true}).isDisabled(),true);
 assert.equal(await field.inputValue(),value);
 await page.screenshot({path:join(out,'draft-before-engine.png')});
 process.kill(pausedPid,'SIGCONT');pausedPid=undefined;
 await page.locator('.connection').filter({hasText:'Motor conectado'}).waitFor({timeout:30000});
 assert.equal(await field.inputValue(),value,'Hydration discarded the typed draft');
 const ready=await page.evaluate(()=>window.perfect.boot());assert.equal(ready.workspaceId,before.workspaceId);assert.equal(ready.snapshot.goal,undefined);
 await page.getByRole('button',{name:'Habilidades',exact:true}).click();
 await page.getByRole('button',{name:'Trabajo',exact:true}).click();
 assert.equal(await field.inputValue(),value,'Navigation discarded the typed draft');
 await page.screenshot({path:join(out,'draft-after-engine.png')});
 assert.deepEqual(report.errors,[]);report.passed=true;report.version=ready.version;report.sourceCommit=ready.buildId;
 console.log('PASS: real editable startup draft survived core hydration and navigation; no automatic goal or inferred state');
}finally{
 if(pausedPid){try{process.kill(pausedPid,'SIGCONT');}catch{}}
 if(app)await app.close().catch(e=>report.errors.push(String(e)));
 await writeFile(join(out,'result.json'),JSON.stringify(report,null,2));
 await rm(root,{recursive:true,force:true,maxRetries:6});
}
