import { z } from "zod";
import { Blocked, hash, id, now } from "../domain/util.js";
import type { SkillRelease, SkillEvaluation } from "./model.js";
import { parseSkill, releaseBytes, safeResource } from "./importer.js";
import { matchesTask } from "./policy.js";

export const SelectionCaseSchema = z
  .object({
    id: z.string().min(1).max(100),
    prompt: z.string().min(1).max(10000),
    expected: z.boolean(),
    partition: z.enum(["development", "holdout"]),
  })
  .strict();
export type SelectionCase = z.infer<typeof SelectionCaseSchema>;
export function evaluateStructure(
  release: SkillRelease,
  workspace: string,
): SkillEvaluation {
  const checks: SkillEvaluation["checks"] = [];
  let body = "";
  try {
    body = releaseBytes(release, "SKILL.md").toString("utf8");
    parseSkill(body);
    checks.push({
      name: "Formato",
      passed: true,
      detail: "Cabecera y cuerpo válidos",
    });
  } catch (e) {
    checks.push({
      name: "Formato",
      passed: false,
      detail: String(e).slice(0, 400),
    });
  }
  for (const path of Object.keys(release.files)) {
    try {
      releaseBytes(release, path);
    } catch {
      checks.push({ name: "Integridad", passed: false, detail: path });
    }
  }
  const references = [...body.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)]
    .map((m) => m[1]!)
    .filter((p) => !/^(?:https?:|#)/.test(p));
  for (const reference of references) {
    const file = reference.replace(/^\.\//, "").split("#")[0]!;
    try {
      safeResource(file);
      checks.push({
        name: "Referencia",
        passed: Boolean(release.files[file]),
        detail: file,
      });
    } catch {
      checks.push({
        name: "Referencia fuera del paquete",
        passed: false,
        detail: file,
      });
    }
  }
  checks.push({
    name: "Licencia",
    passed: release.provenance.redistribution !== "unknown",
    detail: release.provenance.license,
  });
  checks.push({
    name: "Ámbito",
    passed: release.defaultSets.length > 0,
    detail: release.defaultSets.join(", ") || "Requiere asignación explícita",
  });
  if (Object.keys(release.files).some((p) => p.startsWith("scripts/")))
    checks.push({
      name: "Scripts",
      passed: true,
      detail:
        "Existen scripts: esta comprobación NO autoriza ejecutarlos ni certifica seguridad",
    });
  return {
    id: id("skill-evaluation"),
    goalId: "skill-evaluations",
    workspace,
    releaseId: release.id,
    kind: "structure",
    status: checks.every((c) => c.passed) ? "passed" : "failed",
    checks,
    runs: [],
    datasetHash: hash({ release: release.hash, references }),
    mode: "deterministic",
    createdAt: now(),
  };
}
export function evaluateSelection(
  release: SkillRelease,
  workspace: string,
  cases: unknown,
  partition: "development" | "holdout",
): SkillEvaluation {
  const parsed = z.array(SelectionCaseSchema).min(4).max(500).parse(cases);
  if (new Set(parsed.map((c) => c.id)).size !== parsed.length)
    throw new Blocked("EVAL_DUPLICATE", "Los casos deben tener ID único");
  const chosen = parsed.filter((c) => c.partition === partition);
  if (!chosen.some((c) => c.expected) || !chosen.some((c) => !c.expected))
    throw new Blocked(
      "EVAL_BALANCE",
      "Se necesitan casos positivos y negativos en la partición",
    );
  const checks = chosen.map((c) => ({
    name: c.id,
    passed: matchesTask(release, c.prompt) === c.expected,
    detail: `Selección determinista: esperado ${c.expected}, observado ${matchesTask(release, c.prompt)}. No evalúa calidad de un LLM.`,
  }));
  return {
    id: id("skill-evaluation"),
    goalId: "skill-evaluations",
    workspace,
    releaseId: release.id,
    kind: "selection",
    status: checks.every((c) => c.passed) ? "passed" : "failed",
    checks,
    runs: [],
    datasetHash: hash(chosen),
    mode: "deterministic",
    createdAt: now(),
  };
}
export interface BehavioralRun {
  id: string;
  condition: "baseline" | "skill";
  caseId: string;
  partition: "development" | "holdout";
  bindingHash: string;
  toolsHash: string;
  inputHash: string;
  outputHash: string;
  passed: boolean;
  source: "real" | "mock";
  tokens?: number;
  latencyMs: number;
}
/** A pairing report, not a statistical claim of universal superiority. */
export function compareBehavior(
  release: SkillRelease,
  workspace: string,
  runs: BehavioralRun[],
  partition: "development" | "holdout",
): SkillEvaluation {
  const chosen = runs.filter((r) => r.partition === partition);
  if (
    chosen.length < 2 ||
    new Set(chosen.map((r) => r.id)).size !== chosen.length
  )
    throw new Blocked("EVAL_RUNS", "Faltan ejecuciones independientes");
  const checks: SkillEvaluation["checks"] = [];
  for (const caseId of new Set(chosen.map((r) => r.caseId))) {
    const pair = chosen.filter((r) => r.caseId === caseId),
      a = pair.find((r) => r.condition === "baseline"),
      b = pair.find((r) => r.condition === "skill");
    if (
      pair.length !== 2 ||
      !a ||
      !b ||
      a.bindingHash !== b.bindingHash ||
      a.toolsHash !== b.toolsHash ||
      a.inputHash !== b.inputHash ||
      a.id === b.id
    )
      throw new Blocked(
        "EVAL_PAIR",
        "Las condiciones no son comparables o comparten ejecución",
      );
    checks.push({
      name: caseId,
      passed: b.passed,
      detail: `Sin skill: ${a.passed}; con skill: ${b.passed}. Evidencia ${a.outputHash}/${b.outputHash}.`,
    });
  }
  const mode = chosen.every((r) => r.source === "real") ? "real" : "mock";
  return {
    id: id("skill-evaluation"),
    goalId: "skill-evaluations",
    workspace,
    releaseId: release.id,
    kind: "behavior",
    status:
      mode === "mock"
        ? "not-tested"
        : checks.every((c) => c.passed)
          ? "passed"
          : "failed",
    checks,
    runs: chosen.map((r) => r.id),
    datasetHash: hash(chosen.map((r) => [r.caseId, r.inputHash])),
    mode,
    createdAt: now(),
  };
}
