import type { Goal, GoalState } from './model.js';
import { now } from './util.js';
const edges:Record<GoalState,GoalState[]> = {
  RECEIVED:['UNDERSTAND'], UNDERSTAND:['DISCOVER'], DISCOVER:['PLAN'],
  PLAN:['DECOMPOSE'], DECOMPOSE:['ASSIGN','PLAN'], ASSIGN:['EXECUTE','VERIFY'],
  EXECUTE:['ASSIGN','VERIFY','REPAIR','REPLAN'], VERIFY:['REVIEW','REPAIR','REPLAN'],
  REVIEW:['JUDGE','REPAIR','REPLAN'], JUDGE:['DONE','REPAIR','REPLAN'],
  REPAIR:['ASSIGN','REPLAN'], REPLAN:['DECOMPOSE','ASSIGN'],
  PAUSED:['UNDERSTAND','DISCOVER','PLAN','DECOMPOSE','ASSIGN','VERIFY','REVIEW','REPLAN'],
  DONE:[], FAILED:[], ABORTED:[],
};
export const terminal = (state:GoalState) => ['DONE','FAILED','ABORTED'].includes(state);
export function transition(goal:Goal,next:GoalState,reason?:string):Goal {
  if (goal.state === next) return goal;
  if (terminal(goal.state)) throw new Error(`Terminal goal cannot transition: ${goal.state}`);
  if (!['PAUSED','FAILED','ABORTED'].includes(next) && !edges[goal.state].includes(next)) throw new Error(`Illegal transition ${goal.state} -> ${next}`);
  if (next === 'DONE' && reason !== 'evidence-judge-approved') throw new Error('Only evidence Judge can complete a goal');
  return {...goal,state:next,updatedAt:now(),pauseReason:next==='PAUSED'?reason:undefined,terminalReason:terminal(next)?reason:undefined};
}
