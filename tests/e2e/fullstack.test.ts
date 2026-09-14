import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultConfig } from '../../src/config/schema.js';
import { SqliteStore } from '../../src/adapters/sqlite/store.js';
import { DockerRunner } from '../../src/adapters/sandbox/docker.js';
import { createGoal } from '../../src/application/goals.js';
import { Orchestrator } from '../../src/application/orchestrator.js';
import { ReservationDemoRuntime, reservationGoal, seedReservationSource } from '../../src/examples/reservations.js';

const enabled=process.env.PERFECT_TEST_DOCKER==='1';
test('Docker fullstack: real SQLite, real browser, mobile failure, repair, independent roles and DONE',{skip:!enabled,timeout:300000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'perfect-fullstack-')),source=join(root,'source'),home=join(root,'home'),config=defaultConfig();
  await seedReservationSource(source);const store=new SqliteStore(join(home,'state.sqlite'));
  const runtime=new ReservationDemoRuntime(),runner=new DockerRunner(config,store,join(home,'sandbox'));
  let goalId:string|undefined;
  try{
    assert.equal(await runner.available(),true,'Docker is mandatory in this CI job');
    const goal=await createGoal({request:reservationGoal,source,home,config,privacy:'public',mode:'mock'},store);goalId=goal.id;
    const finished=await new Orchestrator(store,runtime,runner).run(goal.id,{acceptPlan:true});
    assert.equal(finished.state,'DONE',finished.pauseReason??finished.terminalReason);
    assert.ok(runtime.maximumParallelWriters>=2,'Frontend and backend must run concurrently');
    for(const role of ['planner','general','frontend','backend','oracle','visual'])assert.ok(runtime.roles.includes(role),`Missing role ${role}`);
    const failures=store.list('verifications',goal.id).filter(v=>v.status==='failed');assert.ok(failures.some(v=>v.specId==='browser'&&v.summary.includes('overflow')));
    assert.ok(store.events(goal.id).some(e=>e.type==='repair.created'));
    assert.equal(store.list('intents',goal.id).filter(i=>i.status!=='completed').length,0);
    if(process.env.PERFECT_ARTIFACT_DIR){
      const out=resolve(process.env.PERFECT_ARTIFACT_DIR);await mkdir(out,{recursive:true});
      for(const e of store.list('evidence',goal.id).filter(e=>e.kind==='screenshot'&&e.revision===finished.candidateRevision))await copyFile(e.artifactRef,join(out,e.artifactRef.split('/').at(-1)!));
      await writeFile(join(out,'fullstack-summary.json'),JSON.stringify({state:finished.state,mode:finished.mode,roles:runtime.roles,maximumParallelWriters:runtime.maximumParallelWriters,iterations:finished.iteration,verifications:store.list('verifications',goal.id),events:store.events(goal.id).map(e=>({type:e.type,at:e.occurredAt}))},null,2));
    }
  }finally{
    if(goalId)await runner.recover(goalId);store.close();await rm(root,{recursive:true,force:true});
  }
});
