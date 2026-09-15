import { z } from "zod";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import type { AgentRuntime } from "../ports/agent-runtime.js";
import type { ExecutionRunner } from "../ports/execution.js";
import type { AgentProfile, StudioConfig } from "./model.js";
import type { Usage, Task } from "../domain/model.js";
import { TaskSpecSchema } from "../domain/model.js";
import { Blocked, hash, id, now } from "../domain/util.js";
import { createGoal } from "../application/goals.js";
import { AgentExecutor } from "../application/agent-executor.js";
import { OwnershipManager } from "../application/ownership.js";
import {
  GitWorkspace,
  copySnapshot,
  manifest,
} from "../adapters/git/workspace.js";
import { SkillsRegistry, studioId } from "./registry.js";
import { releaseBytes } from "./importer.js";
import { skillAccess, estimateTokens } from "./policy.js";
import { controlId, epoch, userDecision } from "./control.js";
import { resolveProfile } from "../agents/profiles.js";

const CaseBase = {
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  prompt: z.string().min(8).max(8000),
  partition: z.enum(["development", "holdout"]),
};
export const TrialCaseSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...CaseBase,
      kind: z.literal("response"),
      contains: z.array(z.string().min(1).max(200)).max(20).default([]),
      excludes: z.array(z.string().min(1).max(200)).max(20).default([]),
      exact: z.string().max(16000).optional(),
    })
    .strict(),
  z
    .object({
      ...CaseBase,
      kind: z.literal("code"),
      exportName: z.string().regex(/^[A-Za-z_$][\w$]{0,60}$/),
      examples: z
        .array(
          z
            .object({ args: z.array(z.json()).max(10), expected: z.json() })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict(),
]);
export const TrialSpecSchema = z
  .object({
    releaseId: z.string().min(1).max(100),
    baselineReleaseId: z.string().min(1).max(100).optional(),
    profileId: z.string().min(1).max(64),
    cases: z.array(TrialCaseSchema).min(2).max(20),
    partition: z.enum(["development", "holdout"]),
    repetitions: z.number().int().min(1).max(3).default(1),
    publicData: z.boolean().default(false),
    resources: z.array(z.string().max(512)).max(8).default([]),
    maxRequests: z.number().int().min(2).max(48).default(16),
    maxTokens: z.number().int().min(8000).max(500000).default(96000),
    timeoutMs: z.number().int().min(1000).max(1200000).default(600000),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (new Set(s.cases.map((c) => c.id)).size !== s.cases.length)
      ctx.addIssue({ code: "custom", message: "Casos duplicados" });
    if (
      !s.cases.some((c) => c.partition === "development") ||
      !s.cases.some((c) => c.partition === "holdout")
    )
      ctx.addIssue({
        code: "custom",
        message: "Separá casos de desarrollo y reservados",
      });
    if (
      s.cases.filter((c) => c.partition === s.partition).length *
        s.repetitions >
      6
    )
      ctx.addIssue({
        code: "custom",
        message: "Máximo seis pares por evaluación",
      });
    for (const c of s.cases)
      if (
        c.kind === "response" &&
        c.exact === undefined &&
        !c.contains.length &&
        !c.excludes.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Falta comprobación de respuesta",
        });
  });
export type TrialSpec = z.infer<typeof TrialSpecSchema>;
export type TrialCase = z.infer<typeof TrialCaseSchema>;
export type TrialCondition = "baseline" | "candidate";
export interface TrialRecord {
  id: string;
  goalId: string;
  workspace: string;
  spec: TrialSpec;
  specHash: string;
  profile: AgentProfile;
  studio: StudioConfig;
  studioHash: string;
  releaseHashes: Record<string, string>;
  policyEpoch: string;
  decisions: string[];
  status:
    | "proposed"
    | "authorized"
    | "running"
    | "completed"
    | "interrupted"
    | "cancelled";
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  failure?: string;
  requestReservations: {
    requestId: string;
    runId: string;
    upper: number;
    used?: number;
  }[];
  outcomes: string[];
  attempts: number;
  ownerPid?: number;
  reportPath?: string;
}
export interface TrialOutcome {
  id: string;
  goalId: string;
  trialId: string;
  executionGoalId: string;
  runId: string;
  caseId: string;
  repetition: number;
  condition: TrialCondition;
  kind: "response" | "code";
  passed: boolean;
  inputHash: string;
  bindingHash: string;
  toolsHash: string;
  outputHash: string;
  revision: string;
  environment: Record<string, unknown>;
  artifactPath: string;
  artifactHash: string;
  latencyMs: number;
  tokens?: number;
  source: "real" | "mock";
  capturedAt: string;
}
export interface EvaluationInvocation {
  trialId: string;
  caseId: string;
  repetition: number;
  condition: TrialCondition;
  executionGoalId: string;
}
const Response = z.object({ answer: z.string().max(16000) }).strict();
const Completion = z.object({ summary: z.string().min(1).max(3000) }).strict();
export function pairVerdict(
  a: boolean,
  b: boolean,
): "both-pass" | "improvement" | "regression" | "both-fail" {
  return a ? (b ? "both-pass" : "regression") : b ? "improvement" : "both-fail";
}
function assertTrial(store: StateStore, trial: TrialRecord): void {
  if (
    hash(trial.spec) !== trial.specHash ||
    hash(trial.studio) !== trial.studioHash
  )
    throw new Blocked("EVAL_INTEGRITY", "El contrato de evaluación cambió");
  const registry = new SkillsRegistry(store);
  if (
    !registry.masterEnabled() ||
    store.get("studios", studioId(trial.workspace))?.config.skills.mode ===
      "off"
  )
    throw new Blocked(
      "SKILLS_OFF",
      "La evaluación respeta el apagado de skills",
    );
  if (epoch(store, trial.workspace) !== trial.policyEpoch)
    throw new Blocked(
      "EVAL_POLICY_CHANGED",
      "Cambió la política: no se continúa con autorización anterior",
    );
  for (const [releaseId, versionHash] of Object.entries(trial.releaseHashes)) {
    const r = store.get("skillReleases", releaseId);
    if (!r || r.hash !== versionHash)
      throw new Blocked("EVAL_VERSION_CHANGED", releaseId);
    if (
      !trial.decisions.some((key) => {
        const d = store.get("skillDecisions", key);
        return (
          d?.workspace === trial.workspace &&
          d.releaseId === r.id &&
          d.hash === r.hash &&
          d.action === "evaluation"
        );
      })
    )
      throw new Blocked(
        "EVAL_AUTHORIZATION",
        "Falta autorización de evaluación del borrador exacto",
      );
  }
}
export function evaluationContext(
  store: StateStore,
  invocation: EvaluationInvocation,
  profile: AgentProfile,
): { procedures: string; tools: string[] } {
  const t = store.get("skillTrials", invocation.trialId);
  if (!t || t.status !== "running" || t.ownerPid !== process.pid)
    throw new Blocked(
      "EVAL_NOT_RUNNING",
      "Evaluación no activa en este controlador",
    );
  assertTrial(store, t);
  if (
    hash(profile) !== hash(t.profile) ||
    !t.spec.cases.some(
      (c) => c.id === invocation.caseId && c.partition === t.spec.partition,
    ) ||
    invocation.repetition < 0 ||
    invocation.repetition >= t.spec.repetitions
  )
    throw new Blocked("EVAL_SCOPE", "Perfil/caso fuera del permiso");
  const goal = store.get("goals", invocation.executionGoalId);
  if (
    !goal ||
    !store
      .events(goal.id)
      .some(
        (e) =>
          e.type === "skill.trial_link" &&
          (e.payload as { trialId?: string }).trialId === t.id,
      )
  )
    throw new Blocked(
      "EVAL_GOAL_SCOPE",
      "La ejecución no pertenece a la evaluación",
    );
  const caseSpec = t.spec.cases.find((c) => c.id === invocation.caseId)!;
  const tools =
    caseSpec.kind === "response"
      ? ["submit_result"]
      : ["list_files", "read_file", "write_file", "submit_result"];
  const releaseId =
    invocation.condition === "candidate"
      ? t.spec.releaseId
      : t.spec.baselineReleaseId;
  if (!releaseId) return { procedures: "", tools };
  const r = store.get("skillReleases", releaseId)!;
  // A draft permission is confined to this trial. No production selection is mutated.
  const cfg = structuredClone(t.studio);
  cfg.skills.mode = "auto-curated";
  const access = skillAccess(
    cfg,
    profile,
    r,
    {
      id: "evaluation-only",
      goalId: t.id,
      workspace: t.workspace,
      skillId: r.skillId,
      releaseId: r.id,
      enabled: true,
      reviewedHash: r.hash,
      updatedAt: t.createdAt,
    },
    t.spec.publicData ? "public" : "private",
  );
  if (!access.allowed) throw new Blocked("EVAL_SKILL_SCOPE", access.reason);
  if (r.dependencies.length)
    throw new Blocked(
      "EVAL_DEPENDENCIES",
      "Esta evaluación pequeña exige un paquete autocontenido; no activa dependencias sin permiso",
    );
  const texts = ["SKILL.md", ...t.spec.resources].map(
    (name) =>
      `<procedure-resource hash="${r.hash}" path="${name}">\n${releaseBytes(r, name).toString("utf8")}\n</procedure-resource>`,
  );
  const procedures = texts.join("\n");
  if (estimateTokens(procedures) > t.studio.skills.maxContextTokens)
    throw new Blocked(
      "EVAL_CONTEXT_LIMIT",
      "Los recursos exceden el presupuesto; no se truncaron",
    );
  return { procedures, tools };
}
export function proposeTrial(
  store: StateStore,
  workspace: string,
  base: PerfectConfig,
  raw: unknown,
): TrialRecord {
  const spec = TrialSpecSchema.parse(raw),
    registry = new SkillsRegistry(store),
    record = registry.get(workspace, base);
  if (!registry.masterEnabled() || record.config.skills.mode === "off")
    throw new Blocked(
      "SKILLS_OFF",
      "Habilitá el sistema antes de proponer una evaluación",
    );
  const profile = record.config.profiles.find(
    (p) => p.id === spec.profileId && p.enabled,
  );
  if (!profile) throw new Blocked("EVAL_PROFILE", "Perfil desconocido");
  resolveProfile(record.config, profile.role, profile.id);
  if (
    spec.cases.some((c) => c.kind === "code") &&
    (profile.readOnly || ["planner", "oracle", "visual"].includes(profile.role))
  )
    throw new Blocked("EVAL_READ_ONLY", "Este perfil no puede producir código");
  if (profile.binding.billingMode === "metered")
    throw new Blocked(
      "EVAL_PAYMENT",
      "Las evaluaciones no habilitan pago por token",
    );
  const releaseHashes: Record<string, string> = {};
  for (const rid of [spec.releaseId, spec.baselineReleaseId].filter(
    (v): v is string => Boolean(v),
  )) {
    const r = store.get("skillReleases", rid);
    if (!r) throw new Blocked("EVAL_RELEASE", rid);
    const known =
      store
        .list("skillSelections", studioId(workspace))
        .some((s) => s.releaseId === rid) ||
      store
        .events(studioId(workspace))
        .some(
          (e) =>
            e.type === "skill.import_pending" &&
            (e.payload as { releaseId?: string }).releaseId === rid,
        );
    if (!known)
      throw new Blocked(
        "EVAL_WORKSPACE",
        "La versión no está disponible en esta carpeta",
      );
    releaseHashes[rid] = r.hash;
  }
  const key = id("skill-trial"),
    trial: TrialRecord = {
      id: key,
      goalId: controlId(workspace),
      workspace,
      spec,
      specHash: hash(spec),
      profile: structuredClone(profile),
      studio: structuredClone(record.config),
      studioHash: hash(record.config),
      releaseHashes,
      policyEpoch: epoch(store, workspace),
      decisions: [],
      status: "proposed",
      createdAt: now(),
      requestReservations: [],
      outcomes: [],
      attempts: 0,
    };
  store.put("skillTrials", trial, "skill.trial_proposed", "user");
  return trial;
}
export function authorizeTrial(
  store: StateStore,
  trialId: string,
  expectedHash: string,
  workspace: string,
  inspectionIds: string[],
  confirmation: string,
): TrialRecord {
  return store.transaction(() => {
    const t = store.get("skillTrials", trialId);
    if (
      !t ||
      t.workspace !== workspace ||
      t.specHash !== expectedHash ||
      !["proposed", "interrupted"].includes(t.status) ||
      confirmation !== "EVALUAR"
    )
      throw new Blocked(
        "EVAL_CONFIRM",
        "Revisá contrato y presupuesto y escribí EVALUAR",
      );
    if (epoch(store, workspace) !== t.policyEpoch)
      throw new Blocked(
        "EVAL_POLICY_CHANGED",
        "Proponé un nuevo contrato con la política actual",
      );
    const decisions = Object.keys(t.releaseHashes).map((rid) => {
      const r = store.get("skillReleases", rid)!;
      const inspection = inspectionIds
        .map((i) => store.get("skillInspections", i))
        .find(
          (i) =>
            i?.workspace === workspace &&
            i.releaseId === rid &&
            i.hash === r.hash,
        );
      if (!inspection) throw new Blocked("SKILL_INSPECT_FIRST", rid);
      return userDecision(store, workspace, r, "evaluation", inspection.id).id;
    });
    const value = { ...t, decisions, status: "authorized" as const };
    assertTrial(store, value);
    store.put("skillTrials", value, "skill.trial_authorized", "user");
    return value;
  });
}
export function trialReport(store: StateStore, trialId: string) {
  const t = store.get("skillTrials", trialId);
  if (!t) throw new Blocked("EVAL_UNKNOWN", trialId);
  const records = t.outcomes.map((key) => store.get("skillTrialOutcomes", key));
  const pairs = t.spec.cases
    .filter((c) => c.partition === t.spec.partition)
    .flatMap((c) =>
      Array.from({ length: t.spec.repetitions }, (_, repetition) => {
        const a = records.find(
            (o) =>
              o?.caseId === c.id &&
              o.repetition === repetition &&
              o.condition === "baseline",
          ),
          b = records.find(
            (o) =>
              o?.caseId === c.id &&
              o.repetition === repetition &&
              o.condition === "candidate",
          );
        const valid = (o: TrialOutcome | undefined) =>
          Boolean(
            o &&
              store.get("runs", o.runId)?.status === "completed" &&
              store.get("runs", o.runId)?.goalId === o.executionGoalId,
          );
        return {
          caseId: c.id,
          repetition,
          verdict:
            valid(a) && valid(b)
              ? pairVerdict(a!.passed, b!.passed)
              : "incomplete",
          baseline: a?.id,
          candidate: b?.id,
          qualityPassed: valid(b) && b!.passed,
          noRegression: valid(a) && valid(b) ? !a!.passed || b!.passed : null,
        };
      }),
    );
  const real = records.length > 0 && records.every((o) => o?.source === "real");
  return {
    trialId: t.id,
    status: t.status,
    specHash: t.specHash,
    mode: real ? "real" : "mock-or-unexecuted",
    pairs,
    qualityPassed: pairs.length > 0 && pairs.every((p) => p.qualityPassed),
    complete: pairs.every((p) => p.verdict !== "incomplete"),
    claims: real
      ? "Resultados observados en estos casos; no demuestran superioridad universal."
      : "Validación del evaluador con datos sintéticos/no ejecutados; no certifica calidad de modelos.",
    requests: t.requestReservations.length,
    tokens: t.requestReservations.reduce((s, r) => s + (r.used ?? r.upper), 0),
    failure: t.failure,
  };
}
function reserveTrial(
  store: StateStore,
  trialId: string,
  requestId: string,
  runId: string,
  upper: number,
): void {
  store.transaction(() => {
    const t = store.get("skillTrials", trialId)!;
    assertTrial(store, t);
    if (t.status !== "running")
      throw new Blocked("EVAL_CANCELLED", "Evaluación detenida");
    if (t.requestReservations.some((r) => r.requestId === requestId)) return;
    if (
      t.requestReservations.length >= t.spec.maxRequests ||
      t.requestReservations.reduce((s, r) => s + (r.used ?? r.upper), 0) +
        upper >
        t.spec.maxTokens
    )
      throw new Blocked(
        "EVAL_BUDGET",
        "Presupuesto agregado agotado; incluye reintentos y reservas inciertas",
      );
    store.put(
      "skillTrials",
      {
        ...t,
        requestReservations: [
          ...t.requestReservations,
          { requestId, runId, upper },
        ],
      },
      "skill.trial_request_reserved",
    );
  });
}
function settleTrial(store: StateStore, trialId: string, usage: Usage): void {
  const t = store.get("skillTrials", trialId)!;
  store.put(
    "skillTrials",
    {
      ...t,
      requestReservations: t.requestReservations.map((r) =>
        r.requestId === usage.requestId ? { ...r, used: usage.totalTokens } : r,
      ),
    },
    "skill.trial_usage_recorded",
  );
}
export async function runTrial(input: {
  store: StateStore;
  home: string;
  base: PerfectConfig;
  runtime: AgentRuntime;
  runner: ExecutionRunner;
  trialId: string;
  signal: AbortSignal;
  mode?: "real" | "mock";
}): Promise<ReturnType<typeof trialReport>> {
  const { store, base } = input;
  let trial = store.get("skillTrials", input.trialId);
  if (!trial || trial.status !== "authorized")
    throw new Blocked("EVAL_NOT_AUTHORIZED", "Autorizá la evaluación primero");
  assertTrial(store, trial);
  if (trial.attempts >= 2)
    throw new Blocked(
      "EVAL_ATTEMPT_LIMIT",
      "Límite de reanudación alcanzado; conservá el informe y proponé otra evaluación",
    );
  if (trial.status === "authorized" && trial.ownerPid) {
    try {
      process.kill(trial.ownerPid, 0);
      throw new Blocked("EVAL_BUSY", "Otro proceso continúa activo");
    } catch (e) {
      if (e instanceof Blocked) throw e;
    }
  }
  trial = {
    ...trial,
    status: "running",
    attempts: trial.attempts + 1,
    ownerPid: process.pid,
    startedAt: now(),
  };
  store.put("skillTrials", trial, "skill.trial_started");
  const deadline = AbortSignal.any([
      input.signal,
      AbortSignal.timeout(trial.spec.timeoutMs),
    ]),
    cancel = new AbortController(),
    signal = AbortSignal.any([deadline, cancel.signal]);
  const timer = setInterval(() => {
    try {
      const live = store.get("skillTrials", trial!.id)!;
      assertTrial(store, live);
      if (live.status !== "running")
        throw new Blocked("EVAL_CANCELLED", "Evaluación detenida");
    } catch (e) {
      cancel.abort(e);
    }
  }, 75);
  timer.unref();
  const root = join(input.home, "skill-evaluations", trial.id);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const config = structuredClone(base);
  config.permissions.researchHosts = [];
  config.limits.maxAgentTurns = Math.min(config.limits.maxAgentTurns, 6);
  config.limits.maxOutputTokens = Math.min(config.limits.maxOutputTokens, 3000);
  config.budgets.allowMetered = false;
  const executor = new AgentExecutor(
      store,
      input.runtime,
      input.runner,
      config,
      trial.spec.publicData,
    ),
    registry = new SkillsRegistry(store);
  try {
    for (const c of trial.spec.cases.filter(
      (c) => c.partition === trial!.spec.partition,
    ))
      for (
        let repetition = 0;
        repetition < trial.spec.repetitions;
        repetition++
      )
        for (const condition of ["baseline", "candidate"] as const) {
          signal.throwIfAborted();
          const existing = store.get("skillTrials", trial.id)!;
          if (
            existing.outcomes.some((key) => {
              const o = store.get("skillTrialOutcomes", key);
              return (
                o?.caseId === c.id &&
                o.condition === condition &&
                o.repetition === repetition
              );
            })
          )
            continue;
          const source = await realpath(await mkdtemp(join(root, "input-")));
          if (c.kind === "code")
            await writeFile(
              join(source, "solution.mjs"),
              "// Implementar el contrato pedido.\n",
            );
          let goal = await createGoal(
            {
              request: c.prompt,
              source,
              home: input.home,
              config,
              privacy: trial.spec.publicData ? "public" : "private",
              mode: input.mode ?? "real",
            },
            store,
          );
          store.event(goal.id, "skill.trial_link", {
            trialId: trial.id,
            condition,
            caseId: c.id,
            repetition,
          });
          const current = registry.get(source, config);
          store.put(
            "studios",
            { ...current, config: trial.studio, hash: trial.studioHash },
            "skill.eval_context_created",
          );
          goal = {
            ...goal,
            studioSnapshotId: registry.snapshot(goal, config).id,
          };
          store.put("goals", goal, "skill.eval_snapshot_pinned");
          const manager = new GitWorkspace(goal.root, config),
            cwd = manager.repo,
            owner = new OwnershipManager(store);
          const spec = TaskSpecSchema.parse({
            id: id("eval-task"),
            title: "Evaluación aislada",
            description: c.prompt,
            type: "general",
            assignedAgent: ["planner", "oracle", "visual"].includes(
              trial.profile.role,
            )
              ? "general"
              : trial.profile.role,
            profileId: trial.profile.id,
            ownedFiles: c.kind === "code" ? ["solution.mjs"] : [],
            acceptanceCriteria: ["evaluation-output"],
            relevantFiles: c.kind === "code" ? ["solution.mjs"] : [],
          });
          const task = {
            ...spec,
            goalId: goal.id,
            id: spec.id,
            planId: "evaluation",
            status: "running",
            attempt: 1,
            maxAttempts: 1,
            baseRevision: goal.candidateRevision,
            createdAt: now(),
            updatedAt: now(),
            outputs: [],
            evidence: [],
            dependencyOutputVersions: {},
            requiredReviews: [],
            model: trial.profile.binding.model,
            reasoning: trial.profile.binding.reasoning,
            triggerFailureIds: [],
          } as Task;
          const lease =
            c.kind === "code"
              ? owner.acquire(task, cwd, config.limits.timeoutPerTask)
              : undefined;
          const start = performance.now();
          try {
            const result = await executor.invoke(
              {
                goal,
                role: trial.profile.role,
                profileId: trial.profile.id,
                task: c.kind === "code" ? task : undefined,
                leaseId: lease?.id,
                workspace: cwd,
                evaluation: {
                  trialId: trial.id,
                  caseId: c.id,
                  repetition,
                  condition,
                  executionGoalId: goal.id,
                },
                requestGuard: (req, run, upper) =>
                  reserveTrial(store, trial!.id, req, run, upper),
                usageObserver: (u) => settleTrial(store, trial!.id, u),
                instruction:
                  c.kind === "response"
                    ? `Respondé el caso como texto en answer. No tenés red, MCP ni comandos.\n${c.prompt}`
                    : `Implementá en solution.mjs un módulo JavaScript ESM con export ${c.exportName}. No tenés red, MCP ni acceso al verificador. Respondé con summary al terminar.\n${c.prompt}`,
                schema: z.toJSONSchema(
                  c.kind === "response" ? Response : Completion,
                ),
                parse: (v) =>
                  (c.kind === "response" ? Response : Completion).parse(v),
              },
              signal,
            );
            let passed = false,
              observed: unknown,
              environment: Record<string, unknown> = { kind: c.kind },
              revision = goal.candidateRevision;
            if (c.kind === "response") {
              const answer = Response.parse(result.output.result).answer;
              observed = answer;
              passed =
                (c.exact === undefined || answer === c.exact) &&
                c.contains.every((x) => answer.includes(x)) &&
                c.excludes.every((x) => !answer.includes(x));
            } else {
              const verify = await mkdtemp(join(root, "verify-"));
              await copySnapshot(cwd, verify, config);
              const nonce = id("evaluation-result"),
                driver = `import * as m from './solution.mjs';\nconst results=[];for(const args of ${JSON.stringify(c.examples.map((e) => e.args))}){try{results.push({ok:true,value:await m[${JSON.stringify(c.exportName)}](...args)});}catch(e){results.push({ok:false,error:String(e).slice(0,300)});}}\nconsole.log(${JSON.stringify(nonce)}+JSON.stringify(results));\n`;
              await writeFile(join(verify, "controller-check.mjs"), driver, {
                flag: "wx",
              });
              const check = await input.runner.command(
                {
                  goalId: goal.id,
                  workspace: verify,
                  revision: goal.candidateRevision,
                  artifactsDir: join(root, result.run.id + "-verification"),
                  signal,
                },
                {
                  executable: "node",
                  args: ["controller-check.mjs"],
                  cwd: ".",
                  timeoutMs: 30000,
                },
              );
              const lines = check.stdout
                .split(/\r?\n/)
                .filter((l) => l.startsWith(nonce));
              let outputs: unknown;
              try {
                outputs =
                  lines.length === 1
                    ? JSON.parse(lines[0]!.slice(nonce.length))
                    : undefined;
              } catch {
                outputs = undefined;
              }
              passed =
                check.code === 0 &&
                Array.isArray(outputs) &&
                outputs.length === c.examples.length &&
                outputs.every(
                  (value, index) =>
                    value?.ok === true &&
                    hash(value.value) === hash(c.examples[index]!.expected),
                );
              observed = {
                code: check.code,
                stdout: check.stdout,
                stderr: check.stderr,
                outputs: outputs ?? null,
              };
              environment = check.environment ?? { metadata: "not-reported" };
              revision = hash(await manifest(cwd, config));
            }
            const artifactPath = join(root, result.run.id + ".json"),
              artifact = JSON.stringify(
                { runId: result.run.id, observed, environment },
                null,
                2,
              );
            await writeFile(artifactPath, artifact, {
              flag: "wx",
              mode: 0o600,
            });
            const outcome: TrialOutcome = {
              id: id("trial-outcome"),
              goalId: trial.id,
              trialId: trial.id,
              executionGoalId: goal.id,
              runId: result.run.id,
              caseId: c.id,
              repetition,
              condition,
              kind: c.kind,
              passed,
              inputHash: hash(c.prompt),
              bindingHash: hash(trial.profile.binding),
              toolsHash: hash(
                c.kind === "response"
                  ? ["submit_result"]
                  : ["list_files", "read_file", "write_file", "submit_result"],
              ),
              outputHash: hash(observed),
              revision,
              environment,
              artifactPath,
              artifactHash: hash(artifact),
              latencyMs: performance.now() - start,
              source:
                result.run.routeBinding.provenance === "mock" ? "mock" : "real",
              capturedAt: now(),
            };
            store.transaction(() => {
              store.put(
                "skillTrialOutcomes",
                outcome,
                "skill.trial_outcome_recorded",
              );
              const live = store.get("skillTrials", trial!.id)!;
              store.put(
                "skillTrials",
                { ...live, outcomes: [...live.outcomes, outcome.id] },
                "skill.trial_progress",
              );
            });
            store.put(
              "goals",
              {
                ...store.get("goals", goal.id)!,
                state: "PAUSED",
                pauseReason:
                  "EVALUATION_ONLY: evaluación terminada, no una aplicación DONE",
                updatedAt: now(),
              },
              "skill.eval_finished",
            );
          } finally {
            if (lease) owner.release(lease.id);
          }
        }
    const live = store.get("skillTrials", trial.id)!;
    store.put(
      "skillTrials",
      { ...live, status: "completed", ownerPid: undefined, endedAt: now() },
      "skill.trial_completed",
    );
  } catch (error) {
    const live = store.get("skillTrials", trial.id)!;
    store.put(
      "skillTrials",
      {
        ...live,
        status: signal.aborted ? "cancelled" : "interrupted",
        ownerPid: undefined,
        endedAt: now(),
        failure:
          error instanceof Error ? error.message : "Error de infraestructura",
      },
      "skill.trial_interrupted",
    );
    throw error;
  } finally {
    clearInterval(timer);
  }
  const report = trialReport(store, trial.id);
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  return report;
}
export async function verifiedTrialReport(
  store: StateStore,
  workspace: string,
  trialId: string,
) {
  const t = store.get("skillTrials", trialId);
  if (!t || t.workspace !== workspace)
    throw new Blocked("EVAL_WORKSPACE", "Informe ajeno");
  for (const key of t.outcomes) {
    const o = store.get("skillTrialOutcomes", key);
    if (!o || hash(await readFile(o.artifactPath, "utf8")) !== o.artifactHash)
      throw new Blocked(
        "EVAL_EVIDENCE_TAMPERED",
        "Evidencia ausente o alterada",
      );
  }
  return trialReport(store, trialId);
}
