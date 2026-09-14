import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PlanProposalSchema, type AgentDefinition, type Privacy, type RouteBinding } from '../domain/model.js';
import type { AgentRuntime, AgentRequest, AgentOutput } from '../ports/agent-runtime.js';
import { hash, id, now } from '../domain/util.js';
import { reservationTests, reservationGoal } from './reservation-tests.js';
import { backendApp, backendStart } from './reservation-backend.js';
import { frontendHtml, frontendCss, frontendJs } from './reservation-frontend.js';
export { reservationGoal };
export async function seedReservationSource(source:string):Promise<void>{
  await mkdir(join(source,'tests'),{recursive:true});await writeFile(join(source,'README.md'),`# Reservation smoke scenario\n\n${reservationGoal}\n\nThe existing tests are trusted acceptance fixtures. Do not modify them. Implement backend/app.mjs exporting createApp({database}) => {server,close}. GET /api/slots returns [{id,available}]. POST /api/reservations accepts {slot,name}, returns 201 or 409, rejects invalid input with 400. GET /api/reservations returns persisted entries. The browser form uses #name, #reserve and #status.\n`);
  await writeFile(join(source,'tests','reservations.test.mjs'),reservationTests);
}
export function reservationPlan(){return PlanProposalSchema.parse({
  summary:'Build and independently verify a persistent responsive reservation application.',architecture:['Native Node HTTP server and SQLite unique slot constraint','Static responsive frontend using the JSON API','Immutable API tests plus browser interaction and visual inspection'],risks:['Concurrent requests must never double-book a slot'],criteria:[
    {id:'api',description:'API validates input, rejects concurrent double booking and preserves reservations after restart',kind:'functional'},
    {id:'responsive',description:'The booking form works in desktop and mobile viewports without horizontal overflow',kind:'visual'},
  ],verification:[
    {id:'api-tests',title:'Validation, concurrency and persistence tests',kind:'command',criteriaIds:['api'],command:{executable:'node',args:['--test','tests/reservations.test.mjs']}},
    {id:'browser',title:'Responsive booking interaction',kind:'browser',criteriaIds:['responsive'],scenario:{server:{executable:'node',args:['backend/start.mjs']},readyPath:'/api/slots',viewports:[{width:1280,height:800},{width:390,height:844}],actions:[{type:'fill',selector:'#name',value:'Test Visitor'},{type:'click',selector:'#reserve'},{type:'expectText',selector:'#status',value:'Reservation confirmed'}]}},
  ],tasks:[
    {id:'foundation',title:'Document API contract',description:'Create package metadata and document the shared reservation API contract.',type:'general',assignedAgent:'general',ownedFiles:['package.json','contract.json'],acceptanceCriteria:['api']},
    {id:'backend',title:'Implement reservation API',description:'Implement the native HTTP server, strict validation, SQLite persistence and a unique constraint for concurrency safety.',type:'backend',assignedAgent:'backend',riskLevel:'high',dependencies:['foundation'],ownedSurfaces:['backend'],relevantFiles:['contract.json','tests/reservations.test.mjs'],acceptanceCriteria:['api']},
    {id:'frontend',title:'Implement responsive booking UI',description:'Implement an accessible responsive form in public/ consuming the shared API contract, with clear loading, error and confirmation states.',type:'frontend',assignedAgent:'frontend',dependencies:['foundation'],ownedSurfaces:['public'],relevantFiles:['contract.json'],acceptanceCriteria:['responsive']},
  ],
});}

/** Only selected by the explicitly labelled --mock smoke scenario. No real-model claim. */
export class ReservationDemoRuntime implements AgentRuntime {
  readonly roles:string[]=[];private frontendRuns=0;private active=0;maximumParallelWriters=0;
  async resolve(def:AgentDefinition,_privacy:Privacy,_consent:boolean,signal:AbortSignal):Promise<RouteBinding>{
    signal.throwIfAborted();return{...def,provider:'perfect-mock',model:`mock-${def.id}`,auth:'mock',billingMode:'mock',reasoning:'off',requestedReasoning:def.reasoning,selectedReasoning:'off',runtimeVersion:'reservation-demo-1',capabilityHash:hash(def.capabilities),endpoint:'mock://reservations',resolvedAt:now(),provenance:'mock'};
  }
  async run(request:AgentRequest):Promise<AgentOutput>{
    const role=request.run.agentDefinitionId;this.roles.push(role);const requestId=id('mock-request');request.beforeRequest(requestId,200,0);
    let result:unknown;
    if(role==='planner')result=reservationPlan();
    else if(role==='oracle'||role==='visual'){
      if(request.services.writeFile)throw new Error('Reviewer unexpectedly received a write tool');
      if(role==='visual'&&(request.images?.length??0)<2)throw new Error('Visual reviewer did not receive actual captures');
      result={decision:'approve',summary:'Scripted mock review exercises routing only; no real model judgment was performed.',findings:[]};
    }else{
      this.active++;this.maximumParallelWriters=Math.max(this.maximumParallelWriters,this.active);
      try{
        await delay(25,undefined,{signal:request.signal});const write=request.services.writeFile;if(!write)throw new Error('Worker has no broker');
        if(role==='general'){
          await write('package.json',JSON.stringify({name:'reservation-smoke',private:true,type:'module',scripts:{start:'node backend/start.mjs',test:'node --test tests/reservations.test.mjs'}},null,2));
          await write('contract.json',JSON.stringify({slots:'GET /api/slots -> [{id,available}]',reserve:'POST /api/reservations {slot,name} -> 201 | 409 | 400',persistence:'GET /api/reservations'},null,2));
        }else if(role==='backend'){
          await write('backend/app.mjs',backendApp);await write('backend/start.mjs',backendStart);
        }else if(role==='frontend'){
          this.frontendRuns++;await write('public/index.html',frontendHtml);await write('public/style.css',frontendCss(this.frontendRuns===1));await write('public/app.js',frontendJs);
        }else throw new Error(`Unsupported scripted role: ${role}`);
        result={summary:`Scripted ${role} candidate written through the real ownership broker`,outputs:[]};
      }finally{this.active--;}
    }
    request.usage({id:id('mock-usage'),goalId:request.run.goalId,runId:request.run.id,requestId,provider:'perfect-mock',accountRef:request.run.routeBinding.accountRef,modelRequested:request.run.routeBinding.model,modelSerialized:request.run.routeBinding.model,modelReported:request.run.routeBinding.model,reasoningRequested:'off',inputTokens:80,outputTokens:20,totalTokens:100,latencyMs:1,retryCount:0,billingMode:'mock',completeness:'reported',createdAt:now()});
    return{result:request.parseResult?request.parseResult(result):result,summary:'Scripted smoke (not a real inference)'};
  }
}
