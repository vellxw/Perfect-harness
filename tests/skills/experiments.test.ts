import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { SkillsRegistry } from "../../src/skills/registry.js";
import { pairVerdict,proposeTrial,authorizeTrial,trialReport,TrialSpecSchema } from "../../src/skills/experiments.js";
import { inspectReceipt } from "../../src/skills/control.js";
import { releaseFromFiles } from "../../src/skills/importer.js";

test("comparador separa calidad, regresión, empate y ambos-fallan",()=>{
 assert.equal(pairVerdict(true,true),"both-pass");assert.equal(pairVerdict(false,true),"improvement");assert.equal(pairVerdict(true,false),"regression");assert.equal(pairVerdict(false,false),"both-fail");
});
test("borrador se autoriza solo para evaluación sin aprobación de producción",()=>{
 const store=new SqliteStore(":memory:"),base=defaultConfig(),registry=new SkillsRegistry(store),workspace="/fixture/eval";
 try{
  registry.get(workspace,base);
  const r=releaseFromFiles({files:{"SKILL.md":Buffer.from('---\nname: criterio-sql\ndescription: Contratos con PostgreSQL.\nlicense: MIT\n---\nSiempre usar parámetros.\n')},defaultSets:["backend"],triggers:["sql"],privacy:"public",provenance:{kind:"draft",source:"local:test",license:"MIT",redistribution:"allowed"},creatorRunId:"author"});registry.quarantine(r,workspace);
  const spec={releaseId:r.id,profileId:"backend",partition:"holdout",cases:[{id:"dev",kind:"response",prompt:"Explicar consulta segura",partition:"development",contains:["parámetro"]},{id:"holdout",kind:"response",prompt:"Cómo ejecutar SQL seguro",partition:"holdout",contains:["parámetro"]}]};
  const t=proposeTrial(store,workspace,base,spec);assert.equal(t.status,"proposed");
  assert.throws(()=>authorizeTrial(store,t.id,t.specHash,workspace,[],"EVALUAR"),/SKILL_INSPECT_FIRST/);
  const seen=inspectReceipt(store,workspace,r);const allowed=authorizeTrial(store,t.id,t.specHash,workspace,[seen.id],"EVALUAR");assert.equal(allowed.status,"authorized");
  assert.equal(store.list("skillSelections").some(s=>s.releaseId===r.id),false);
  const report=trialReport(store,t.id);assert.equal(report.complete,false);assert.equal(report.qualityPassed,false);
  registry.setMaster(false);assert.throws(()=>proposeTrial(store,workspace,base,spec),/SKILLS_OFF/);
 }finally{store.close();}
});
test("contrato de evaluación reserva casos y limita cuotas; no acepta JSON arbitrario como resultado real",()=>{
 assert.throws(()=>TrialSpecSchema.parse({releaseId:"r",profileId:"backend",partition:"holdout",cases:[{id:"only",kind:"response",prompt:"Consulta de backend",partition:"development",contains:["ok"]}]}));
 const store=new SqliteStore(":memory:");try{assert.throws(()=>trialReport(store,"imported-real-report"),/EVAL_UNKNOWN/);}finally{store.close();}
});
