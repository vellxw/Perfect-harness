import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteStore } from '../../src/adapters/sqlite/store.js';
import { defaultConfig } from '../../src/config/schema.js';
import { createGoal } from '../../src/application/goals.js';
import { Orchestrator, acceptanceHash } from '../../src/application/orchestrator.js';
import { ScriptedRuntime } from '../fake-provider/scripted.js';
import { NodeFixtureRunner } from '../fixtures/node-runner.js';
import { proposal } from '../fixtures/domain.js';
import { id, now } from '../../src/domain/util.js';

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'perfect-loop-')),source=join(root,'source'),home=join(root,'home');await mkdir(join(source,'tests'),{recursive:true});
  await writeFile(join(source,'tests','answer.test.mjs'),`import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';test('required behavior',async()=>{const value=JSON.parse(await readFile('src/answer.json','utf8'));assert.equal(value.answer,42);});`);
  const config=defaultConfig();config.reviewPolicy.finalFeatureReview=false;
  const plan=proposal();plan.verification[0]!.command!.args=['--test','tests/answer.test.mjs'];
  const store=new SqliteStore(join(home,'state.sqlite'));
  const goal=await createGoal({request:'Produce answer 42 and prove it with the existing test.',source,home,config,privacy:'public',mode:'mock'},store);
  return{root,source,home,config,plan,store,goal};
}
test('real code test fails, creates repair, re-verifies and reaches evidence-based DONE',async()=>{
  const f=await fixture();let writes=0;
  const runtime=new ScriptedRuntime(async request=>{
    if(request.run.agentDefinitionId==='planner')return f.plan;
    writes++;await request.services.writeFile!('src/answer.json',JSON.stringify({answer:writes===1?41:42}));return{summary:'Implementation candidate prepared',outputs:['src/answer.json']};
  });
  try{
    const finished=await new Orchestrator(f.store,runtime,new NodeFixtureRunner()).run(f.goal.id,{acceptPlan:true});
    assert.equal(finished.state,'DONE',finished.terminalReason??finished.pauseReason);assert.equal(writes,2);assert.equal(finished.iteration,2);
    assert.ok(f.store.events(f.goal.id).some(e=>e.type==='verification.failed'));assert.ok(f.store.events(f.goal.id).some(e=>e.type==='repair.created'));
    assert.ok(f.store.list('verifications',f.goal.id).some(v=>v.status==='failed'));assert.equal(f.store.list('verifications',f.goal.id).at(-1)?.status,'passed');
    assert.ok(f.store.list('runs',f.goal.id).every(r=>r.routeBinding.provider==='perfect-mock'));
    await assert.rejects(()=>readFile(join(f.source,'src','answer.json')));
  }finally{f.store.close();await rm(f.root,{recursive:true,force:true});}
});
test('plan approval and resume survive closing SQLite',async()=>{
  const f=await fixture();const runtime=new ScriptedRuntime(async request=>{if(request.run.agentDefinitionId==='planner')return f.plan;await request.services.writeFile!('src/answer.json','{"answer":42}');return{summary:'Prepared the required answer',outputs:['src/answer.json']};});
  let store=f.store;
  try{
    const paused=await new Orchestrator(store,runtime,new NodeFixtureRunner()).run(f.goal.id);assert.equal(paused.state,'PAUSED');assert.match(paused.pauseReason??'',/PLAN_APPROVAL/);
    const plan=store.get('plans',paused.activePlanId!)!;store.put('approvals',{id:id('approval'),goalId:f.goal.id,kind:'plan',scopeHash:acceptanceHash(plan),approvedAt:now(),actor:'user'},'plan.user_authorized');
    store.close();store=new SqliteStore(join(f.home,'state.sqlite'));
    const done=await new Orchestrator(store,runtime,new NodeFixtureRunner()).run(f.goal.id);assert.equal(done.state,'DONE',done.pauseReason??done.terminalReason);
    assert.equal(runtime.invocations.filter(r=>r.run.agentDefinitionId==='planner').length,1);
  }finally{store.close();await rm(f.root,{recursive:true,force:true});}
});
test('user abort cancels the active worker without deleting its workspace',async()=>{
  const f=await fixture();const runtime=new ScriptedRuntime(async request=>{
    if(request.run.agentDefinitionId==='planner')return f.plan;
    await new Promise<void>((_resolve,reject)=>request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true}));return{summary:'Not reachable',outputs:[]};
  });
  try{
    const running=new Orchestrator(f.store,runtime,new NodeFixtureRunner()).run(f.goal.id,{acceptPlan:true});
    for(let i=0;i<100&&!runtime.invocations.some(r=>r.run.agentDefinitionId==='general');i++)await new Promise(r=>setTimeout(r,20));
    const current=f.store.get('goals',f.goal.id)!;f.store.put('goals',{...current,controlRequest:'abort'},'goal.abort_requested','user');
    const aborted=await running;assert.equal(aborted.state,'ABORTED');assert.ok(f.store.list('runs',f.goal.id).some(r=>r.status==='interrupted'));assert.ok(await readFile(join(f.goal.root,'report.json'),'utf8'));
  }finally{f.store.close();await rm(f.root,{recursive:true,force:true});}
});
