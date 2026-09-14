import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../../src/config/schema.js";
import { defaultStudio, resolveProfile, profileDefinition } from "../../src/agents/profiles.js";
import { StudioConfigSchema } from "../../src/skills/model.js";
import { builtinSkills } from "../../src/skills/library.js";
import { skillAccess, matchesTask, managedSkillPath } from "../../src/skills/policy.js";
import { parseSkill, releaseBytes, releaseFromFiles, safeResource } from "../../src/skills/importer.js";
import { cleanEnvironment } from "../../src/integrations/wire.js";

test("equipos filtran conocimientos aunque usan el mismo modelo", () => {
 const config = defaultStudio(defaultConfig()), backend = resolveProfile(config, "backend").profile, frontend = resolveProfile(config, "frontend").profile;
 frontend.binding = structuredClone(backend.binding);
 const skill = builtinSkills().find(s => s.skillId === "perfect-postgres-backend")!;
 const selection = { id:"selection",goalId:"registry",workspace:"test",skillId:skill.skillId,releaseId:skill.id,enabled:true,reviewedHash:skill.hash,updatedAt:"now" };
 assert.equal(skillAccess(config,backend,skill,selection).allowed,true);
 assert.equal(skillAccess(config,frontend,skill,selection).allowed,false);
 config.skills.assignments.push({skillId:skill.skillId,scope:"global",decision:"enable"});
 assert.equal(skillAccess(config,frontend,skill,selection).allowed,true);
 config.skills.assignments.push({skillId:skill.skillId,scope:"set",target:"frontend-web",decision:"disable"});
 assert.equal(skillAccess(config,frontend,skill,selection).allowed,false);
 config.skills.mode="off";
 assert.equal(skillAccess(config,backend,skill,selection).allowed,false);
});
test("Superpowers no reaparece por asignación global y el reviewer nunca escribe",()=>{
 const c=defaultStudio(defaultConfig()), p=resolveProfile(c,"general").profile, r=builtinSkills()[0]!;
 const s={id:"s",goalId:"r",workspace:"w",skillId:r.skillId,releaseId:r.id,enabled:true,reviewedHash:r.hash,updatedAt:"now"};
 c.skills.assignments.push({skillId:r.skillId,scope:"global",decision:"enable"});
 assert.equal(skillAccess(c,p,{...r,packageId:"superpowers"},s).allowed,false);
 c.profiles.find(p=>p.id==="oracle")!.readOnly=false;
 assert.throws(()=>StudioConfigSchema.parse(c));
});
test("perfiles independientes conservan responsabilidad, equipos y binding",()=>{
 const c=defaultStudio(defaultConfig());c.activeMode="game-creator";
 const game=resolveProfile(c,"general"); assert.equal(game.profile.id,"gameplay");assert.deepEqual(game.profile.setIds,["gameplay"]);
 assert.equal(profileDefinition(game).id,"general");
 assert.throws(()=>resolveProfile(c,"backend","gameplay"),/PROFILE_SCOPE/);
 assert.throws(()=>resolveProfile(c,"general","motion-ae"),/PROFILE_SCOPE/);
 c.sets.find(s=>s.id==="gameplay")!.enabled=false;
 assert.throws(()=>resolveProfile(c,"general"),/SET_DISABLED/);
});
test("SKILL.md admite YAML real, rechaza alias/duplicados y verifica cada byte",()=>{
 assert.equal(parseSkill('---\nname: prueba\ndescription: |\n  Habilidad multilínea\n  en español\n---\nContenido').metadata.name,"prueba");
 assert.throws(()=>parseSkill('---\nname: uno\nname: dos\ndescription: hola\n---\nTest'));
 assert.throws(()=>parseSkill('---\nname: prueba\ndescription: &x hola\nmetadata: *x\n---\nTest'));
 const r=builtinSkills()[0]!;assert.ok(releaseBytes(r,"SKILL.md").length);
 const changed=structuredClone(r);changed.files["SKILL.md"]!.base64=Buffer.from("cambio").toString("base64");
 assert.throws(()=>releaseBytes(changed,"SKILL.md"),/SKILL_INTEGRITY/);
 for(const path of ["../secret","/root","a\\b","C:secret","con.txt","a/../b","a//b"])assert.throws(()=>safeResource(path));
 assert.equal(managedSkillPath(".agents/skills/privada/SKILL.md"),true);
 assert.throws(()=>releaseFromFiles({files:{"SKILL.md":Buffer.from("x"),"font.ttf":Buffer.from("font")},provenance:{kind:"local",source:"local",license:"MIT",redistribution:"allowed"},defaultSets:[]}),/SKILL_RESOURCE_DENIED/);
});
test("activadores distinguen tarea y exclusiones y no fuerzan procedimientos",()=>{
 const skill=builtinSkills().find(s=>s.skillId==="perfect-beam-design")!;
 assert.equal(matchesTask(skill,"poner un borde luminoso"),true);
 assert.equal(matchesTask({...skill,excludes:["sin beam"]},"diseño sin beam"),false);
 assert.equal(matchesTask(skill,"crear API PostgreSQL"),false);
});
test("entorno MCP preserva nombres Windows sin heredar credenciales ni flags",()=>{
 const env=cleanEnvironment("C:\\safe",{}, {SystemRoot:"C:\\Windows",Path:"C:\\tools",GITHUB_TOKEN:"no-heredar",NODE_OPTIONS:"--bad"});
 assert.equal(env.SYSTEMROOT,"C:\\Windows");assert.equal(env.PATH,"C:\\tools");
 assert.equal(env.GITHUB_TOKEN,undefined);assert.equal(env.NODE_OPTIONS,"");
 assert.throws(()=>cleanEnvironment("C:\\safe",{Path:"OTHER"},{OTHER:"x"}),/MCP_ENV_DENIED/);
});
