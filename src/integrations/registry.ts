import { mkdirSync, chmodSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { Blocked, hash, id, now } from "../domain/util.js";
import { IntegrationSchema, type Catalog, type IntegrationConfig, type IntegrationOperation, type IntegrationRecord, type IntegrationResult, type OperationScope, type Effect, type IntegrationSummary } from "./types.js";

/** Local authority. Agents only receive the broker, never this mutation API. */
export class IntegrationRegistry {
  private db: DatabaseSync;
  readonly path: string;
  constructor(home: string) {
    this.path = join(resolve(home), "integrations.sqlite");
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    try { if (lstatSync(this.path).isSymbolicLink()) throw new Blocked("MCP_STATE_PATH", "La base de integraciones no puede ser un enlace simbólico"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    this.db = new DatabaseSync(this.path);
    if (process.platform !== "win32") chmodSync(this.path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS servers(workspace TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(workspace,id));
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,goal_id TEXT NOT NULL,server_id TEXT NOT NULL,state TEXT NOT NULL,logical_key TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS operations_scope ON operations(workspace,goal_id,server_id,state);
      CREATE INDEX IF NOT EXISTS operations_replay ON operations(logical_key,state);
      CREATE TABLE IF NOT EXISTS audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT,workspace TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY,goal_id TEXT NOT NULL,kind TEXT NOT NULL,owner_pid INTEGER NOT NULL,data TEXT NOT NULL);
    `);
  }
  close(): void { this.db.close(); }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  event(workspace: string, type: string, data: unknown): void {
    this.db.prepare("INSERT INTO audit(workspace,type,data,created_at) VALUES(?,?,?,?)").run(workspace, type, JSON.stringify(data), now());
  }
  events(workspace: string, limit = 100): unknown[] {
    return this.db.prepare("SELECT sequence,type,data,created_at FROM audit WHERE workspace=? ORDER BY sequence DESC LIMIT ?").all(workspace, Math.min(1000, limit)).map(r => ({...r,data:JSON.parse(String(r.data))}));
  }
  get(workspace: string, serverId: string): IntegrationRecord | undefined {
    const row = this.db.prepare("SELECT data FROM servers WHERE workspace=? AND id=?").get(workspace, serverId);
    return row ? JSON.parse(String(row.data)) as IntegrationRecord : undefined;
  }
  list(workspace: string): IntegrationRecord[] {
    return this.db.prepare("SELECT data FROM servers WHERE workspace=? ORDER BY id").all(workspace).map(r => JSON.parse(String(r.data)) as IntegrationRecord);
  }
  save(workspace: string, raw: unknown): IntegrationRecord {
    const config = IntegrationSchema.parse(raw);
    const previous = this.get(workspace, config.id), configHash = hash(config);
    const same = previous?.configHash === configHash;
    const record: IntegrationRecord = {workspace,config,configHash,catalog:same?previous.catalog:undefined,authorizedCatalog:same?previous.authorizedCatalog:undefined,updatedAt:now()};
    this.transaction(() => {
      this.putRecord(record);
      if (!same) for (const op of this.operations(workspace).filter(o => o.serverId===config.id && ["pending","approved"].includes(o.state))) this.update({...op,state:"denied",error:"La configuración cambió"});
      this.event(workspace,"integration.configured",{id:config.id,configHash,enabled:config.enabled});
    });
    return record;
  }
  private putRecord(record: IntegrationRecord): void {
    this.db.prepare("INSERT INTO servers VALUES(?,?,?) ON CONFLICT(workspace,id) DO UPDATE SET data=excluded.data").run(record.workspace,record.config.id,JSON.stringify(record));
  }
  setEnabled(workspace: string, serverId: string, enabled: boolean): void {
    const record = this.require(workspace, serverId);
    // Enabling does not make an unreviewed catalog trusted.
    this.save(workspace, {...record.config, enabled});
  }
  require(workspace: string, serverId: string): IntegrationRecord {
    const value = this.get(workspace, serverId);
    if (!value) throw new Blocked("MCP_NOT_CONFIGURED", `Integración no configurada: ${serverId}`);
    return value;
  }
  observeCatalog(workspace: string, serverId: string, configHash: string, catalog: Catalog): void {
    this.transaction(() => {
      const record = this.require(workspace,serverId);
      if (record.configHash!==configHash) throw new Blocked("MCP_CONFIG_CHANGED","La configuración cambió durante la conexión");
      this.putRecord({...record,catalog,updatedAt:now()});
      this.event(workspace,"integration.catalog_discovered",{serverId,hash:catalog.hash,tools:catalog.tools.map(t=>t.name)});
    });
  }
  authorizeCatalog(workspace: string, serverId: string, expectedHash: string): void {
    this.transaction(() => {
      const record=this.require(workspace,serverId);
      if (!record.catalog || record.catalog.hash!==expectedHash) throw new Blocked("MCP_CATALOG_CHANGED","Volvé a revisar el catálogo exacto antes de autorizarlo");
      this.putRecord({...record,authorizedCatalog:expectedHash,updatedAt:now()});
      this.event(workspace,"integration.catalog_authorized",{serverId,hash:expectedHash,actor:"user"});
    });
  }
  summaries(workspace: string): IntegrationSummary[] {
    const operations = this.operations(workspace);
    return this.list(workspace).map(r=>({id:r.config.id,title:r.config.title,kind:r.config.kind,enabled:r.config.enabled,configHash:r.configHash,catalogHash:r.catalog?.hash,authorized:Boolean(r.catalog&&r.authorizedCatalog===r.catalog.hash),tools:r.catalog?.tools.length??0,roles:r.config.roles,pending:operations.filter(o=>o.serverId===r.config.id&&o.state==="pending").length,status:!r.config.enabled?"desactivada":r.config.kind==="desktop"&&!r.config.grant?"elegir ventana":r.config.kind==="browser"?"aislada · lista":r.catalog?.hash!==r.authorizedCatalog||!r.catalog?"revisar catálogo":"autorizada"}));
  }
  operations(workspace: string, goalId?: string): IntegrationOperation[] {
    const rows=goalId?this.db.prepare("SELECT data FROM operations WHERE workspace=? AND goal_id=? ORDER BY rowid DESC LIMIT 500").all(workspace,goalId):this.db.prepare("SELECT data FROM operations WHERE workspace=? ORDER BY rowid DESC LIMIT 500").all(workspace);
    return rows.map(r=>JSON.parse(String(r.data)) as IntegrationOperation);
  }
  operation(operationId: string): IntegrationOperation | undefined {
    const row=this.db.prepare("SELECT data FROM operations WHERE id=?").get(operationId);
    return row?JSON.parse(String(row.data)) as IntegrationOperation:undefined;
  }
  private update(operation: IntegrationOperation): void {
    this.db.prepare("INSERT INTO operations VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data").run(operation.id,operation.workspace,operation.goalId,operation.serverId,operation.state,operation.logicalKey,JSON.stringify(operation));
  }
  begin(scope: OperationScope, record: IntegrationRecord, catalogHash: string, tool: string, args: Record<string, unknown>, effect: Effect, needsApproval: boolean): IntegrationOperation {
    return this.transaction(()=>{
      if(this.operations(scope.workspace,scope.goalId).some(o=>o.serverId===record.config.id&&o.state==="unknown")) throw new Blocked("MCP_OUTCOME_UNKNOWN","Hay una operación externa incierta. Revisala antes de enviar otra escritura o interacción.");
      const logicalKey=hash({workspace:scope.workspace,goalId:scope.goalId,taskId:scope.taskId,revision:scope.revision,model:scope.model,serverId:record.config.id,configHash:record.configHash,tool,args});
      if(effect==="write"){
        const previous=this.db.prepare("SELECT data FROM operations WHERE logical_key=? AND state='completed' ORDER BY rowid DESC LIMIT 1").get(logicalKey);
        if(previous) return JSON.parse(String(previous.data)) as IntegrationOperation;
      }
      const operation: IntegrationOperation={id:id("mcp-op"),workspace:scope.workspace,goalId:scope.goalId,runId:scope.runId,serverId:record.config.id,configHash:record.configHash,catalogHash,tool,arguments:args,effect,scope,digest:hash({scope,server:record.config.id,configHash:record.configHash,catalogHash,tool,args,effect}),logicalKey,state:needsApproval?"pending":"approved",createdAt:now(),expiresAt:new Date(Date.now()+record.config.approvalTimeoutMs).toISOString()};
      this.update(operation);this.event(scope.workspace,needsApproval?"integration.approval_required":"integration.operation_prepared",{id:operation.id,serverId:operation.serverId,tool,digest:operation.digest,goalId:scope.goalId,runId:scope.runId});return operation;
    });
  }
  decide(workspace: string, operationId: string, digest: string, allow: boolean): void {
    this.transaction(()=>{
      const op=this.operation(operationId);
      if(!op||op.workspace!==workspace||op.digest!==digest||op.state!=="pending"||Date.parse(op.expiresAt)<=Date.now()) throw new Blocked("MCP_APPROVAL_STALE","La aprobación ya no corresponde a una operación pendiente vigente");
      const record=this.require(workspace,op.serverId);
      if(!record.config.enabled||record.configHash!==op.configHash) throw new Blocked("MCP_CONFIG_CHANGED","La conexión cambió o fue revocada");
      this.update({...op,state:allow?"approved":"denied"});this.event(workspace,"integration.approval_decided",{id:op.id,allow,actor:"user",digest});
    });
  }
  async wait(operation: IntegrationOperation, signal: AbortSignal, guard:()=>void): Promise<void> {
    try {
      while(true){
        signal.throwIfAborted();guard();const op=this.operation(operation.id)!;
        if(Date.parse(op.expiresAt)<=Date.now()){this.update({...op,state:"expired"});throw new Blocked("MCP_APPROVAL_TIMEOUT","La autorización venció sin ejecutar la operación");}
        if(op.state==="approved") return;
        if(op.state!=="pending") throw new Blocked("MCP_APPROVAL_DENIED","El usuario no autorizó esta operación");
        await delay(150,undefined,{signal});
      }
    } catch(error){
      const op=this.operation(operation.id);if(op&&["pending","approved"].includes(op.state))this.update({...op,state:"denied",error:"Interrumpida antes de ejecutar"});throw error;
    }
  }
  claim(operationId: string, digest: string): void {
    this.transaction(()=>{
      const op=this.operation(operationId);
      if(!op||op.digest!==digest||op.state!=="approved"||Date.parse(op.expiresAt)<=Date.now()) throw new Blocked("MCP_APPROVAL_USED","La autorización no es reutilizable");
      const record=this.require(op.workspace,op.serverId);
      if(!record.config.enabled||record.configHash!==op.configHash)throw new Blocked("MCP_REVOKED","La integración fue revocada");
      this.update({...op,state:"running"});this.event(op.workspace,"integration.operation_started",{id:op.id,goalId:op.goalId,runId:op.runId,tool:op.tool,argsHash:hash(op.arguments)});
    });
  }
  finish(operationId: string, result: IntegrationResult): void {
    this.transaction(()=>{const op=this.operation(operationId)!;if(op.state!=="running")throw new Blocked("MCP_OPERATION_STATE","Operación no activa");this.update({...op,state:"completed",result});this.event(op.workspace,"integration.operation_completed",{id:op.id,isError:result.isError??false,resultHash:hash(result)});});
  }
  uncertain(operationId: string, message: string): void {
    this.transaction(()=>{const op=this.operation(operationId);if(!op||op.state!=="running")return;this.update({...op,state:op.effect==="read"?"denied":"unknown",error:message});this.event(op.workspace,"integration.operation_interrupted",{id:op.id,uncertain:op.effect!=="read"});});
  }
  reconcile(workspace:string,operationId:string,digest:string):void{
    this.transaction(()=>{const op=this.operation(operationId);if(!op||op.workspace!==workspace||op.digest!==digest||op.state!=="unknown")throw new Blocked("MCP_RECONCILE_SCOPE","Seleccioná la operación incierta exacta");this.update({...op,state:"reconciled",error:"El usuario revisó el servicio y confirma que no se ejecutó"});this.event(workspace,"integration.operation_reconciled",{id:op.id,actor:"user",claim:"not-executed"});});
  }
  interruptRun(runId:string):void{
    this.transaction(()=>{const rows=this.db.prepare("SELECT data FROM operations WHERE state IN ('running','approved','pending')").all();for(const row of rows){const op=JSON.parse(String(row.data)) as IntegrationOperation;if(op.runId===runId)this.update({...op,state:op.state==="running"&&op.effect!=="read"?"unknown":"denied",error:"Ejecución terminada o interrumpida"});}});
  }
  resource(resourceId:string,goalId:string,kind:"container"|"network",data:unknown):void{
    this.db.prepare("INSERT INTO resources VALUES(?,?,?,?,?)").run(resourceId,goalId,kind,process.pid,JSON.stringify(data));
  }
  resources():{id:string;goalId:string;kind:"container"|"network";ownerPid:number;data:unknown}[]{return this.db.prepare("SELECT * FROM resources").all().map(r=>({id:String(r.id),goalId:String(r.goal_id),kind:r.kind as "container"|"network",ownerPid:Number(r.owner_pid),data:JSON.parse(String(r.data))}));}
  removeResource(resourceId:string):void{this.db.prepare("DELETE FROM resources WHERE id=?").run(resourceId);}
}
