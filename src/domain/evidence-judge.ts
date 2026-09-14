import type { Evidence, Goal, Plan, Review, Task, VerificationResult } from './model.js';
export interface Judgment {done:boolean;reasons:string[]}
export function judge(input:{goal:Goal;plan:Plan;tasks:Task[];evidence:Evidence[];results:VerificationResult[];reviews:Review[];requiredReviews:('oracle'|'visual')[];artifactsValid:boolean;routingValid:boolean;humanApprovedIds?:string[]}):Judgment {
  const {goal,plan,tasks,evidence,results,reviews}=input;const reasons:string[]=[];
  if(!goal.candidateRevision)reasons.push('Missing candidate revision');
  if(!input.artifactsValid)reasons.push('Evidence artifacts missing or modified');
  if(!input.routingValid)reasons.push('Route integrity not verified');
  if(!tasks.length||tasks.some(t=>!['accepted','superseded'].includes(t.status)))reasons.push('Necessary tasks remain unfinished');
  const valid=evidence.filter(e=>e.validity==='valid'&&e.revision===goal.candidateRevision&&e.goalId===goal.id);
  for(const spec of plan.verification.filter(s=>s.mandatory)){
    const result=results.filter(r=>r.goalId===goal.id&&r.specId===spec.id&&r.revision===goal.candidateRevision).at(-1);
    if(!result||result.status!=='passed'||!result.evidenceIds.length||result.evidenceIds.some(eid=>!valid.some(e=>e.id===eid&&e.producer==='runner')))reasons.push(`Verification not passed with current evidence: ${spec.id}`);
  }
  for(const criterion of plan.criteria.filter(c=>c.mandatory)){
    if(criterion.kind==='human'){
      if(!input.humanApprovedIds?.includes(criterion.id))reasons.push(`Human approval required: ${criterion.id}`);
    }else if(!valid.some(e=>e.criteriaIds.includes(criterion.id)&&e.producer==='runner'))reasons.push(`No runner evidence for: ${criterion.id}`);
  }
  for(const role of input.requiredReviews){
    const review=reviews.filter(r=>r.role===role&&r.goalId===goal.id&&r.revision===goal.candidateRevision).at(-1);
    if(!review||review.decision!=='approve'||review.findings.some(f=>['major','critical'].includes(f.severity))||!review.evidenceIds.length||review.evidenceIds.some(eid=>!valid.some(e=>e.id===eid&&e.producer==='reviewer')))reasons.push(`Required review not approved: ${role}`);
  }
  return {done:reasons.length===0,reasons};
}
