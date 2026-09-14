import type { Failure, PlanProposal, Task } from '../domain/model.js';
import { hash } from '../domain/util.js';
export function failureSignature(check:string,message:string):{signature:string;normalized:string}{
  const normalized=message.replace(/\u001b\[[0-9;]*m/g,'').replace(/\b\d{4}-\d\d-\d\dT[^\s]+/g,'<time>').replace(/localhost:\d+|127\.0\.0\.1:\d+/g,'localhost:<port>').replace(/perfect-[a-z-]+[0-9a-f-]{12,}/g,'<workspace>').trim();
  return {signature:hash([check,normalized]),normalized};
}
export function escalation(occurrences:number,critical:boolean,maxSameFailureRetries:number):'worker'|'planner'|'oracle'{
  if(critical||occurrences>maxSameFailureRetries+2)return 'oracle';
  return occurrences>maxSameFailureRetries?'planner':'worker';
}
export function needsOracle(plan:PlanProposal,tasks:Task[],finalFeatureReview=true):boolean{
  const critical=/\b(auth|authorization|authentication|payments?|webhooks?|migrations?|concurrency|transactions?|integrity|autorizaci[oó]n|autenticaci[oó]n|pagos?|migraci[oó]n|concurrencia|integridad)\b/i;
  return finalFeatureReview||tasks.some(t=>['high','critical'].includes(t.riskLevel))||critical.test([plan.summary,...plan.risks,...tasks.map(t=>t.description)].join(' '));
}
export function classifyFailure(message:string):Failure['category']{
  if(/AUTH|401|403|429|quota|QUOTA|MODEL_|REASONING_|ROUTE_|provider|rate.?limit/i.test(message))return 'provider';
  if(/SANDBOX|docker|ENOENT|dependency|not installed/i.test(message))return 'environment';
  if(/DENIED|PROTECTED|OWNERSHIP|PRIVACY|APPROVAL|BUDGET/i.test(message))return 'policy';
  if(/visual|screenshot|overflow|console error/i.test(message))return 'visual';
  if(/conflict|merge/i.test(message))return 'integration';
  return 'implementation';
}
