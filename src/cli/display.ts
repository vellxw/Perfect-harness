import type { Goal } from '../domain/model.js';
import type { StateStore } from '../ports/state-store.js';
export function statusSnapshot(store:StateStore,goal:Goal){
  const tasks=store.list('tasks',goal.id),runs=store.list('runs',goal.id),usage=store.list('usage',goal.id),verifications=store.list('verifications',goal.id).filter(v=>v.revision===goal.candidateRevision);
  const accounts=[...new Set(usage.map(u=>u.accountRef))].map(account=>{
    const records=usage.filter(u=>u.accountRef===account);
    return{account,billingModes:[...new Set(records.map(u=>u.billingMode))],reportedTokens:records.reduce((n,u)=>n+(u.totalTokens??0),0),unknownRequests:records.filter(u=>u.totalTokens===undefined).length,estimatedMeteredUsd:records.some(u=>u.billingMode==='metered'&&u.estimatedCost!==undefined)?records.reduce((n,u)=>n+(u.billingMode==='metered'?u.estimatedCost??0:0),0):null,reportedChargesUsd:records.some(u=>u.reportedCharge!==undefined)?records.reduce((n,u)=>n+(u.reportedCharge??0),0):null};
  });
  return{goal:{id:goal.id,request:goal.originalRequest,state:goal.state,mode:goal.mode,iteration:goal.iteration,revision:goal.candidateRevision,reason:goal.pauseReason??goal.terminalReason,activeMs:goal.activeMs},tasks,running:runs.filter(r=>r.status==='running'),recentRuns:runs.slice(-10),verification:{passed:verifications.filter(v=>v.status==='passed').length,total:verifications.length},oracleCalls:goal.oracleCalls,plannerCalls:goal.plannerCalls,providerRequests:goal.providerRequests,accounts};
}
export function renderStatus(store:StateStore,goal:Goal):string{
  const value=statusSnapshot(store,goal);const lines=[`GOAL ${goal.id}`,goal.originalRequest,`State: ${goal.state} | Mode: ${goal.mode} | Iteration: ${goal.iteration}`,`Candidate: ${goal.candidateRevision}`,`Planner: ${goal.plannerCalls} calls | Oracle: ${goal.oracleCalls} calls | Requests: ${goal.providerRequests}`,''];
  for(const run of value.running){const route=run.routeBinding;lines.push(`RUNNING ${run.taskId??route.id}: ${route.provider}/${route.model} | requested ${route.requestedReasoning} | selected ${route.selectedReasoning}`);}
  for(const task of value.tasks.filter(t=>!['superseded','accepted'].includes(t.status)))lines.push(`${task.status.toUpperCase()} ${task.id}: ${task.title} (${task.attempt}/${task.maxAttempts})`);
  lines.push('',`Verification on current candidate: ${value.verification.passed}/${value.verification.total}`);
  for(const account of value.accounts)lines.push(`${account.account}: ${account.reportedTokens} reported tokens; ${account.unknownRequests} uncertain requests; billed amount ${account.reportedChargesUsd===null?'not reported':`USD ${account.reportedChargesUsd.toFixed(4)}`}`);
  if(goal.pauseReason??goal.terminalReason)lines.push(`Reason: ${goal.pauseReason??goal.terminalReason}`);
  lines.push(`Evidence and report: ${goal.root}`);return lines.join('\n');
}
