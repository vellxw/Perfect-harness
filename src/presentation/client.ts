import {fork,type ChildProcess} from "node:child_process";
import {fileURLToPath} from "node:url";
import {UiPreferencesSchema,text,type UiAction,type UiMessage,type UiSnapshot} from "./protocol.js";
export function emptySnapshot(workspace=""):UiSnapshot{return {protocol:1,version:"0.2.0",sequence:0,workspace,workspaceName:workspace.split(/[\\/]/).at(-1)||"Workspace",connected:false,busy:false,demo:false,tasks:[],agents:[],checks:[],artifacts:[],activity:[],verification:{passed:0,total:0},accounts:[],recentGoals:[],diagnostics:[],preferences:UiPreferencesSchema.parse({})};}
export interface UiClient {getSnapshot:()=>UiSnapshot;subscribe:(listener:()=>void)=>()=>void;onMessage:(listener:(message:UiMessage)=>void)=>()=>void;dispatch:(action:UiAction)=>void;close:()=>Promise<void>;}
export class EngineClient implements UiClient {
 private child:ChildProcess;
 private state:UiSnapshot;
 private listeners=new Set<()=>void>();
 private messages=new Set<(message:UiMessage)=>void>();
 private sequence=0;
 private exiting=false;
 constructor(options:{workspace?:string;home?:string}){
  this.state=emptySnapshot(options.workspace??process.cwd());
  const worker=fileURLToPath(new URL("./worker.js",import.meta.url));
  this.child=fork(worker,[],{stdio:["ignore","pipe","pipe","ipc"],execArgv:process.execArgv.filter(a=>!a.startsWith("--inspect")&&!a.includes("experimental-ffi")),windowsHide:true});
  this.child.stdout?.resume();this.child.stderr?.on("data",()=>{});
  this.child.on("message",raw=>{const m=raw as UiMessage;if(m.type==="snapshot"&&m.snapshot?.protocol===1){this.state=m.snapshot;for(const l of this.listeners)l();}else for(const l of this.messages)l(m);});
  this.child.on("error",error=>this.fail(text(error)));
  this.child.on("exit",code=>{if(!this.exiting)this.fail(`Engine disconnected (exit ${code??"unknown"}). No success was inferred; reopen Perfect to recover.`);});
  this.child.send({type:"initialize",options});
 }
 private fail(message:string){this.state={...this.state,connected:false};for(const l of this.listeners)l();for(const l of this.messages)l({type:"fault",message});}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 onMessage=(listener:(message:UiMessage)=>void)=>{this.messages.add(listener);return()=>{this.messages.delete(listener);};};
 dispatch=(action:UiAction)=>{if(!this.child.connected){this.fail("Engine is not connected");return;}this.child.send({type:"action",requestId:`ui-${++this.sequence}`,action});};
 close=async()=>{if(this.exiting)return;this.exiting=true;if(!this.child.connected)return;await new Promise<void>(resolveClose=>{this.child.once("exit",()=>resolveClose());this.child.send({type:"shutdown"});});};
}
