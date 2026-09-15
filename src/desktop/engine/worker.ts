import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PresentationEngine } from "../../presentation/engine.js";
import { EngineQuerySchema, type UiMessage, type UiSnapshot } from "../contracts/protocol.js";
import { GitWorkspace } from "../../adapters/git/workspace.js";
import { goalConfig } from "../../cli/context.js";
import { loadConfig } from "../../config/load.js";
import { listSafeFiles, safePath } from "../../tools/paths.js";
import { readEvidence } from "../../tools/evidence.js";
import { DesktopPreview } from "./preview.js";

const Input=z.discriminatedUnion("type",[
 z.object({type:z.literal("initialize"),options:z.object({home:z.string(),workspace:z.string()}).strict()}).strict(),
 z.object({type:z.literal("action"),requestId:z.string().uuid(),action:z.unknown()}).strict(),
 z.object({type:z.literal("query"),requestId:z.string().uuid(),query:EngineQuerySchema}).strict(),
 z.object({type:z.literal("shutdown")}).strict(),
]);
let engine:PresentationEngine|undefined,snapshot:UiSnapshot|undefined,initializing:Promise<void>|undefined,preview:DesktopPreview|undefined,closing=false;
let actionQueue=Promise.resolve();
const seen=new Set<string>();
function send(message:unknown){if(process.connected)process.send?.(message);}
const emit=(message:UiMessage)=>{if(message.type==='snapshot')snapshot=message.snapshot;send(message);};
async function query(requestId:string, raw:unknown){
 try{
  await initializing;
  if(!engine||!snapshot)throw Error('El motor aún no está conectado');
  const q=EngineQuerySchema.parse(raw);
  const goal='goalId' in q && q.goalId?engine.store.get('goals',q.goalId):undefined;
  if('goalId' in q&&q.goalId&&(!goal||goal.source!==snapshot.workspace))throw Error('El objetivo no pertenece a esta carpeta');
  const config=goal?goalConfig(goal):await loadConfig(snapshot.workspace,engine.home);
  const root=goal?new GitWorkspace(goal.root,config).repo:snapshot.workspace;
  let data:unknown;
  if(q.kind==='files'){
   const files=await listSafeFiles(root,config);data={paths:files.slice(q.offset,q.offset+200),total:files.length,next:files.length>q.offset+200?q.offset+200:null};
  }else if(q.kind==='file'){
   const path=await safePath(root,q.path);const files=await listSafeFiles(root,config);if(!files.includes(q.path))throw Error('Archivo fuera de los recursos autorizados');
   const bytes=await readFile(path);if(bytes.length>500000||bytes.includes(0))throw Error('El visor de texto admite archivos UTF-8 hasta 500 KB');
   data={path:q.path,content:bytes.toString('utf8'),revision:goal?.candidateRevision??'source',sha256:createHash('sha256').update(bytes).digest('hex')};
  }else if(q.kind==='media'){
   if(!goal)throw Error('Seleccioná un objetivo');const evidence=engine.store.get('evidence',q.evidenceId);if(!evidence)throw Error('Evidencia inexistente');
   const bytes=await readEvidence(goal,evidence,150_000_000);const extension=extname(evidence.artifactRef).toLowerCase();
   if(!['.png','.jpg','.jpeg','.webp','.mp4','.webm','.glb'].includes(extension))throw Error('Este formato se inspecciona como texto, no como contenido ejecutable');
   const sha256=createHash('sha256').update(bytes).digest('hex'),dir=join(engine.home,'desktop-media');await mkdir(dir,{recursive:true,mode:0o700});const path=join(dir,sha256+extension);
   try{await writeFile(path,bytes,{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
   data={path,extension,sha256,size:bytes.length,evidenceId:evidence.id,revision:evidence.revision,current:evidence.revision===goal.candidateRevision};
  }else if(q.kind==='preview-start'){
   if(!goal)throw Error('Seleccioná un objetivo');await preview?.close();preview=new DesktopPreview(engine.store,config,engine.home);data=await preview.start(goal,q.checkId);
  }else{await preview?.close();preview=undefined;data={closed:true};}
  send({type:'desktop-result',requestId,ok:true,data});
 }catch(error){send({type:'desktop-result',requestId,ok:false,message:error instanceof Error?error.message:'Operación interrumpida'});}
}
process.on('message',(raw:unknown)=>{
 const input=Input.safeParse(raw);if(!input.success){send({type:'fault',message:'Mensaje IPC de motor inválido'});return;}const m=input.data;
 if(m.type==='initialize'&&!initializing){initializing=(async()=>{const workspace=await realpath(m.options.workspace);engine=await PresentationEngine.create({...m.options,workspace},emit);})();void initializing.catch(e=>{send({type:'fault',message:String(e)});process.exitCode=1;});}
 else if(m.type==='shutdown'){void close();}
 else if(m.type==='query'||m.type==='action'){
  if(seen.has(m.requestId)){send({type:'desktop-result',requestId:m.requestId,ok:false,message:'Solicitud duplicada: no se repitió el efecto'});return;}if(seen.size>=10000){send({type:'fault',message:'Límite de solicitudes de esta sesión; reiniciá después de pausar'});return;}seen.add(m.requestId);
  actionQueue=actionQueue.then(async()=>{await initializing;if(m.type==='query')await query(m.requestId,m.query);else await engine?.dispatch(m.requestId,m.action);}).catch(e=>emit({type:'fault',message:String(e)}));
 }
});
async function close(){if(closing)return;closing=true;await initializing?.catch(()=>{});await preview?.close();await engine?.dispose();if(process.connected)process.disconnect();}
process.on('disconnect',()=>void close());process.on('SIGTERM',()=>void close());
