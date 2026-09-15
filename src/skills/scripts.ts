import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";
import type { Goal } from "../domain/model.js";
import type { PerfectConfig } from "../config/schema.js";
import type { ExecutionRunner } from "../ports/execution.js";
import { copySnapshot } from "../adapters/git/workspace.js";
import { id, Blocked } from "../domain/util.js";
import { releaseBytes, safeResource } from "./importer.js";
import type { SkillRelease } from "./model.js";

export const SkillScriptSchema = z.object({ id: z.string().min(1).max(64), resource: z.string().max(512), args: z.array(z.string().max(2048)).max(32).default([]) }).strict();
/** Scripts receive only a clean task snapshot and the explicitly loaded skill. */
export async function executeSkillScript(input: { goal: Goal; workspace: string; release: SkillRelease; resource: string; args: string[]; config: PerfectConfig; runner: ExecutionRunner; signal: AbortSignal; guard: () => void }) {
  input.guard(); safeResource(input.resource);
  if (!input.resource.startsWith("scripts/") || !/\.(?:js|mjs|py|sh)$/.test(input.resource)) throw new Blocked("SKILL_SCRIPT_TYPE", "Solo scripts Node/Python/sh de la habilidad cargada");
  releaseBytes(input.release, input.resource);
  const executable = input.resource.endsWith(".py") ? "python3" : input.resource.endsWith(".sh") ? "sh" : "node";
  if (!input.config.permissions.allowedExecutables.includes(executable)) throw new Blocked("SKILL_SCRIPT_PERMISSION", "El perfil no tiene permiso para este intérprete");
  const parent = join(input.goal.root, "skill-scripts"); await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(parent, "run-")), workspace = join(temporary, "workspace");
  await copySnapshot(input.workspace, workspace, input.config);
  const skillRoot = join(workspace, "__perfect_loaded_skill__");
  try { await mkdir(skillRoot, { mode: 0o700 }); } catch { throw new Blocked("SKILL_STAGE_COLLISION", "El proyecto ya utiliza la ruta reservada de scripts"); }
  for (const path of Object.keys(input.release.files)) {
    safeResource(path); const target = join(skillRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, releaseBytes(input.release, path), { flag: "wx", mode: 0o600 });
  }
  input.guard();
  const output = await input.runner.command({ goalId: input.goal.id, workspace, revision: input.goal.candidateRevision, artifactsDir: join(input.goal.root, "artifacts", id("skill-script")), signal: input.signal }, { executable, args: [join("__perfect_loaded_skill__", input.resource).replaceAll("\\", "/"), ...input.args], cwd: ".", timeoutMs: Math.min(input.config.limits.timeoutPerTask, 120000) });
  input.guard();
  return { code: output.code, stdout: output.stdout, stderr: output.stderr, sourceHash: input.release.hash, note: "Ejecutado en sandbox. No se importó ninguna escritura a la fuente ni se declaró verificación aprobada." };
}
