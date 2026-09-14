import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { z } from 'zod';
import type { PerfectConfig } from '../config/schema.js';
import type { Role } from '../domain/model.js';
import type { StateStore } from '../ports/state-store.js';
import { PiRuntime } from '../adapters/pi/runtime.js';
import { DockerRunner } from '../adapters/sandbox/docker.js';
import { AgentExecutor } from '../application/agent-executor.js';
import { Orchestrator } from '../application/orchestrator.js';
import { createGoal } from '../application/goals.js';
import { transition } from '../domain/goal-state-machine.js';
import { seedReservationSource, ReservationDemoRuntime, reservationGoal } from '../examples/reservations.js';
import { errorText, now } from '../domain/util.js';

function colorPng(rgb:[number,number,number]):string{
  const crc=(data:Buffer)=>{let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const chunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,checksum]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(32,0);ihdr.writeUInt32BE(32,4);ihdr[8]=8;ihdr[9]=2;
  const row=Buffer.from([0,...Array.from({length:32},()=>rgb).flat()]);const pixels=Buffer.concat(Array.from({length:32},()=>row));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const SmokeSchema=z.object({ok:z.literal(true),firstColor:z.enum(['red','green','blue','white']),secondColor:z.enum(['red','green','blue','white']),summary:z.string()}).strict();
export interface SmokeCheck {role:Role;status:'PASS'|'BLOCKED';detail:string;model?:string;provider?:string;reasoningSent?:string;reasoningReported?:string;requests?:number;reportedTokens?:number}
export async function providerSmoke(input:{home:string;config:PerfectConfig;store:StateStore;roles?:Role[];contributorConsent?:boolean;signal:AbortSignal}):Promise<{goalId:string;report:string;checks:SmokeCheck[]}>{
  const dir=join(input.home,'diagnostics');await mkdir(dir,{recursive:true,mode:0o700});const source=await mkdtemp(join(dir,'provider-source-'));
  // Keep controller state outside the source directory, even for diagnostics.
  const goal=await createGoal({request:'Synthetic provider connectivity diagnostic, not a coding goal.',source,home:input.home,config:input.config,privacy:'public',mode:'real'},input.store);
  const runtime=new PiRuntime(input.home,input.config),runner=new DockerRunner(input.config,input.store,join(input.home,'sandbox'));
  const executor=new AgentExecutor(input.store,runtime,runner,input.config,input.contributorConsent??false),checks:SmokeCheck[]=[];
  for(const role of input.roles??['planner','general','frontend','backend','oracle']){
    try{
      const result=await executor.invoke({goal:input.store.get('goals',goal.id)!,role,workspace:source,instruction:'Connectivity smoke test only. Call list_files once. Identify the solid color in each of the two attached images, in order, and submit the JSON result. Do not modify files.',schema:z.toJSONSchema(SmokeSchema),parse:value=>SmokeSchema.parse(value),images:[{data:colorPng([0,0,255]),mimeType:'image/png',source:'image-1'},{data:colorPng([255,0,0]),mimeType:'image/png',source:'image-2'}]},input.signal);
      const output=SmokeSchema.parse(result.output.result);if(output.firstColor!=='blue'||output.secondColor!=='red')throw new Error('Image input probe returned incorrect colors');
      const toolEvents=input.store.events(goal.id).filter(event=>{const p=event.payload as {runId?:string;details?:{toolName?:string;isError?:boolean}};return event.type==='agent.tool_completed'&&p.runId===result.run.id&&p.details?.toolName==='list_files'&&!p.details.isError;});
      if(!toolEvents.length)throw new Error('No successful tool execution was observed');
      const usage=input.store.list('usage',goal.id).filter(u=>u.runId===result.run.id);const last=usage.at(-1);
      checks.push({role,status:'PASS',detail:'Real inference, structured submission, observed tool execution and image probe passed. Unreported metadata remains unknown.',model:result.run.routeBinding.model,provider:result.run.routeBinding.provider,reasoningSent:last?.reasoningSent,reasoningReported:last?.reasoningReported,requests:usage.length,reportedTokens:usage.reduce((n,u)=>n+(u.totalTokens??0),0)});
    }catch(error){checks.push({role,status:'BLOCKED',detail:errorText(error)});}
    if(input.signal.aborted)break;
  }
  const current=input.store.get('goals',goal.id)!;input.store.put('goals',transition(current,'ABORTED','Diagnostic sessions completed; this was not a coding goal'),'smoke.completed');
  const report=join(goal.root,'provider-smoke.json');await writeFile(report,JSON.stringify({at:now(),checks},null,2));return{goalId:goal.id,report,checks};
}
export async function fullstackSmoke(input:{home:string;config:PerfectConfig;store:StateStore;mock:boolean;acceptPlan?:boolean;contributorConsent?:boolean;signal:AbortSignal}){
  const dir=join(input.home,'diagnostics');await mkdir(dir,{recursive:true,mode:0o700});const source=await mkdtemp(join(dir,'fullstack-source-'));await seedReservationSource(source);
  const goal=await createGoal({request:reservationGoal,source,home:input.home,config:input.config,privacy:'public',mode:input.mock?'mock':'real'},input.store);
  const runtime=input.mock?new ReservationDemoRuntime():new PiRuntime(input.home,input.config),runner=new DockerRunner(input.config,input.store,join(input.home,'sandbox'));
  const finished=await new Orchestrator(input.store,runtime,runner).run(goal.id,{acceptPlan:input.acceptPlan,contributorConsent:input.contributorConsent,signal:input.signal});
  const observed=[...new Set(input.store.list('runs',goal.id).filter(r=>r.status==='completed').map(r=>r.agentDefinitionId))];
  const missing=['planner','general','frontend','backend','oracle'].filter(role=>!observed.includes(role as Role));
  return{status:finished.state==='DONE'&&!missing.length?'PASS':'BLOCKED',mode:finished.mode,goal:finished,observedRoles:observed,missingRoles:missing,notice:input.mock?'Providers and reviews were scripted; Git, tools, Docker, API tests and browser verification were real.':'Inspect recorded provider metadata; no fallback route was permitted.'};
}
