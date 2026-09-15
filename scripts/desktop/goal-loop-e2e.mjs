import {_electron as electron} from 'playwright';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=await mkdtemp(join(tmpdir(),'perfect-v5-goal-loop-'));
const home=join(root,'state'),workspace=join(root,'workspace'),out=resolve(process.env.PERFECT_ARTIFACT_DIR??'test-results/desktop/goal-loop');
await mkdir(home,{recursive:true});await mkdir(workspace,{recursive:true});await mkdir(out,{recursive:true});
await writeFile(join(workspace,'README.md'),'# Workspace anfitrión\nLa demostración se ejecuta en su propio fixture temporal.\n');
const app=await electron.launch({args:[resolve('desktop'),'--home',home,'--workspace',workspace],recordVideo:{dir:join(out,'video'),size:{width:1440,height:900}},timeout:30000});
const page=await app.firstWindow();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
const frame=async name=>page.screenshot({path:join(out,name+'.png')});
async function boot(){return page.evaluate(()=>window.perfect.boot());}
async function waitState(expected,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){const b=await boot();if(b.snapshot.goal?.state===expected)return b;await page.waitForTimeout(250);}throw Error('Goal did not reach '+expected+'; current='+JSON.stringify((await boot()).snapshot.goal));}
try{
  await page.locator('.connection').filter({hasText:'Motor conectado'}).waitFor({timeout:30000});
  await frame('01-home');
  await page.getByRole('button',{name:'Probar el Goal Loop',exact:true}).click();
  const confirm=page.getByRole('dialog');await confirm.getByLabel('Confirmación').fill('DEMOSTRAR');await confirm.getByRole('button',{name:'Confirmar',exact:true}).click();
  const paused=await waitState('PAUSED',60000);
  assert.match(paused.snapshot.goal.reason??'',/PLAN_APPROVAL/i);
  await frame('02-plan-approval-required');
  await page.getByRole('button',{name:'Revisar plan',exact:true}).click();
  await page.getByRole('heading',{name:'Plan',exact:true}).waitFor();
  await frame('03-plan');
  await page.getByRole('button',{name:'Aprobar plan',exact:true}).click();
  const approve=page.getByRole('dialog');await approve.getByLabel('Confirmación').fill('APROBAR');await approve.getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.getByRole('button',{name:'Trabajo',exact:true}).click();
  await page.getByRole('button',{name:'Reanudar',exact:true}).click();
  const done=await waitState('DONE',240000);
  assert.equal(done.snapshot.goal.state,'DONE');assert.ok(done.snapshot.verification.passed>=2,JSON.stringify(done.snapshot.verification));
  await frame('04-done');
  await page.getByRole('button',{name:'Ver cambios',exact:true}).click();
  await page.getByRole('heading',{name:'Cambios',exact:true}).waitFor();await frame('05-diff');
  await page.getByRole('button',{name:'Aplicar al proyecto',exact:true}).click();
  const apply=page.getByRole('dialog');await apply.getByLabel('Confirmación').fill('APLICAR');await apply.getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.waitForTimeout(500);
  assert.deepEqual(pageErrors,[]);
  const first=await boot();const goalId=first.snapshot.goal.id,demoWorkspace=first.snapshot.workspace;
  await writeFile(join(out,'result.json'),JSON.stringify({passed:true,goalId,demoWorkspace,state:first.snapshot.goal.state,verification:first.snapshot.verification,sourceCommit:first.build.sourceCommit,kind:'real Perfect controller/scheduler/files/Docker/browser/repair/Judge; providers synthetic and explicitly labelled'},null,2));
  await app.close();
  const second=await electron.launch({args:[resolve('desktop'),'--home',home,'--workspace',demoWorkspace],timeout:30000});
  const reopened=await second.firstWindow();await reopened.locator('.connection').filter({hasText:'Motor conectado'}).waitFor({timeout:30000});
  const persisted=await reopened.evaluate(()=>window.perfect.boot());assert.equal(persisted.snapshot.goal?.id,goalId);assert.equal(persisted.snapshot.goal?.state,'DONE');
  await reopened.screenshot({path:join(out,'06-reopened.png')});await second.close();
  const {SqliteStore}=await import('../../dist/adapters/sqlite/store.js');const db=new SqliteStore(join(home,'state.sqlite'));
  try{
    const failures=db.list('failures',goalId),events=db.events(goalId),verifications=db.list('verifications',goalId),reviews=db.list('reviews',goalId);
    assert.ok(failures.length>=1,'Expected deliberate verifier failure');assert.ok(failures.some(f=>f.resolvedAt),'Expected a resolved failure');
    assert.ok(events.some(e=>e.type==='judge.decided'),'Judge did not decide');assert.ok(verifications.some(v=>v.status==='failed'),'No failing verifier attempt was recorded');assert.ok(verifications.some(v=>v.status==='passed'),'No passing verifier attempt was recorded after repair');assert.ok(reviews.some(r=>r.decision==='approve'),'No acceptance review approved');
    await writeFile(join(out,'controller-evidence.json'),JSON.stringify({failures:failures.map(f=>({id:f.id,category:f.category,resolvedAt:f.resolvedAt})),verifications:verifications.map(v=>({id:v.id,specId:v.specId,status:v.status,revision:v.revision})),reviews:reviews.map(r=>({id:r.id,role:r.role,decision:r.decision,purpose:r.purpose})),judgeEvents:events.filter(e=>e.type==='judge.decided')},null,2));
  } finally {db.close();}
} catch(error){await frame('failure').catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify({error:String(error),body:await page.locator('body').innerText().catch(()=>''),pageErrors},null,2));try{await app.close();}catch{}throw error;
} finally {await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
