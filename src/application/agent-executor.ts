import { join } from 'node:path';
import type { AgentRun, Evidence, Goal, Role, Task, Usage } from '../domain/model.js';
import type { PerfectConfig } from '../config/schema.js';
import type { AgentRuntime, AgentServices, AgentOutput } from '../ports/agent-runtime.js';
import type { StateStore } from '../ports/state-store.js';
import type { ExecutionRunner } from '../ports/execution.js';
import { FileBroker } from '../tools/file-broker.js';
import { fetchReference } from '../tools/research.js';
import { manifest, GitWorkspace } from '../adapters/git/workspace.js';
import { OwnershipManager } from './ownership.js';
import { BudgetManager } from './budget.js';
import { buildContext } from './context.js';
import { Semaphore } from './semaphore.js';
import { id, now, errorText, Blocked } from '../domain/util.js';

export interface Invocation {
  goal:Goal;role:Role;task?:Task;workspace:string;leaseId?:string;
  instruction:string;schema:Record<string,unknown>;parse:(value:unknown)=>unknown;
  evidence?:Evidence[];images?:{data:string;mimeType:string;source:string}[];
}
export class AgentExecutor {
  private accounts=new Map<string,Semaphore>();
  constructor(private store:StateStore,private runtime:AgentRuntime,private runner:ExecutionRunner,private config:PerfectConfig,private consent:boolean){}
  services(goal:Goal,role:Role,workspace:string,signal:AbortSignal,leaseId?:string):AgentServices {
    const definition=this.config.agents[role];
    const ownership=new OwnershipManager(this.store);
    const makeBroker=async()=>new FileBroker(workspace,{readOnly:definition.readOnly||!leaseId,protectedPaths:this.config.protectedPaths,maxFileBytes:this.config.limits.maxFileBytes,frozenFiles:await new GitWorkspace(goal.root,this.config).frozenFiles()},ownership,leaseId);
    return {
      listFiles:async()=>(await manifest(workspace,this.config)).files.map(f=>f.path),
      readFile:async path=>{signal.throwIfAborted();return(await makeBroker()).read(path);},
      ...(!definition.readOnly&&leaseId?{
        writeFile:async(path:string,content:string,expectedHash?:string)=>{signal.throwIfAborted();return(await makeBroker()).write(path,content,expectedHash);},
        removeFile:async(path:string,expectedHash:string)=>{signal.throwIfAborted();await(await makeBroker()).remove(path,expectedHash);},
        command:async(command:import('../domain/model.js').CommandSpec)=>{
          signal.throwIfAborted();const output=await this.runner.command({goalId:goal.id,workspace,revision:goal.candidateRevision,artifactsDir:join(goal.root,'artifacts',id('tool')),signal},command);
          return{code:output.code,stdout:output.stdout,stderr:output.stderr};
        },
      }:{}),
      ...(this.config.permissions.researchHosts.length?{research:(url:string)=>fetchReference(url,this.config.permissions.researchHosts,signal)}:{}),
    };
  }
  async invoke(input:Invocation,outerSignal:AbortSignal):Promise<{run:AgentRun;output:AgentOutput}>{
    const signal=AbortSignal.any([outerSignal,AbortSignal.timeout(this.config.limits.timeoutPerTask)]);
    const definition=this.config.agents[input.role];
    let semaphore=this.accounts.get(definition.accountRef);
    if(!semaphore){semaphore=new Semaphore(this.config.parallelism.perAccount[definition.accountRef]??1);this.accounts.set(definition.accountRef,semaphore);}
    return semaphore.use(signal,async()=>{
      const route=await this.runtime.resolve(definition,input.goal.privacyClass,this.consent,signal);
      if(route.provenance==='mock'&&input.goal.mode!=='mock')throw new Blocked('MOCK_ROUTE_DENIED','Real goals cannot use a simulated route');
      const services=this.services(input.goal,input.role,input.workspace,signal,input.leaseId);
      const context=await buildContext(input.goal,input.role,input.task,services,this.store,this.config,input.evidence);
      let run:AgentRun={id:id('run'),goalId:input.goal.id,taskId:input.task?.id,attempt:input.task?.attempt??1,agentDefinitionId:input.role,status:'running',routeBinding:route,contextPackageId:context.id,inputRevision:input.goal.candidateRevision,requestIds:[],usageIds:[],startedAt:now()};
      this.store.put('runs',run,'agent.started');
      if(input.task)this.store.put('attempts',{id:`${input.task.id}-attempt-${input.task.attempt}`,goalId:input.goal.id,taskId:input.task.id,number:input.task.attempt,runId:run.id,status:'running',startedAt:now()},'attempt.started');
      const budget=new BudgetManager(this.store,input.goal.id,this.config);
      try{
        const output=await this.runtime.run({run,context,cwd:input.workspace,controlDir:join(input.goal.root,'runs',run.id),signal,services,instruction:input.instruction,resultSchema:input.schema,parseResult:input.parse,images:input.images,
          beforeRequest:(requestId,tokens,cost)=>{budget.reserve(requestId,run.id,route,tokens,cost);run={...run,requestIds:[...run.requestIds,requestId]};this.store.put('runs',run,'agent.request_started');},
          usage:(usage:Usage)=>{budget.settle(usage);run={...run,usageIds:[...run.usageIds,usage.id]};this.store.put('runs',run,'agent.usage_updated');},
          event:(type,payload)=>this.store.event(input.goal.id,type,{runId:run.id,taskId:input.task?.id,details:payload},input.role),
        });
        signal.throwIfAborted();input.parse(output.result);
        run={...run,status:'completed',endedAt:now(),sessionRef:output.sessionRef};this.store.put('runs',run,'agent.completed');
        if(input.task){const attempt=this.store.get('attempts',`${input.task.id}-attempt-${input.task.attempt}`)!;this.store.put('attempts',{...attempt,status:'completed',endedAt:now()},'attempt.completed');}
        return{run,output};
      }catch(error){
        run={...run,status:signal.aborted?'interrupted':'failed',endedAt:now(),stopReason:errorText(error)};this.store.put('runs',run,'agent.failed');
        if(input.task){const attempt=this.store.get('attempts',`${input.task.id}-attempt-${input.task.attempt}`)!;this.store.put('attempts',{...attempt,status:signal.aborted?'interrupted':'failed',endedAt:now()},'attempt.failed');}
        throw error;
      }finally{budget.interrupt(run.id);}
    });
  }
}
