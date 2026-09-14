import type { StateStore } from '../ports/state-store.js';
import type { ExecutionRunner } from '../ports/execution.js';
import type { Goal } from '../domain/model.js';
import type { PerfectConfig } from '../config/schema.js';
import { GitWorkspace } from '../adapters/git/workspace.js';
import { git } from '../adapters/git/process.js';
import { BudgetManager } from './budget.js';
import { OwnershipManager } from './ownership.js';
import { now, Blocked } from '../domain/util.js';

export async function recoverGoal(goal:Goal,store:StateStore,runner:ExecutionRunner,config:PerfectConfig):Promise<void>{
  // Do not release leases while a previously started process may still be alive.
  await runner.recover(goal.id);
  const workspace=new GitWorkspace(goal.root,config),revision=await workspace.revision();
  for(const intent of store.list('intents',goal.id).filter(i=>i.kind!=='container'&&i.status!=='completed')){
    if(intent.kind==='apply')throw new Blocked('APPLY_UNCERTAIN','An interrupted apply needs explicit inspection of the source checkout');
    if(revision===intent.beforeRevision){store.put('intents',{...intent,status:'completed'},'operation.not_applied');continue;}
    const task=intent.taskId?store.get('tasks',intent.taskId):undefined;
    const message=await git(workspace.repo,['log','-1','--format=%s']);
    if(!task||message!==`Perfect integrate ${task.id}`)throw new Blocked('INTEGRATION_UNCERTAIN','Candidate changed during an interrupted integration');
    const names=(await git(workspace.repo,['diff','--name-only','-z',intent.beforeRevision,revision])).split('\0').filter(Boolean);
    if(names.some(p=>![...task.ownedFiles,...task.ownedSurfaces].some(s=>p===s||p.startsWith(`${s}/`))))throw new Blocked('INTEGRATION_UNCERTAIN','Recovered diff is outside task ownership');
    store.transaction(()=>{
      store.put('tasks',{...task,status:'accepted',resultRevision:revision,updatedAt:now()},'task.recovered');
      store.put('intents',{...intent,status:'completed',afterRevision:revision},'operation.reconciled');
    });
  }
  const budget=new BudgetManager(store,goal.id,config);
  for(const run of store.list('runs',goal.id).filter(r=>r.status==='running')){
    store.put('runs',{...run,status:'interrupted',endedAt:now(),stopReason:'Controller restarted'},'agent.interrupted');budget.interrupt(run.id);
  }
  for(const attempt of store.list('attempts',goal.id).filter(a=>a.status==='running'))store.put('attempts',{...attempt,status:'interrupted',endedAt:now()},'attempt.interrupted');
  for(const task of store.list('tasks',goal.id).filter(t=>t.status==='running')){
    let partial=task.resultRevision;
    if(task.worktreeRef)partial=await workspace.checkpoint(task.worktreeRef,task).catch(()=>partial);
    store.put('tasks',{...task,status:'pending',resultRevision:partial,failureReason:'Interrupted attempt; inspect checkpoint before continuing',updatedAt:now()},'task.recovered');
  }
  const ownership=new OwnershipManager(store);
  for(const lease of store.list('ownership',goal.id).filter(l=>l.status==='held'))ownership.release(lease.id);
  const latest=store.get('goals',goal.id)!;
  store.put('goals',{...latest,candidateRevision:revision,updatedAt:now()},'recovery.completed');
}
