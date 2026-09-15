import test from "node:test";
import assert from "node:assert/strict";
import { builtinSkills } from "../../src/skills/library.js";
import { releaseBytes } from "../../src/skills/importer.js";
import { evaluateStructure } from "../../src/skills/evaluator.js";

test("biblioteca seleccionada contiene recursos originales fijados, licencias y TDD manual", () => {
 const skills=builtinSkills();
 for(const id of ["perfect-tdd-matt","perfect-react-vercel","perfect-impeccable-polish"]){
  const s=skills.find(s=>s.skillId===id);assert.ok(s,id);assert.match(s.provenance.commit!,/^[a-f0-9]{40}$/);
  assert.equal(s.provenance.redistribution,"allowed");assert.ok(Object.keys(s.files).some(p=>p.startsWith("references/")));
  assert.equal(evaluateStructure(s,"fixture").status,"passed");
  assert.ok(releaseBytes(s,"SKILL.md").length);
 }
 assert.deepEqual(skills.find(s=>s.skillId==="perfect-tdd-matt")!.triggers,[]);
 assert.equal(skills.some(s=>/supabase|superpowers|dashi-motion|transitions-dev/.test(s.skillId)),false);
});
