import { z } from 'zod';
import { Type } from 'typebox';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AgentRequest } from '../../ports/agent-runtime.js';
import { CommandSchema } from '../../domain/model.js';

export function buildTools(request:AgentRequest,guard:()=>void,submit:(value:unknown)=>void):ToolDefinition[]{
  const text=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}],details:{}});
  const define=(name:string,description:string,parameters:ToolDefinition['parameters'],handler:(args:unknown)=>Promise<unknown>):ToolDefinition=>({name,label:name,description,parameters,execute:async(_call,args)=>{request.signal.throwIfAborted();return text(await handler(args));}});
  const pathArgs=z.object({path:z.string()}).strict();
  const jsonArgs=z.object({json:z.string()}).strict();
  const tools=[
    define('list_files','List sanitized workspace files.',Type.Object({}),async()=>request.services.listFiles()),
    define('read_file','Read a permitted file and its content hash.',Type.Object({path:Type.String()}),async args=>request.services.readFile(pathArgs.parse(args).path)),
    define('submit_result',`Submit a JSON value matching this schema. Submission is not proof of success: ${JSON.stringify(request.resultSchema)}`,Type.Object({json:Type.String()}),async args=>{guard();const value:unknown=JSON.parse(jsonArgs.parse(args).json);submit(request.parseResult?request.parseResult(value):value);return{submitted:true,acceptedByJudge:false};}),
  ];
  if(!request.run.routeBinding.readOnly&&request.services.writeFile)tools.push(define('write_file','Create/replace an owned file. Read existing files and provide expectedHash.',Type.Object({path:Type.String(),content:Type.String(),expectedHash:Type.Optional(Type.String())}),async args=>{guard();const value=z.object({path:z.string(),content:z.string(),expectedHash:z.string().optional()}).strict().parse(args);return request.services.writeFile!(value.path,value.content,value.expectedHash);}));
  if(!request.run.routeBinding.readOnly&&request.services.removeFile)tools.push(define('remove_file','Remove an owned file using its read hash.',Type.Object({path:Type.String(),expectedHash:Type.String()}),async args=>{guard();const value=z.object({path:z.string(),expectedHash:z.string()}).strict().parse(args);await request.services.removeFile!(value.path,value.expectedHash);return{removed:true};}));
  if(!request.run.routeBinding.readOnly&&request.services.command)tools.push(define('run_command','Run a command in an isolated snapshot. These filesystem changes are NOT imported. JSON: executable,args,cwd,timeoutMs.',Type.Object({json:Type.String()}),async args=>{guard();return request.services.command!(CommandSchema.parse(JSON.parse(jsonArgs.parse(args).json)));}));
  if(request.services.research)tools.push(define('fetch_reference','Fetch public documentation from an explicitly approved host.',Type.Object({url:Type.String()}),async args=>request.services.research!(z.object({url:z.string()}).strict().parse(args).url)));
  return tools;
}
