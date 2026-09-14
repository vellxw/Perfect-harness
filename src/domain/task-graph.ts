import { PlanProposalSchema, type PlanProposal, type Task } from './model.js';
import { canonical } from './util.js';
export function validatePlan(input:unknown,previous?:PlanProposal):PlanProposal {
  const plan=PlanProposalSchema.parse(input);
  const criteria=new Set(plan.criteria.map(c=>c.id));
  const checks=new Set(plan.verification.map(v=>v.id));
  const ids=new Set(plan.tasks.map(t=>t.id));
  if(criteria.size!==plan.criteria.length||checks.size!==plan.verification.length||ids.size!==plan.tasks.length)throw new Error('Duplicate plan identifiers');
  for(const task of plan.tasks){
    if(task.dependencies.some(d=>!ids.has(d)||d===task.id))throw new Error(`Invalid dependency: ${task.id}`);
    if(task.acceptanceCriteria.some(c=>!criteria.has(c))||task.verificationStrategy.some(c=>!checks.has(c)))throw new Error('Unknown criterion or verification');
    if(task.type==='frontend'&&task.assignedAgent!=='frontend')throw new Error('Frontend must route to frontend specialist');
    if(task.type==='backend'&&task.assignedAgent!=='backend')throw new Error('Backend must route to backend specialist');
    if(task.ownedFiles.length+task.ownedSurfaces.length===0&&task.type!=='discovery')throw new Error(`Task has no ownership: ${task.id}`);
    for(const p of [...task.ownedFiles,...task.ownedSurfaces])validateSurface(p);
  }
  const visited=new Set<string>(),active=new Set<string>();
  const visit=(taskId:string)=>{
    if(active.has(taskId))throw new Error('Task graph contains a cycle');
    if(visited.has(taskId))return;
    active.add(taskId);
    for(const dep of plan.tasks.find(t=>t.id===taskId)!.dependencies)visit(dep);
    active.delete(taskId);visited.add(taskId);
  };
  for(const task of plan.tasks)visit(task.id);
  for(const check of plan.verification)if(check.criteriaIds.some(c=>!criteria.has(c)))throw new Error('Check refers to unknown criterion');
  for(const criterion of plan.criteria.filter(c=>c.mandatory)){
    if(!plan.tasks.some(t=>t.acceptanceCriteria.includes(criterion.id)))throw new Error(`Uncovered criterion: ${criterion.id}`);
    if(criterion.kind!=='human'&&!plan.verification.some(v=>v.mandatory&&v.criteriaIds.includes(criterion.id)))throw new Error(`Unverified criterion: ${criterion.id}`);
  }
  if(previous&&(canonical(previous.criteria)!==canonical(plan.criteria)||canonical(previous.verification)!==canonical(plan.verification)))throw new Error('Replan cannot replace accepted criteria/verifiers');
  return plan;
}
export function validateSurface(path:string):void {
  if(!path||path==='.'||path.startsWith('/')||path.includes('\\')||path.includes(':')||path.includes('\0')||path.split('/').some(p=>!p||p==='.'||p==='..')||/[*?\[\]{}]/.test(path))throw new Error(`Invalid ownership surface: ${path}`);
}
export const overlaps=(a:string,b:string)=>a===b||a.startsWith(`${b}/`)||b.startsWith(`${a}/`);
export function readyTasks(tasks:Task[]):Task[]{return tasks.filter(t=>t.status==='pending'&&t.dependencies.every(d=>tasks.some(other=>other.id===d&&other.status==='accepted'))).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));}
