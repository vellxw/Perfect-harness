import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { validSnapshot, type UiMessage, type UiSnapshot, type DesktopEvent } from "../contracts/protocol.js";

export class EngineBroker extends EventEmitter {
 snapshot?:UiSnapshot; connected=false; sequence=0; workspaceId='unselected';
 private child?:ChildProcess;private closing?:Promise<void>;private waiting=new Map<string,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(readonly node:string,readonly worker:string,readonly home:string,readonly workspace:string){super();}
 start(){
  if(this.child)throw Error('El motor ya se inició');
  const env={...process.env};for(const key of Object.keys(env))if(/^(?:NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|ELECTRON_NO_ASAR|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED)$/i.test(key))delete env[key];
  const child=spawn(this.node,[this.worker],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,shell:false,env});this.child=child;
  child.stdout?.resume();child.stderr?.resume();
  child.on('message',(raw:unknown)=>{
   if(!raw||typeof raw!=='object')return;const m=raw as UiMessage & {type:string;requestId?:string;ok?:boolean;data?:unknown;message?:string};
   if(m.type==='snapshot'){
    if(!validSnapshot(m.snapshot)){this.fail('Snapshot inválido del motor');return;}
    this.snapshot=m.snapshot;this.connected=true;this.workspaceId=createHash('sha256').update(m.snapshot.workspace).digest('hex').slice(0,24);
   }
   if(m.requestId&&this.waiting.has(m.requestId)&&(m.type==='result'||m.type==='desktop-result')){const p=this.waiting.get(m.requestId)!;clearTimeout(p.timer);this.waiting.delete(m.requestId);if(m.ok)p.resolve(m);else p.reject(new Error(m.message??'Operación rechazada'));}
   if(m.type!=='desktop-result')this.emit('event',{type:'engine',message:m,sequence:++this.sequence,workspaceId:this.workspaceId} as DesktopEvent);
  });
  child.on('error',e=>this.fail(e.message));child.on('exit',code=>{if(!this.closing)this.fail(`Motor desconectado (${code??'desconocido'}). No se repitieron operaciones; recuperá el trabajo antes de reanudar.`);});
  child.send?.({type:'initialize',options:{home:this.home,workspace:this.workspace}});
 }
 private fail(reason:string){this.connected=false;for(const p of this.waiting.values()){clearTimeout(p.timer);p.reject(new Error(reason));}this.waiting.clear();this.emit('event',{type:'connection',connected:false,reason,workspaceId:this.workspaceId});}
 request(type:'action'|'query',payload:unknown,requestId=randomUUID()):Promise<unknown>{
  if(!this.child?.connected)return Promise.reject(new Error('El motor no está conectado'));
  if(this.waiting.has(requestId))return Promise.reject(new Error('ID de solicitud duplicado'));
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiting.delete(requestId);reject(new Error('La respuesta venció; el efecto puede estar pendiente. No se reintentó automáticamente.'));},120000);this.waiting.set(requestId,{resolve,reject,timer});this.child!.send?.(type==='action'?{type,requestId,action:payload}:{type,requestId,query:payload});});
 }
 async ready(timeout=20000){const end=Date.now()+timeout;while(!this.connected&&Date.now()<end)await new Promise(r=>setTimeout(r,25));if(!this.connected)throw Error('El motor no quedó listo');}
 close():Promise<void>{
  if(this.closing)return this.closing;
  this.closing=(async()=>{const child=this.child;if(!child?.connected)return;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No se confirmó la parada del motor; no se liberaron locks')),30000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.send?.({type:'shutdown'});});for(const p of this.waiting.values()){clearTimeout(p.timer);p.reject(new Error('Motor detenido'));}this.waiting.clear();})();return this.closing;
 }
}
