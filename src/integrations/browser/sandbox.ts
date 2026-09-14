import { mkdir, mkdtemp, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { confinementArgs } from "../../adapters/sandbox/docker.js";
import { commandDriver } from "../../adapters/sandbox/drivers.js";
import { preparedImage } from "../../adapters/sandbox/dependencies.js";
import { copySnapshot } from "../../adapters/git/workspace.js";
import { processRun } from "../../adapters/git/process.js";
import { SqliteStore } from "../../adapters/sqlite/store.js";
import type { PerfectConfig } from "../../config/schema.js";
import { Blocked, id } from "../../domain/util.js";
import type { OperationScope, IntegrationResult, CatalogTool } from "../types.js";
import { IntegrationRegistry } from "../registry.js";
import { McpConnection } from "../wire.js";
import { BrowserSchemas, BROWSER_TOOLS, type BrowserTool } from "./tools.js";

export async function executablePath(name:string):Promise<string>{
  const suffixes=process.platform==="win32"&&extname(name)===""?[".exe",".cmd",""]:[""];
  for(const folder of (process.env.PATH??"").split(delimiter)){
    if(!folder||!resolve(folder).startsWith(resolve(folder)))continue;
    for(const suffix of suffixes){const candidate=join(folder,name+suffix);try{await access(candidate,constants.X_OK);return resolve(candidate);}catch{}}
  }
  throw new Blocked("MCP_EXECUTABLE_MISSING",`No se encontró ${name} en el PATH local`);
}
function mount(source:string,target:string):string[]{
  if(/[,\r\n]/.test(source))throw new Blocked("MCP_MOUNT_PATH","La ruta de montaje contiene caracteres no admitidos");
  return ["--mount",`type=bind,source=${resolve(source)},target=${target},readonly`];
}
async function checked(args:string[],signal?:AbortSignal):Promise<string>{
  const result=await processRun("docker",args,{signal,timeoutMs:30000});
  if(result.code!==0)throw new Blocked("BROWSER_DOCKER",`Falló Docker (${args.slice(0,2).join(" ")}). Revisá el servicio y las imágenes aprobadas; no se usará el shell del equipo.`);
  return result.stdout.trim();
}
export async function recoverBrowserResources(registry:IntegrationRegistry,goalId?:string):Promise<void>{
  const resources=registry.resources().filter(r=>!goalId||r.goalId===goalId);
  for(const r of resources.sort((a,b)=>Number(a.kind==="network")-Number(b.kind==="network"))){
    try {process.kill(r.ownerPid,0);if(r.ownerPid!==process.pid)continue;}catch{}
    if(!/^perfect-[A-Za-z0-9_-]+$/.test(r.id))throw new Blocked("BROWSER_RESOURCE","Identificador de recurso inválido");
    const inspected=await processRun("docker",[r.kind,"inspect","--format",r.kind==="network"?'{{ index .Labels "perfect.goal" }}':'{{ index .Config.Labels "perfect.goal" }}',r.id],{timeoutMs:5000});
    if(inspected.code===0){
      if(inspected.stdout.trim()!==r.goalId)throw new Blocked("BROWSER_RESOURCE_OWNER","La etiqueta del recurso no coincide");
      await checked(r.kind==="network"?["network","rm",r.id]:["rm","--force",r.id]);
    }else if((await processRun("docker",["version","--format","{{.Server.Version}}"],{timeoutMs:5000})).code!==0)throw new Blocked("BROWSER_RECOVERY","Docker no está disponible para reconciliar recursos");
    registry.removeResource(r.id);
  }
}
export class BrowserSandbox {
  private connection?:McpConnection;
  private owned:string[]=[];
  private catalog:CatalogTool[]=[];
  private closing=false;
  private scopeAbort=new AbortController();
  constructor(private home:string,private workspace:string,private scope:OperationScope,private config:PerfectConfig,private registry:IntegrationRegistry){}
  async open(raw:unknown,signal:AbortSignal,maxActions=100):Promise<IntegrationResult>{
    await this.close();this.closing=false;this.scopeAbort=new AbortController();
    const combined=AbortSignal.any([signal,this.scopeAbort.signal]);
    const spec=BrowserSchemas.browser_open.parse(raw);
    if(!this.config.permissions.allowedExecutables.includes(spec.server.executable))throw new Blocked("COMMAND_DENIED",spec.server.executable);
    await checked(["version","--format","{{.Server.Version}}"],combined);
    const store=new SqliteStore(join(this.home,"state.sqlite"));
    let image:string;
    try{image=await preparedImage(this.workspace,this.scope.goalId,this.config.sandbox.image,store);}finally{store.close();}
    await checked(["image","inspect",image],combined);await checked(["image","inspect",this.config.sandbox.browserImage],combined);
    const parent=join(this.home,"integrations-runtime");await mkdir(parent,{recursive:true,mode:0o700});
    const dir=await mkdtemp(join(parent,"browser-"));
    await copySnapshot(this.workspace,join(dir,"input"),this.config);
    await writeFile(join(dir,"driver.mjs"),commandDriver);await writeFile(join(dir,"spec.json"),JSON.stringify({...spec.server,port:spec.port}));
    const network=id("perfect-net"),app=id("perfect-app"),browser=id("perfect-browser");
    const claim=(resource:string,kind:"network"|"container")=>{this.registry.resource(resource,this.scope.goalId,kind,{runId:this.scope.runId});this.owned.push(resource);};
    try{
      claim(network,"network");await checked(["network","create","--internal","--label",`perfect.goal=${this.scope.goalId}`,network],combined);
      claim(app,"container");const appArgs=confinementArgs(app,this.scope.goalId,this.config,network);appArgs.splice(1,0,"--detach");
      await checked([...appArgs,"--network-alias","perfect-app.test",...mount(join(dir,"input"),"/input"),...mount(join(dir,"driver.mjs"),"/driver/execute.mjs"),...mount(join(dir,"spec.json"),"/spec.json"),image,"node","/driver/execute.mjs"],combined);
      claim(browser,"container");const root=fileURLToPath(new URL("../../../",import.meta.url));
      const args=confinementArgs(browser,this.scope.goalId,this.config,network);args.splice(1,0,"--interactive");
      const browserArgs=[...args,...mount(join(root,"dist"),"/perfect/dist"),...mount(join(root,"node_modules"),"/perfect/node_modules"),...mount(join(root,"package.json"),"/perfect/package.json"),"--env",`PERFECT_BROWSER_ORIGIN=http://perfect-app.test:${spec.port}`,"--env",`PERFECT_BROWSER_MAX_ACTIONS=${maxActions}`,"--env",`PERFECT_BROWSER_WIDTH=${spec.width}`,"--env",`PERFECT_BROWSER_HEIGHT=${spec.height}`,"--env",`PERFECT_BROWSER_PATH=${spec.path}`,this.config.sandbox.browserImage,"node","/perfect/dist/integrations/browser/server.js"];
      this.connection=await McpConnection.open({type:"stdio",command:await executablePath("docker"),args:browserArgs,envRefs:{},trustLocalProcess:true},join(dir,"client"),combined,60000);
      this.catalog=(await this.connection.catalog(combined)).tools;
      const names=this.catalog.map(t=>t.name).sort();const expected=BROWSER_TOOLS.filter(t=>t.name!=="browser_open").map(t=>t.name).sort();
      if(JSON.stringify(names)!==JSON.stringify(expected))throw new Blocked("BROWSER_CATALOG","El servidor interno no coincide con las herramientas del paquete");
      return this.call("browser_snapshot",{},combined);
    }catch(error){await this.close();throw error;}
  }
  async call(name:BrowserTool,args:Record<string,unknown>,signal:AbortSignal):Promise<IntegrationResult>{
    if(name==="browser_close"){await this.close();return {content:[{type:"text",text:"Navegador cerrado"}]};}
    if(!this.connection)throw new Blocked("BROWSER_NOT_OPEN","Primero usá browser_open con el servidor de esta tarea");
    const tool=this.catalog.find(t=>t.name===name);if(!tool)throw new Blocked("BROWSER_TOOL",name);
    return this.connection.call(tool,args,AbortSignal.any([signal,this.scopeAbort.signal]),30000);
  }
  async close():Promise<void>{
    if(this.closing)return;this.closing=true;this.scopeAbort.abort();
    await this.connection?.close();this.connection=undefined;this.catalog=[];
    for(const resource of this.owned.toReversed()){
      const record=this.registry.resources().find(r=>r.id===resource);if(!record)continue;
      const inspected=await processRun("docker",[record.kind,"inspect","--format",record.kind==="network"?'{{ index .Labels "perfect.goal" }}':'{{ index .Config.Labels "perfect.goal" }}',resource],{timeoutMs:5000});
      if(inspected.code===0){if(inspected.stdout.trim()!==this.scope.goalId)throw new Blocked("BROWSER_RESOURCE_OWNER","No se detendrá un recurso ajeno");await checked(record.kind==="network"?["network","rm",resource]:["rm","--force",resource]);}
      else if((await processRun("docker",["version","--format","{{.Server.Version}}"],{timeoutMs:5000})).code!==0)throw new Blocked("BROWSER_CLEANUP_PENDING","La limpieza debe reanudarse cuando Docker esté disponible");
      this.registry.removeResource(resource);
    }
    this.owned=[];
    await delay(1);
  }
}
