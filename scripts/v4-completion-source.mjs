// Temporary, audited source reconciliation. Never part of a runtime/installer.
import fs from 'node:fs';
const replace=(p,a,b)=>{const s=fs.readFileSync(p,'utf8');if(s.split(a).length!==2)throw Error('Source anchor must match exactly once: '+p+' '+a.slice(0,90));fs.writeFileSync(p,s.replace(a,b));};
const prepend=(p,s)=>fs.writeFileSync(p,s+fs.readFileSync(p,'utf8'));
prepend('src/ports/state-store.ts','import type {SkillControl,SkillInspection,SkillDecision} from "../skills/control.js";\nimport type {TrialRecord,TrialOutcome} from "../skills/experiments.js";\n');
replace('src/ports/state-store.ts','export interface EntityMap {','export interface EntityMap {\n  skillControls:SkillControl;\n  skillInspections:SkillInspection;\n  skillDecisions:SkillDecision;\n  skillTrials:TrialRecord;\n  skillTrialOutcomes:TrialOutcome;');
prepend('src/skills/model.ts','import type {SkillPin} from "./control.js";\n');
replace('src/skills/model.ts','export interface StudioSnapshot {','export interface StudioSnapshot {\n  skillManual?:SkillPin[];');
// Historical config/snapshot hashes are unchanged. Manual state is separate and defaults empty.
replace('src/adapters/sqlite/store.ts','if ((version.version ?? 0) > 2)','if ((version.version ?? 0) > 3)');
replace('src/adapters/sqlite/store.ts','    if (version.version === 1 && path !== ":memory:") {','    if (version.version === 2 && path !== ":memory:") {\n      const backup=resolve(path)+".before-v4-complete.sqlite";\n      if(!existsSync(backup))this.db.prepare("VACUUM INTO ?").run(backup);\n      chmodSync(backup,0o600);\n    }\n    if (version.version === 1 && path !== ":memory:") {');
replace('src/adapters/sqlite/store.ts','    if (path !== ":memory:") chmodSync(path, 0o600);','    this.db.prepare("INSERT OR IGNORE INTO migrations VALUES(3,?)").run(now());\n    if (path !== ":memory:") chmodSync(path, 0o600);');
replace('src/adapters/sqlite/store.ts','          "skillEvaluations",','          "skillEvaluations", "skillInspections", "skillDecisions", "skillTrialOutcomes",');
prepend('src/skills/registry.ts','import {invalidateSkills,control} from "./control.js";\n');
replace('src/skills/registry.ts','      if (!enabled) this.pauseAffected();','      invalidateSkills(this.store);\n      if (!enabled) this.pauseAffected();');
replace('src/skills/registry.ts','  private pauseAffected(workspace?: string): void {','  private pauseAffected(workspace?: string): void {\n    invalidateSkills(this.store,workspace);');
replace('src/skills/registry.ts','      skillLock: this.lock(goal.source),','      skillLock: this.lock(goal.source),\n      skillManual: structuredClone(control(this.store,goal.source).manual),');
replace('src/skills/registry.ts','    const key = studioId(workspace);\n    this.store.put(','    const decision=this.store.get("skillDecisions",reviewer);\n    if(!decision||decision.workspace!==workspace||decision.releaseId!==releaseId||decision.hash!==expectedHash||decision.action!=="approve")throw new Blocked("SKILL_USER_DECISION","Se requiere una aprobación real del usuario ligada a la inspección de esta versión");\n    const key = studioId(workspace);\n    this.store.put(');
prepend('src/skills/session.ts','import {control,epoch,pinned,snapshotPins} from "./control.js";\n');
replace('src/skills/session.ts','  private readonly initialHash: string;','  private readonly initialHash: string;\n  private readonly initialEpoch:string;');
replace('src/skills/session.ts','    this.initialHash = this.registry.get(goal.source, base).hash;','    this.initialHash = this.registry.get(goal.source, base).hash;\n    this.initialEpoch=epoch(store,goal.source);');
replace('src/skills/session.ts','    for (const r of this.loaded.values())','    if(epoch(this.store,this.goal.source)!==this.initialEpoch)throw new Blocked("SKILL_POLICY_REVOKED","Cambió la política. Reiniciá la sesión con contexto limpio");\n    for (const r of this.loaded.values())');
replace('src/skills/session.ts','    const live = this.registry.get(this.goal.source, this.base).config;','    const live = this.registry.get(this.goal.source, this.base).config;\n    if((frozen.skills.mode === "manual" || live.skills.mode === "manual") && (!pinned(snapshotPins(this.store,this.goal),r)||!pinned(control(this.store,this.goal.source).manual,r)))return false;');
const session=fs.readFileSync('src/skills/session.ts','utf8'),start=session.indexOf('  auto(task: string): string {'),end=session.indexOf('  private record(',start);
if(start<0||end<start)throw Error('auto method missing');
fs.writeFileSync('src/skills/session.ts',session.slice(0,start)+`  auto(task: string): string {
    this.guard();
    const cfg=this.registry.forGoal(this.goal,this.base);
    if(!this.registry.masterEnabled()||cfg.skills.mode === "off")return "";
    const available=this.candidates();
    const explicit=available.filter(r=>pinned(snapshotPins(this.store,this.goal),r)&&pinned(control(this.store,this.goal.source).manual,r));
    if(explicit.length>cfg.skills.maxActive)throw new Blocked("SKILL_ACTIVE_LIMIT","Reducí la selección de este perfil; no se omitieron skills manuales");
    const automatic=cfg.skills.mode === "auto-curated"?available.filter(r=>!explicit.some(e=>e.id===r.id)&&matchesTask(r,task)):[];
    return [...explicit,...automatic.slice(0,cfg.skills.maxActive-explicit.length)].map(r=>this.load(r.skillId,explicit.includes(r)?"Selección manual del usuario":"Coincidencia de tarea dentro del equipo")).join("\\n\\n");
  }
`+session.slice(end));
// Runtime cancellation includes live policy revisions, even an OFF/ON change between tool calls.
prepend('src/application/agent-executor.ts','import {policyLease} from "../skills/control.js";\nimport {evaluationContext,type EvaluationInvocation} from "../skills/experiments.js";\n');
replace('src/application/agent-executor.ts','export interface Invocation {','export interface Invocation {\n  evaluation?:EvaluationInvocation;\n  requestGuard?:(requestId:string,runId:string,tokens:number)=>void;\n  usageObserver?:(usage:Usage)=>void;');
replace('src/application/agent-executor.ts','    const signal = AbortSignal.any([','    let signal = AbortSignal.any([');
replace('src/application/agent-executor.ts','      const services = this.services(','      const trial=input.evaluation?evaluationContext(this.store,input.evaluation,profile.profile):undefined;\n      const origin=input.evaluation?this.store.get("skillTrials",input.evaluation.trialId)!.workspace:input.goal.source;\n      const revocation=policyLease(this.store,origin,signal,input.evaluation?()=>{evaluationContext(this.store,input.evaluation!,profile.profile);}:undefined);\n      signal=revocation.signal;\n      try {\n      const services = this.services(');
replace('src/application/agent-executor.ts','      const catalog = skillSession.list();','      const catalog = trial ? [] : skillSession.list();');
replace('src/application/agent-executor.ts','        input.role === "planner"\n          ? ""','        trial ? trial.procedures : input.role === "planner"\n          ? ""');
replace('src/application/agent-executor.ts','        const output = await this.runtime.run({','        const output = await this.runtime.run({\n          toolAllowlist:trial?.tools,\n          disableIntegrations:Boolean(trial),');
replace('src/application/agent-executor.ts','            budget.reserve(requestId, run.id, route, tokens, cost);','            input.requestGuard?.(requestId,run.id,tokens);\n            budget.reserve(requestId, run.id, route, tokens, cost);');
replace('src/application/agent-executor.ts','            budget.settle(usage);','            budget.settle(usage);\n            input.usageObserver?.(usage);');
replace('src/application/agent-executor.ts','        budget.interrupt(run.id);\n      }\n    });','        budget.interrupt(run.id);\n      }\n      } finally {revocation.close();}\n    });');
replace('src/ports/agent-runtime.ts','export interface AgentRequest {','export interface AgentRequest {\n  toolAllowlist?:string[];\n  disableIntegrations?:boolean;');
replace('src/adapters/pi/runtime.ts','    const integrations = await AgentIntegrations.create(','    const integrations = request.disableIntegrations ? undefined : await AgentIntegrations.create(');
replace('src/adapters/pi/runtime.ts','      submitted = true;\n    });','      submitted = true;\n    }).filter(t=>!request.toolAllowlist || request.toolAllowlist.includes(t.name));');
// Boolean no-regression is not quality success; keep old API honest too.
replace('src/skills/evaluator.ts','      passed: !a.passed || b.passed,','      passed: b.passed,');
// Explicit user actions and receipts; no model tool can mutate these collections.
prepend('src/skills/actions.ts','import {TrialSpecSchema} from "./experiments.js";\n');
replace('src/skills/actions.ts','export const StudioActionSchema = z.discriminatedUnion("command", [',`export const StudioActionSchema = z.discriminatedUnion("command", [
 z.object({command:z.literal("manual-select"),releaseId:z.string(),hash:Sha256,selected:z.boolean(),expectedEpoch:z.number().int().nonnegative(),pins:z.array(z.object({skillId:Key,releaseId:z.string(),hash:Sha256}).strict()),confirmation:z.literal("SELECCIONAR")}).strict(),
 z.object({command:z.literal("collect-draft"),goalId:z.string(),folder:z.string(),setIds:z.array(Key).min(1),license:z.string(),triggers:z.array(z.string()).max(30),confirmation:z.literal("RECOPILAR")}).strict(),
 z.object({command:z.literal("trial-propose"),spec:TrialSpecSchema}).strict(),
 z.object({command:z.literal("trial-authorize"),trialId:z.string(),specHash:Sha256,inspectionIds:z.array(z.string()),confirmation:z.literal("EVALUAR")}).strict(),
 z.object({command:z.literal("trial-run"),trialId:z.string(),confirmation:z.literal("EJECUTAR")}).strict(),
 z.object({command:z.literal("trial-cancel"),trialId:z.string()}).strict(),
 z.object({command:z.literal("trial-report"),trialId:z.string()}).strict(),`);
prepend('src/skills/admin.ts',`import {control,selectManual,selectionClosure,inspectReceipt,userDecision} from "./control.js";
import {collectDraft} from "./creator.js";
import {proposeTrial,authorizeTrial,runTrial,verifiedTrialReport,trialReport} from "./experiments.js";
import {PreparedDockerRunner} from "../adapters/sandbox/prepared-runner.js";
`);
replace('src/skills/admin.ts','export interface StudioPanelSnapshot {','export interface StudioPanelSnapshot {\n  control:ReturnType<typeof control>;\n  trials:ReturnType<typeof trialReport>[];');
replace('src/skills/admin.ts','    reviewed: boolean;','    reviewed: boolean;\n    inspectionId?:string;\n    pins:ReturnType<typeof selectionClosure>;');
replace('src/skills/admin.ts','  readonly registry: SkillsRegistry;','  readonly registry: SkillsRegistry;\n  private executions=new Map<string,{abort:AbortController;promise:Promise<unknown>}>();\n  async close():Promise<void>{for(const x of this.executions.values())x.abort.abort();await Promise.allSettled([...this.executions.values()].map(x=>x.promise));}');
replace('src/skills/admin.ts','      workspace,\n      masterEnabled:','      workspace,\n      control:control(this.store,workspace),\n      trials:this.store.list("skillTrials",studioId(workspace)).map(t=>trialReport(this.store,t.id)),\n      masterEnabled:');
replace('src/skills/admin.ts','          reviewed: s?.reviewedHash === r.hash,','          reviewed: s?.reviewedHash === r.hash,\n          inspectionId:this.store.list("skillInspections",studioId(workspace)).filter(i=>i.releaseId===r.id&&i.hash===r.hash).at(-1)?.id,\n          pins:(()=>{try{return selectionClosure(this.store,workspace,r.id);}catch{return [];}})(),');
replace('src/skills/admin.ts','    switch (action.command) {',`    switch (action.command) {
      case "manual-select": selectManual(this.store,workspace,base,action.releaseId,action.hash,action.selected,action.expectedEpoch,action.pins);await this.writeLock(workspace);return {message:"Selección manual guardada por hash. Las sesiones activas deben reiniciarse sin perder el trabajo."};
      case "collect-draft": {const result=await collectDraft({...action,store:this.store,base,workspace});return {message:result.message,content:JSON.stringify(result,null,2)};}
      case "trial-propose": {const result=proposeTrial(this.store,workspace,base,action.spec);return {message:"Contrato propuesto, sin inferencias. Revisá casos, versión y límites antes de autorizar.",content:JSON.stringify(result,null,2)};}
      case "trial-authorize": {const result=authorizeTrial(this.store,action.trialId,action.specHash,workspace,action.inspectionIds,action.confirmation);return {message:"Evaluación autorizada, sin aprobar el paquete para producción. Ejecutar consume la cuota indicada.",content:JSON.stringify(result,null,2)};}
      case "trial-run": {
        const t=this.store.get("skillTrials",action.trialId);if(!t||t.workspace!==workspace)throw new Blocked("EVAL_WORKSPACE","Evaluación ajena");
        if(this.executions.size)throw new Blocked("EVAL_BUSY","Ya hay una evaluación activa");
        const abort=new AbortController();const promise=runTrial({store:this.store,home:this.home,base,runtime:new PiRuntime(this.home,base),runner:new PreparedDockerRunner(base,this.store,join(this.home,"sandbox")),trialId:t.id,signal:AbortSignal.any([signal,abort.signal])});
        this.executions.set(t.id,{abort,promise});try{return {message:"Evaluación terminada. No se aprueba ni activa la skill automáticamente.",content:JSON.stringify(await promise,null,2)};}finally{this.executions.delete(t.id);}
      }
      case "trial-cancel": {const t=this.store.get("skillTrials",action.trialId);if(!t||t.workspace!==workspace)throw new Blocked("EVAL_WORKSPACE","Evaluación ajena");this.store.put("skillTrials",{...t,status:"cancelled"},"skill.trial_cancelled","user");this.executions.get(t.id)?.abort.abort();return {message:"Cancelación solicitada. Se preservan evidencia, cuotas e intentos."};}
      case "trial-report": return {message:"Comparación con evidencia del controlador",content:JSON.stringify(await verifiedTrialReport(this.store,workspace,action.trialId),null,2)};`);
replace('src/skills/admin.ts','      case "inspect": {\n        const release = this.scopedRelease(workspace, action.releaseId, base);','      case "inspect": {\n        const release = this.scopedRelease(workspace, action.releaseId, base);\n        inspectReceipt(this.store,workspace,release);');
replace('src/skills/admin.ts','        this.registry.approve(workspace, action.releaseId, action.hash, "user");','        const inspection=this.store.list("skillInspections",studioId(workspace)).filter(i=>i.releaseId===release.id&&i.hash===release.hash).at(-1);\n        if(!inspection)throw new Blocked("SKILL_INSPECT_FIRST","Inspeccioná el contenido de esta versión primero");\n        const decision=userDecision(this.store,workspace,release,"approve",inspection.id);\n        this.registry.approve(workspace, action.releaseId, action.hash, decision.id);');
console.log('V4 control, quarantine evaluation and real SDK restrictions reconciled. No credentials read.');
