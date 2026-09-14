import { join } from "node:path";
import type { AgentRequest } from "../../src/ports/agent-runtime.js";
import type { Role, Privacy } from "../../src/domain/model.js";
import { defaultConfig } from "../../src/config/schema.js";
export function integrationRequest(home:string,workspace:string,role:Role="general",privacy:Privacy="private",signal=new AbortController().signal):AgentRequest{
 const definition=defaultConfig().agents[role],at=new Date().toISOString();
 return {
  sourceWorkspace:workspace,goalRoot:join(home,"goal"),cwd:workspace,controlDir:join(home,"control"),signal,
  run:{id:"test-run-1",goalId:"test-goal-1",taskId:"test-task-1",attempt:1,agentDefinitionId:role,status:"running",routeBinding:{...definition,model:"synthetic-test-model",auth:"mock",billingMode:"mock",provenance:"mock",runtimeVersion:"test",capabilityHash:"test",endpoint:"mock://no-provider",requestedReasoning:definition.reasoning,selectedReasoning:definition.reasoning,resolvedAt:at},contextPackageId:"test-context",inputRevision:"test-revision",requestIds:[],usageIds:[],startedAt:at},
  context:{id:"test-context",hash:"test",goalId:"test-goal-1",taskId:"test-task-1",role,goal:"Probar integración MCP sin cuentas personales",criteria:[],constraints:[],files:[],manifest:[],dependencyOutputs:[],contracts:[],failures:[],evidence:[],allowedCommands:[],baseRevision:"test-revision",tokenEstimate:100,privacyClass:privacy,createdAt:at},
  services:{listFiles:async()=>[],readFile:async()=>{throw Error("No file access in this fixture");}},instruction:"Prueba sintética",resultSchema:{type:"object"},beforeRequest:()=>{},usage:()=>{},event:()=>{},
 };
}
