import { z } from "zod";
import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import { Blocked } from "../domain/util.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { git } from "../adapters/git/process.js";
import { safePath } from "../tools/paths.js";
import { importDirectory } from "./importer.js";
import { SkillsRegistry } from "./registry.js";
import { evaluateStructure } from "./evaluator.js";
import { Key } from "./model.js";

export const DraftBriefSchema=z.object({
 name:Key,team:Key,problem:z.string().min(10).max(6000),when:z.string().min(5).max(2000),avoid:z.string().min(5).max(2000),
 inputs:z.string().min(3).max(2000),output:z.string().min(3).max(2000),checks:z.string().min(5).max(4000),
 license:z.enum(["MIT","Apache-2.0","CC-BY-SA-4.0","Proprietary-local"]).default("MIT")
}).strict();
export type DraftBrief=z.infer<typeof DraftBriefSchema>;
export function draftInstruction(raw:unknown):string {
 const b=DraftBriefSchema.parse(raw);
 return `Crear únicamente un borrador de habilidad en ${b.name}/SKILL.md, con recursos pertinentes y casos de selección positivos, negativos y ambiguos. Equipo: ${b.team}. No instalar, activar ni autoaprobar. No declarar derechos sobre contenido ajeno.\nProblema: ${b.problem}\nCuándo: ${b.when}\nNo usar: ${b.avoid}\nEntradas: ${b.inputs}\nSalida: ${b.output}\nPruebas de aceptación: ${b.checks}\nLicencia de contenido original autorizada: ${b.license}\nSeparar casos de desarrollo de casos reservados. Usar nombres seguros, frontmatter válido y dependencias mínimas. El Judge comprueba el borrador; su uso se aprueba después mediante acciones separadas.`;
}
export async function collectDraft(input:{store:StateStore;base:PerfectConfig;workspace:string;goalId:string;folder:string;setIds:string[];license:string;triggers:string[]}):Promise<{releaseId:string;hash:string;status:"quarantine";message:string}> {
 const {store,base,workspace}=input,goal=store.get("goals",input.goalId);
 if(!goal||goal.source!==workspace||goal.state!=="DONE")throw new Blocked("SKILL_CREATOR_GOAL","Se necesita una goal propia completada por el Judge");
 const registry=new SkillsRegistry(store),cfg=registry.get(workspace,base).config;
 if(!input.setIds.length||input.setIds.some(k=>!cfg.sets.some(s=>s.id===k&&s.enabled)))throw new Blocked("SKILL_CREATOR_TEAM","Equipo no disponible");
 if(!["MIT","Apache-2.0","CC-BY-SA-4.0","Proprietary-local"].includes(input.license))throw new Blocked("SKILL_CREATOR_LICENSE","Elegí la licencia de contenido que te pertenece");
 const manager=new GitWorkspace(goal.root,base);
 if(await manager.revision()!==goal.candidateRevision||(await git(manager.repo,["status","--porcelain"])).trim())throw new Blocked("SKILL_CREATOR_DRIFT","El candidato cambió después de verificarse");
 const run=store.list("runs",goal.id).filter(r=>r.profileId==="skill-author"&&r.status==="completed").at(-1);
 if(!run)throw new Blocked("SKILL_CREATOR_AUTHOR","No hay ejecución de autor completada y trazable");
 const release=await importDirectory(await safePath(manager.repo,input.folder),workspace,{provenance:{kind:"draft",source:`goal:${goal.id}/${input.folder}`,commit:goal.candidateRevision,license:input.license,redistribution:input.license==="Proprietary-local"?"local-only":"allowed",adaptation:"Borrador con autoría y candidato verificados. Declaración de licencia del usuario; no concede derechos de terceros."},defaultSets:input.setIds,triggers:input.triggers,creatorRunId:run.id,privacy:goal.privacyClass});
 registry.quarantine(release,workspace);
 const check=evaluateStructure(release,workspace);store.put("skillEvaluations",check,"skill.draft_structure_checked","user");
 return {releaseId:release.id,hash:release.hash,status:"quarantine",message:"Borrador recopilado sin activar. Inspeccioná los recursos y autorizá su evaluación separada; la aprobación de producción es posterior."};
}
