import type { StateStore } from '../ports/state-store.js';
import type { Failure, Task } from '../domain/model.js';
import { failureSignature, classifyFailure } from './policies.js';
import { id, now } from '../domain/util.js';
export function lineage(task:Task,store:StateStore):string{
  const seen=new Set<string>();let current=task;
  while(current.repairsTaskId){if(seen.has(current.id))throw new Error('Repair lineage cycle');seen.add(current.id);const parent=store.get('tasks',current.repairsTaskId);if(!parent)break;current=parent;}
  return current.id;
}
export function lineageAttempts(task:Task,store:StateStore):number{
  const root=lineage(task,store);return store.list('tasks',task.goalId).filter(t=>lineage(t,store)===root).reduce((total,t)=>total+t.attempt,0);
}
export function recordFailure(store:StateStore,input:{goalId:string;task?:Task;checkId:string;message:string;evidenceIds?:string[];category?:Failure['category']}):Failure{
  const {signature,normalized}=failureSignature(input.checkId,input.message);
  const previous=store.list('failures',input.goalId).filter(f=>f.signature===signature);
  const failure:Failure={id:id('failure'),goalId:input.goalId,taskId:input.task?.id,lineageId:input.task?lineage(input.task,store):input.checkId,category:input.category??classifyFailure(input.message),severity:input.task?.riskLevel==='critical'?'critical':'error',signature,checkId:input.checkId,normalizedError:normalized,evidenceIds:input.evidenceIds??[],occurrences:previous.length+1,escalationLevel:0,createdAt:now()};
  store.put('failures',failure,'failure.recorded');return failure;
}
