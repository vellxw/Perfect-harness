import { readFile, writeFile, mkdir, cp, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { release as osRelease } from "node:os";
import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import { SkillsRegistry, studioId } from "../skills/registry.js";
import { PiRuntime } from "../adapters/pi/runtime.js";
import { IntegrationRegistry } from "../integrations/registry.js";
import { processRun } from "../adapters/git/process.js";
import { Blocked, hash, id, now } from "../domain/util.js";
import { createGoal } from "../application/goals.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { PreparedDockerRunner } from "../adapters/sandbox/prepared-runner.js";
import { VerificationService } from "../adapters/verification/service.js";
import { VerificationSpecSchema } from "../domain/model.js";
import { BLENDER_IMAGE } from "../adapters/blender/validation.js";

export type ValidationStatus =
  | "PASS"
  | "FAIL"
  | "BLOCKED"
  | "UNCONFIGURED"
  | "NOT_TESTED"
  | "NOT_APPLICABLE";
export interface CapabilityCheck {
  id: string;
  title: string;
  implemented: boolean;
  detected: ValidationStatus;
  configured: ValidationStatus;
  authorized: ValidationStatus;
  authenticated: ValidationStatus;
  invoked: ValidationStatus;
  verified: ValidationStatus;
  detail: string;
  profileId?: string;
  bindingHash?: string;
  next: string;
}
export interface LocalValidationReport {
  id: string;
  at: string;
  build: {
    version: string;
    sourceCommit: string;
    node: string;
    platform: string;
    osRelease: string;
  };
  checks: CapabilityCheck[];
  inferenceRequests: number;
  note: string;
}
export async function buildIdentity() {
  const pkg = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );
  let sourceCommit = "unknown";
  try {
    const info = JSON.parse(
      await readFile(new URL("../build-info.json", import.meta.url), "utf8"),
    );
    if (
      info.version === pkg.version &&
      /^[a-f0-9]{40}$/.test(info.sourceCommit)
    )
      sourceCommit = info.sourceCommit;
  } catch {}
  return {
    version: String(pkg.version),
    sourceCommit,
    node: process.version,
    platform: process.platform,
    osRelease: osRelease(),
  };
}
function pending(
  id: string,
  title: string,
  implemented = true,
): CapabilityCheck {
  return {
    id,
    title,
    implemented,
    detected: implemented ? "NOT_TESTED" : "NOT_APPLICABLE",
    configured: "UNCONFIGURED",
    authorized: "NOT_TESTED",
    authenticated: "NOT_TESTED",
    invoked: "NOT_TESTED",
    verified: "NOT_TESTED",
    detail: "",
    next: "",
  };
}
export function missingEditorChecks(): CapabilityCheck[] {
  return [
    {
      id: "after-effects",
      title: "After Effects",
      next: "Se necesita un adaptador nativo verificado; no alcanza con instalar el editor.",
    },
    {
      id: "rive",
      title: "Rive",
      next: "El navegador aislado local no controla el editor web; falta integración de autoría nativa.",
    },
    {
      id: "cavalry",
      title: "Cavalry",
      next: "No hay un ciclo abrir/guardar/exportar implementado y probado para este editor.",
    },
    {
      id: "image-generation",
      title: "Generación de imágenes",
      next: "Usá una referencia aportada. No se incluye una API de imágenes ni se habilita gasto automáticamente.",
    },
  ].map((x) => ({
    ...pending(x.id, x.title, false),
    detail:
      "Adaptador de producción no implementado. No se presenta como un problema de credenciales.",
    next: x.next,
  }));
}
export async function inspectLocal(
  store: StateStore,
  home: string,
  workspace: string,
  base: PerfectConfig,
): Promise<LocalValidationReport> {
  const cfg = new SkillsRegistry(store).get(workspace, base).config,
    checks: CapabilityCheck[] = [],
    pi = new PiRuntime(home, base);
  for (const profile of cfg.profiles.filter((p) => p.enabled)) {
    const c = pending("profile:" + profile.id, profile.name);
    c.profileId = profile.id;
    c.bindingHash = hash(profile.binding);
    c.implemented = true;
    try {
      const runtime = await pi.modelRuntime({
          ...profile.binding,
          id: profile.role,
          readOnly: profile.readOnly,
        }),
        model = runtime.getModel(
          profile.binding.provider,
          profile.binding.model,
        );
      c.detected = model ? "PASS" : "BLOCKED";
      const auth = await runtime.checkAuth(profile.binding.provider, {
        signal: AbortSignal.timeout(5000),
      });
      c.configured = auth
        ? auth.type === profile.binding.auth
          ? "PASS"
          : "BLOCKED"
        : "UNCONFIGURED";
      c.detail = `Solo catálogo/configuración: ${profile.binding.provider}/${profile.binding.model} · ${profile.binding.reasoning}. No se hizo inferencia ni se confirmó cuota.`;
      c.next = `Conectá ${profile.binding.provider} localmente y ejecutá la prueba explícita de este perfil.`;
    } catch {
      c.detected = "BLOCKED";
      c.detail =
        "No se pudo comprobar el catálogo local de esta ruta; revisá el perfil. No se imprimen credenciales ni errores remotos sin sanear.";
      c.next = "Abrí /perfiles y /diagnostico.";
    }
    checks.push(c);
  }
  const blender = pending("blender", "Blender aislado");
  try {
    const result = await processRun(
      "docker",
      ["image", "inspect", "--format", "{{.Id}}", BLENDER_IMAGE],
      { timeoutMs: 5000 },
    );
    blender.detected = result.code === 0 ? "PASS" : "BLOCKED";
    blender.configured = result.code === 0 ? "PASS" : "UNCONFIGURED";
  } catch {
    blender.detected = "BLOCKED";
  }
  blender.authenticated = "NOT_APPLICABLE";
  blender.detail =
    "Pipeline implementado: fuente editable, reapertura separada, GLB y render. La presencia de la imagen no es una prueba de producción.";
  blender.next =
    "Prepará Blender explícitamente y ejecutá la prueba local. No hay fallback al host.";
  checks.push(blender);
  const integrations = new IntegrationRegistry(home);
  try {
    for (const [kind, title] of [
      ["github", "GitHub MCP"],
      ["unity", "Unity Editor MCP"],
      ["desktop", "Escritorio Windows"],
    ]) {
      const c = pending(kind!, title!),
        r = integrations
          .list(workspace)
          .find((r) =>
            kind === "unity"
              ? r.config.kind === "mcp" && r.config.unity
              : r.config.kind === kind,
          );
      c.detected =
        kind === "desktop" && process.platform !== "win32"
          ? "NOT_APPLICABLE"
          : "PASS";
      c.configured = r ? "PASS" : "UNCONFIGURED";
      c.detail =
        kind === "unity"
          ? "Preset y broker implementados. Un descriptor o catálogo no demuestran compilación, Play Mode ni build."
          : kind === "desktop"
            ? "Control nativo implementado, limitado a una ventana autorizada. No se usa tu escritorio al diagnosticar."
            : "Cliente MCP implementado. La cuenta de esta conversación no se transfiere al producto.";
      c.next =
        kind === "unity"
          ? "Conectá el Editor de un proyecto temporal de confianza desde perfect unity; revisá permisos en /integraciones."
          : "Conectá/probá en /integraciones y autorizá únicamente las operaciones que correspondan.";
      checks.push(c);
    }
  } finally {
    integrations.close();
  }
  checks.push(...missingEditorChecks());
  const report: LocalValidationReport = {
    id: id("local-validation"),
    at: now(),
    build: await buildIdentity(),
    checks,
    inferenceRequests: 0,
    note: "Diagnóstico local sin inferencias. Detectado/configurado no equivale a autenticado, invocado o resultado verificado. Los editores no implementados se identifican como tales.",
  };
  store.event(studioId(workspace), "validation.local_report", report, "user");
  return report;
}
export function latestValidation(
  store: StateStore,
  workspace: string,
): LocalValidationReport | undefined {
  return store
    .events(studioId(workspace))
    .filter((e) => e.type === "validation.local_report")
    .at(-1)?.payload as LocalValidationReport | undefined;
}
export async function exportValidation(
  store: StateStore,
  home: string,
  workspace: string,
): Promise<{ path: string; report: LocalValidationReport }> {
  const report = latestValidation(store, workspace);
  if (!report)
    throw new Blocked("VALIDATION_FIRST", "Ejecutá el diagnóstico primero");
  const dir = join(home, "diagnostics", "exports");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, report.id + ".json");
  // Schema contains only whitelisted status/route/build fields, never credentials, source paths, prompts or raw logs.
  await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  return { path, report };
}
export async function smokeProfile(
  store: StateStore,
  home: string,
  workspace: string,
  base: PerfectConfig,
  profileId: string,
  contributorConsent: boolean,
  signal: AbortSignal,
) {
  const cfg = new SkillsRegistry(store).get(workspace, base).config,
    profile = cfg.profiles.find((p) => p.id === profileId && p.enabled);
  if (!profile) throw new Blocked("PROFILE_UNKNOWN", profileId);
  if (profile.binding.billingMode === "metered")
    throw new Blocked(
      "VALIDATION_METERED",
      "Esta prueba no habilita rutas de pago por token",
    );
  if (store.list("runs").some((r) => r.status === "running"))
    throw new Blocked(
      "VALIDATION_BUSY",
      "Terminá o pausá el trabajo activo antes del smoke",
    );
  const safe = structuredClone(base);
  safe.limits.maxAgentTurns = 4;
  safe.limits.maxGoalProviderRequests = 8;
  safe.limits.maxOutputTokens = Math.min(safe.limits.maxOutputTokens, 1200);
  safe.limits.contextTokens = Math.min(safe.limits.contextTokens, 14000);
  safe.budgets.allowMetered = false;
  const { providerSmoke } = await import("../cli/smoke.js");
  const result = await providerSmoke({
    home,
    config: safe,
    store,
    roles: [profile.role],
    profile,
    studioConfig: cfg,
    contributorConsent,
    signal,
  });
  let report = latestValidation(store, workspace);
  if (!report) report = await inspectLocal(store, home, workspace, base);
  const observed = result.checks[0],
    reportNext: LocalValidationReport = {
      ...report,
      id: id("local-validation"),
      at: now(),
      build: await buildIdentity(),
      inferenceRequests: result.checks.reduce(
        (n, c) => n + (c.requests ?? 0),
        0,
      ),
      checks: report.checks.map((c) =>
        c.profileId === profileId
          ? {
              ...c,
              authorized: "PASS",
              authenticated:
                observed?.status === "PASS" ? "PASS" : "NOT_TESTED",
              invoked: observed?.status === "PASS" ? "PASS" : "NOT_TESTED",
              verified: observed?.status === "PASS" ? "PASS" : "BLOCKED",
              bindingHash: hash(profile.binding),
              detail:
                observed?.status === "PASS"
                  ? "Inferencia y herramienta reales verificadas; prueba visual realizada cuando la ruta admite imágenes. Metadata ausente sigue desconocida."
                  : "La prueba no completó la verificación. Consultá el reporte privado local para distinguir auth, cuota, provider y resultado.",
            }
          : c,
      ),
    };
  store.event(
    studioId(workspace),
    "validation.local_report",
    reportNext,
    "user",
  );
  return {
    report: reportNext,
    privateReport: result.report,
    goalId: result.goalId,
  };
}
export async function smokeBlender(
  store: StateStore,
  home: string,
  workspace: string,
  base: PerfectConfig,
  signal: AbortSignal,
) {
  if (store.list("runs").some((r) => r.status === "running"))
    throw new Blocked(
      "VALIDATION_BUSY",
      "Pausá los agentes antes de ejecutar el render de prueba",
    );
  const parent = join(home, "diagnostics");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const source = await mkdtemp(join(parent, "blender-source-"));
  await cp(new URL("../../examples/blender-asset/", import.meta.url), source, {
    recursive: true,
  });
  const goal = await createGoal(
      {
        request: "Diagnóstico local de Blender; no es una goal de aplicación",
        source,
        home,
        config: base,
        privacy: "public",
        mode: "mock",
      },
      store,
    ),
    runner = new PreparedDockerRunner(base, store, join(home, "sandbox"));
  const spec = VerificationSpecSchema.parse({
    id: "blender-diagnostic",
    title: "Blender: fuente, GLB y render",
    kind: "blender",
    criteriaIds: ["diagnostic"],
    blender: { script: "scene.py", width: 480, height: 320 },
  });
  const result = await new VerificationService(store, runner).run(
    goal,
    new GitWorkspace(goal.root, base).repo,
    spec,
    signal,
  );
  store.put(
    "goals",
    {
      ...store.get("goals", goal.id)!,
      state: "ABORTED",
      terminalReason:
        "DIAGNOSTIC_ONLY: resultado recogido sin declarar aplicación DONE",
      updatedAt: now(),
    },
    "validation.blender_finished",
  );
  let report = latestValidation(store, workspace);
  if (!report) report = await inspectLocal(store, home, workspace, base);
  const next: LocalValidationReport = {
    ...report,
    id: id("local-validation"),
    at: now(),
    build: await buildIdentity(),
    inferenceRequests: 0,
    checks: report.checks.map((c) =>
      c.id === "blender"
        ? {
            ...c,
            authorized: "PASS",
            invoked: "PASS",
            verified: result.status === "passed" ? "PASS" : "FAIL",
            detail:
              result.status === "passed"
                ? "Blender real, fuente reabierta en proceso independiente, GLB cargado por Three.js y PNG inspeccionado."
                : "El render local falló. La evidencia privada se conserva en el objetivo de diagnóstico.",
          }
        : c,
    ),
  };
  store.event(studioId(workspace), "validation.local_report", next, "user");
  return { goalId: goal.id, result, report: next };
}
