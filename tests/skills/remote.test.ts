import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { importGithubSkill } from "../../src/skills/remote.js";
import { releaseBytes } from "../../src/skills/importer.js";

const content = Buffer.from('---\nname: demo-skill\ndescription: Prueba de habilidad por equipo.\n---\n\nLeé [referencia](references/check.md).\n');
const license=Buffer.from('MIT License\nPermission is hereby granted, free of charge, to any person obtaining a copy.\n');
const blob=(b:Buffer)=>createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
const input={repository:"fixture/skills",commit:"a".repeat(40),path:"skills/demo-skill",licenseFiles:["LICENSE"],defaultSets:["backend"],triggers:["postgres"]};
function transport(truncated=false,tamper=false){
 const files:{[key:string]:Buffer}={"skills/demo-skill/SKILL.md":content,"skills/demo-skill/references/check.md":Buffer.from("Referencia sintética"),LICENSE:license};
 return async(url:string)=>{
  if(url.includes("/git/trees/"))return Buffer.from(JSON.stringify({truncated,tree:Object.entries(files).map(([path,data])=>({path,type:"blob",mode:"100644",size:data.length,sha:blob(data)}))}));
  const name=decodeURIComponent(url.split("/"+input.commit+"/")[1]??"");const data=files[name];if(!data)throw Error("Unexpected fetch "+url);
  return tamper&&name.endsWith("SKILL.md")?Buffer.concat([data,Buffer.from("changed")]):data;
 };
}
test("importador usa solo commit fijado, conserva licencia y rechaza árbol incompleto",async()=>{
 const r=await importGithubSkill(input,new AbortController().signal,transport());
 assert.equal(r.provenance.commit,input.commit);assert.equal(r.provenance.redistribution,"allowed");assert.deepEqual(r.defaultSets,["backend"]);assert.ok(releaseBytes(r,"SKILL.md").equals(content));
 await assert.rejects(()=>importGithubSkill({...input,commit:"main"},new AbortController().signal,transport()));
 await assert.rejects(()=>importGithubSkill(input,new AbortController().signal,transport(true)),/TRUNCATED/);
});
test("contenido no coincide con Git blob, fuentes excluidas y licencias desconocidas se bloquean",async()=>{
 await assert.rejects(()=>importGithubSkill(input,new AbortController().signal,transport(false,true)),/INTEGRITY/);
 await assert.rejects(()=>importGithubSkill({...input,repository:"chuspeeism/dashi-motion"},new AbortController().signal,transport()),/LICENSE/);
 await assert.rejects(()=>importGithubSkill({...input,repository:"supabase/agent-skills"},new AbortController().signal,transport()),/EXCLUDED/);
 await assert.rejects(()=>importGithubSkill({...input,repository:"Jakubantalik/transitions.dev",path:"pro/skills",localOnly:true},new AbortController().signal,transport()),/TRANSITIONS_SCOPE/);
});
