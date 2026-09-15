import { builtinSkills } from "./library.js";
import { studioCapabilities } from "../modes/capabilities.js";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PerfectConfig } from "../config/schema.js";
import type { StateStore } from "../ports/state-store.js";
import { Blocked, id, now } from "../domain/util.js";
import { PiRuntime } from "../adapters/pi/runtime.js";
import { resolveProfile } from "../agents/profiles.js";
import type { AgentProfile, StudioConfig } from "./model.js";
import { SkillsRegistry, studioId } from "./registry.js";
import { StudioActionSchema } from "./actions.js";
import { importDirectory, releaseBytes } from "./importer.js";
import { importGithubSkill } from "./remote.js";
import { evaluateStructure, evaluateSelection } from "./evaluator.js";
import { skillAccess } from "./policy.js";
import { skillCandidates } from "./library.js";

export interface StudioPanelSnapshot {
  workspace: string;
  masterEnabled: boolean;
  revision: number;
  hash: string;
  config: StudioConfig;
  skills: {
    id: string;
    releaseId: string;
    name: string;
    description: string;
    packageId: string;
    hash: string;
    enabled: boolean;
    reviewed: boolean;
    license: string;
    redistribution: string;
    defaultSets: string[];
    source: string;
    status: string;
  }[];
  candidates: { id: string; source: string; status: string; reason: string }[];
  activations: {
    runId: string;
    profileId: string;
    skillId: string;
    resource: string;
    estimatedTokens: number;
  }[];
}
export class StudioAdmin {
  readonly registry: SkillsRegistry;
  constructor(
    readonly store: StateStore,
    readonly home: string,
  ) {
    this.registry = new SkillsRegistry(store);
  }
  panel(workspace: string, base: PerfectConfig): StudioPanelSnapshot {
    const record = this.registry.get(workspace, base),
      key = studioId(workspace);
    const selections = this.store.list("skillSelections", key),
      selectedIds = new Set(selections.map((s) => s.releaseId));
    const pending = new Set(
      this.store
        .events(key, 0)
        .filter((e) => e.type === "skill.import_pending")
        .map((e) => (e.payload as { releaseId?: string }).releaseId),
    );
    const releases = this.store
      .list("skillReleases")
      .filter((r) => selectedIds.has(r.id) || pending.has(r.id));
    const goalIds = new Set(
      this.store
        .list("goals")
        .filter((g) => g.source === workspace)
        .map((g) => g.id),
    );
    return {
      workspace,
      masterEnabled: this.registry.masterEnabled(),
      revision: record.revision,
      hash: record.hash,
      config: record.config,
      skills: releases.map((r) => {
        const s = selections.find((s) => s.releaseId === r.id);
        return {
          id: r.skillId,
          releaseId: r.id,
          name: r.name,
          description: r.description,
          packageId: r.packageId,
          hash: r.hash,
          enabled: s?.enabled ?? false,
          reviewed: s?.reviewedHash === r.hash,
          license: r.provenance.license,
          redistribution: r.provenance.redistribution,
          defaultSets: r.defaultSets,
          source: r.provenance.source,
          status:
            r.provenance.redistribution === "unknown"
              ? "pendiente de licencia"
              : !s?.reviewedHash
                ? "requiere revisión"
                : record.config.skills.disabledPackages.includes(r.packageId)
                  ? "paquete desactivado"
                  : s.enabled
                    ? "disponible para sus equipos"
                    : "desactivada",
        };
      }),
      candidates: [...skillCandidates],
      activations: this.store
        .list("skillActivations")
        .filter((a) => goalIds.has(a.goalId))
        .slice(-60)
        .map((a) => ({
          runId: a.runId,
          profileId: a.profileId,
          skillId: a.skillId,
          resource: a.resource,
          estimatedTokens: a.estimatedTokens,
        })),
    };
  }
  private scopedRelease(
    workspace: string,
    releaseId: string,
    base: PerfectConfig,
  ) {
    if (
      !this.panel(workspace, base).skills.some((s) => s.releaseId === releaseId)
    )
      throw new Blocked(
        "SKILL_ADMIN_SCOPE",
        "La versión no fue importada en esta carpeta",
      );
    return this.store.get("skillReleases", releaseId)!;
  }
  async validateBinding(
    profile: AgentProfile,
    base: PerfectConfig,
  ): Promise<void> {
    const def = {
      ...profile.binding,
      id: profile.role,
      readOnly: profile.readOnly,
    };
    const runtime = await new PiRuntime(this.home, base).modelRuntime(def);
    const model = runtime.getModel(def.provider, def.model);
    if (!model)
      throw new Blocked("MODEL_UNAVAILABLE", `${def.provider}/${def.model}`);
    if (
      def.reasoning !== "off" &&
      (!model.reasoning ||
        model.thinkingLevelMap?.[def.reasoning] === null ||
        (["xhigh", "max"].includes(def.reasoning) &&
          !model.thinkingLevelMap?.[def.reasoning]))
    )
      throw new Blocked("REASONING_UNSUPPORTED", def.reasoning);
    if (def.capabilities.includes("image") && !model.input.includes("image"))
      throw new Blocked("IMAGE_UNSUPPORTED", def.model);
    if (def.billingMode === "metered" && !base.budgets.allowMetered)
      throw new Blocked(
        "METERED_DENIED",
        "El permiso global de pago sigue desactivado",
      );
    if (def.billingMode === "subscription" && def.auth !== "oauth")
      throw new Blocked("BILLING_MISMATCH", "Suscripción requiere OAuth");
    if (
      def.billingMode === "free" &&
      (model.cost.input > 0 || model.cost.output > 0)
    )
      throw new Blocked(
        "BILLING_MISMATCH",
        "El catálogo no identifica esta ruta como gratuita",
      );
    if (def.auth === "mock" || def.billingMode === "mock")
      throw new Blocked(
        "MOCK_BINDING_DENIED",
        "La administración real no crea rutas simuladas",
      );
    // Catalog validation is NOT authentication or a smoke inference. Runtime rechecks access before a call.
  }
  async perform(
    workspace: string,
    base: PerfectConfig,
    raw: unknown,
    signal = AbortSignal.timeout(120000),
  ): Promise<{ message: string; content?: string; path?: string }> {
    workspace = await realpath(workspace);
    const action = StudioActionSchema.parse(raw),
      record = this.registry.get(workspace, base),
      config = structuredClone(record.config);
    const save = async () => {
      if (!("expectedHash" in action))
        throw new Blocked("STUDIO_CAS", "Falta versión de ajustes");
      this.registry.update(workspace, base, action.expectedHash, config);
      await this.writeLock(workspace);
      return {
        message:
          "Ajustes guardados. Las sesiones activas se pausan; los objetivos anteriores requieren adoptar el snapshot nuevo para cambiar perfiles/modelos.",
      };
    };
    switch (action.command) {
      case "refresh-bundled": {
        for (const release of builtinSkills()) {
          if (!this.store.get("skillReleases", release.id))
            this.store.put(
              "skillReleases",
              release,
              "skill.bundled_discovered",
            );
          this.store.event(
            studioId(workspace),
            "skill.import_pending",
            { releaseId: release.id, hash: release.hash },
            "user",
          );
        }
        return {
          message:
            "Versiones incluidas añadidas a revisión; no se sustituyó ni activó ninguna selección anterior.",
        };
      }
      case "capabilities":
        return {
          message: "Capacidades locales de los estudios",
          content: JSON.stringify(await studioCapabilities(), null, 2),
        };
      case "status":
        return {
          message: "Habilidades y equipos",
          content: JSON.stringify(this.panel(workspace, base), null, 2),
        };
      case "master":
        if (action.enabled && action.confirmation !== "ACTIVAR")
          throw new Blocked("SKILL_CONFIRMATION", "Confirmá ACTIVAR");
        this.registry.setMaster(action.enabled);
        return {
          message: action.enabled
            ? "Sistema habilitado; cada carpeta conserva su modo y exclusiones"
            : "Skills apagadas para todas las carpetas; se solicita pausa de sesiones activas",
        };
      case "skill-mode":
        config.skills.mode = action.mode;
        return save();
      case "package":
        if (action.enabled && action.confirmation !== "ACTIVAR")
          throw new Blocked("SKILL_CONFIRMATION", "Confirmá ACTIVAR");
        config.skills.disabledPackages = action.enabled
          ? config.skills.disabledPackages.filter((p) => p !== action.id)
          : [...new Set([...config.skills.disabledPackages, action.id])];
        return save();
      case "selection": {
        const s = this.store.get(
          "skillSelections",
          `${studioId(workspace)}-${action.skillId}`,
        );
        if (!s || s.reviewedHash !== action.hash)
          throw new Blocked(
            "SKILL_REVIEW_HASH",
            "Primero revisá/aprobá esta versión exacta",
          );
        this.store.put(
          "skillSelections",
          { ...s, enabled: action.enabled, updatedAt: now() },
          "skill.availability_changed",
          "user",
        );
        // A running session is invalidated through a versioned studio update as well as per-tool guards.
        this.registry.update(workspace, base, record.hash, config);
        await this.writeLock(workspace);
        return {
          message: action.enabled
            ? "Habilidad disponible en sus equipos autorizados"
            : "Habilidad desactivada; no se borró su versión ni el trabajo",
        };
      }
      case "assign":
        config.skills.assignments = config.skills.assignments.filter(
          (a) =>
            !(
              a.skillId === action.assignment.skillId &&
              a.scope === action.assignment.scope &&
              a.target === action.assignment.target
            ),
        );
        if (action.assignment.decision !== "inherit")
          config.skills.assignments.push(action.assignment);
        return save();
      case "set": {
        const old = config.sets.findIndex((s) => s.id === action.set.id);
        if (old < 0) config.sets.push(action.set);
        else config.sets[old] = action.set;
        return save();
      }
      case "profile": {
        const old = config.profiles.find((p) => p.id === action.profile.id);
        if (
          old &&
          (old.role !== action.profile.role ||
            (old.readOnly && !action.profile.readOnly))
        )
          throw new Blocked(
            "PROFILE_PRIVILEGE",
            "No se cambia la responsabilidad ni se amplían permisos de un perfil existente",
          );
        await this.validateBinding(action.profile, base);
        const index = config.profiles.findIndex(
          (p) => p.id === action.profile.id,
        );
        if (index < 0) config.profiles.push(action.profile);
        else config.profiles[index] = action.profile;
        return save();
      }
      case "binding": {
        const p = config.profiles.find((p) => p.id === action.profileId);
        if (!p) throw new Blocked("PROFILE_UNKNOWN", action.profileId);
        const next = { ...p, binding: action.binding };
        await this.validateBinding(next, base);
        p.binding = next.binding;
        return save();
      }
      case "mode": {
        const mode = config.modes.find(
          (m) => m.id === action.modeId && m.enabled,
        );
        if (!mode) throw new Blocked("MODE_DISABLED", action.modeId);
        config.activeMode = mode.id;
        return save();
      }
      case "mode-edit": {
        const index = config.modes.findIndex((m) => m.id === action.mode.id);
        if (index < 0) config.modes.push(action.mode);
        else config.modes[index] = action.mode;
        return save();
      }
      case "catalog": {
        const p = config.profiles.find((p) => p.id === action.profileId);
        if (!p) throw new Blocked("PROFILE_UNKNOWN", action.profileId);
        const runtime = await new PiRuntime(this.home, base).modelRuntime({
          ...p.binding,
          id: p.role,
          readOnly: p.readOnly,
        });
        const models = runtime
          .getModels()
          .filter((m) =>
            `${m.provider}/${m.id}`
              .toLowerCase()
              .includes(action.query.toLowerCase()),
          )
          .slice(0, 100)
          .map((m) => ({
            provider: m.provider,
            model: m.id,
            input: m.input,
            reasoning: m.thinkingLevelMap ?? null,
            cost: m.cost,
            authentication: "No comprobada por este catálogo",
          }));
        return {
          message: "Catálogo de Pi; no demuestra acceso de la cuenta",
          content: JSON.stringify(
            {
              profile: p.id,
              modelChoices: models,
              limitedTo: 100,
              instruction:
                "Usá /modelo perfil proveedor modelo reasoning cuenta auth billing. No hay fallback ni cambio de permisos.",
            },
            null,
            2,
          ),
        };
      }
      case "inspect": {
        const release = this.scopedRelease(workspace, action.releaseId, base);
        return {
          message: "Revisión de la versión exacta",
          content: JSON.stringify(
            {
              id: release.id,
              hash: release.hash,
              provenance: release.provenance,
              files: Object.fromEntries(
                Object.entries(release.files).map(([p, f]) => [
                  p,
                  { bytes: f.bytes, hash: f.hash },
                ]),
              ),
              instructions: releaseBytes(release, "SKILL.md").toString("utf8"),
              structure: evaluateStructure(release, workspace),
              effectiveProfiles: config.profiles.map((p) => ({
                id: p.id,
                ...skillAccess(
                  config,
                  p,
                  release,
                  this.store.get(
                    "skillSelections",
                    `${studioId(workspace)}-${release.skillId}`,
                  ),
                ),
              })),
            },
            null,
            2,
          ),
        };
      }
      case "import-local": {
        const release = await importDirectory(action.directory, workspace, {
          provenance: {
            kind: "local",
            source: "local:" + action.directory,
            license: action.license,
            redistribution: action.redistribution,
          },
          defaultSets: action.defaultSets,
          triggers: action.triggers,
          privacy: "private",
        });
        this.registry.quarantine(release, workspace);
        return {
          message:
            "Importado en cuarentena; todavía no está disponible a los agentes",
          content: JSON.stringify(
            {
              id: release.id,
              hash: release.hash,
              evaluation: evaluateStructure(release, workspace),
            },
            null,
            2,
          ),
        };
      }
      case "import-github": {
        const release = await importGithubSkill(action.input, signal);
        this.registry.quarantine(release, workspace);
        return {
          message:
            "Versión pública fijada e importada en cuarentena, sin ejecutar scripts",
          content: JSON.stringify(
            {
              id: release.id,
              hash: release.hash,
              provenance: release.provenance,
              evaluation: evaluateStructure(release, workspace),
            },
            null,
            2,
          ),
        };
      }
      case "approve": {
        const release = this.scopedRelease(workspace, action.releaseId, base),
          evaluation = evaluateStructure(release, workspace);
        this.store.put(
          "skillEvaluations",
          evaluation,
          "skill.structure_evaluated",
          "user",
        );
        if (evaluation.status !== "passed")
          throw new Blocked(
            "SKILL_STRUCTURE",
            "La estructura/licencia requiere correcciones antes de aprobar",
          );
        this.registry.approve(workspace, action.releaseId, action.hash, "user");
        await this.writeLock(workspace);
        return {
          message:
            "Versión aprobada por el usuario. No constituye una evaluación conductual ni activa paquetes deshabilitados.",
        };
      }
      case "evaluate": {
        const release = this.scopedRelease(workspace, action.releaseId, base);
        const evaluation = action.casesFile
          ? evaluateSelection(
              release,
              workspace,
              JSON.parse(await readFile(action.casesFile, "utf8")),
              action.partition,
            )
          : evaluateStructure(release, workspace);
        this.store.put(
          "skillEvaluations",
          evaluation,
          "skill.evaluated",
          "user",
        );
        return {
          message:
            "Evaluación determinista completada; no se enviaron inferencias",
          content: JSON.stringify(evaluation, null, 2),
        };
      }
      case "adopt": {
        const goal = this.store.get("goals", action.goalId);
        if (
          !goal ||
          goal.source !== workspace ||
          goal.state !== "PAUSED" ||
          this.store.list("runs", goal.id).some((r) => r.status === "running")
        )
          throw new Blocked(
            "STUDIO_GOAL_STATE",
            "Solo un objetivo propio en pausa, sin sesiones activas",
          );
        if (record.hash !== action.expectedHash)
          throw new Blocked("STUDIO_CONFLICT", "Los ajustes cambiaron");
        const old = this.registry.forGoal(goal, base);
        if (goal.activePlanId && old.activeMode !== config.activeMode)
          throw new Blocked(
            "MODE_PLAN_BOUND",
            "El modo del plan aceptado no cambia; iniciá otra goal o conservá el modo",
          );
        for (const task of this.store
          .list("tasks", goal.id)
          .filter((t) => !["accepted", "superseded"].includes(t.status)))
          resolveProfile(config, task.assignedAgent, task.profileId);
        this.store.transaction(() => {
          const snapshot = this.registry.snapshot(goal, base);
          this.store.put(
            "goals",
            { ...goal, studioSnapshotId: snapshot.id, updatedAt: now() },
            "studio.goal_adopted",
            "user",
          );
        });
        return {
          message:
            "Snapshot nuevo adoptado. La próxima ejecución usa una sesión limpia; evidencia, límites y bindings anteriores se conservan.",
        };
      }
      case "lock":
        return {
          message: "Lock local de habilidades",
          path: await this.writeLock(workspace),
          content: JSON.stringify(this.registry.lock(workspace), null, 2),
        };
    }
  }
  private async writeLock(workspace: string): Promise<string> {
    const dir = join(this.home, "studios", studioId(workspace));
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, "skills.lock.json"),
      temp = path + "." + id("tmp");
    await writeFile(
      temp,
      JSON.stringify(this.registry.lock(workspace), null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    await rename(temp, path);
    return path;
  }
}
