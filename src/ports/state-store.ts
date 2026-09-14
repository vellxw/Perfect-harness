import type { AgentRun, Approval, Attempt, ContextPackage, Event, Evidence, Failure, FileOwnership, Goal, OperationIntent, Plan, Review, Task, Usage, VerificationResult } from '../domain/model.js';
export interface BudgetReservation {id:string;goalId:string;runId:string;tokens:number;estimatedCost?:number;status:'held'|'settled'|'unknown';createdAt:string}
export interface DependencyImage {id:string;goalId:string;manifestHash:string;baseImage:string;tag:string;imageId:string;createdAt:string}
export interface EntityMap {goals:Goal;plans:Plan;tasks:Task;runs:AgentRun;contexts:ContextPackage;evidence:Evidence;verifications:VerificationResult;failures:Failure;usage:Usage;ownership:FileOwnership;reviews:Review;approvals:Approval;intents:OperationIntent;attempts:Attempt;reservations:BudgetReservation;dependencyImages:DependencyImage}
export type Collection=keyof EntityMap;
export interface StateStore {
  get<K extends Collection>(kind:K,id:string):EntityMap[K]|undefined;
  list<K extends Collection>(kind:K,goalId?:string):EntityMap[K][];
  put<K extends Collection>(kind:K,value:EntityMap[K],eventType:string,actor?:string):void;
  transaction<T>(fn:()=>T):T;
  event(goalId:string,type:string,payload:unknown,actor?:string):void;
  events(goalId:string,after?:number):Event[];
  lock(workspaceId:string,owner:string,pid:number):void;
  unlock(workspaceId:string,owner:string):void;
  close():void;
}
