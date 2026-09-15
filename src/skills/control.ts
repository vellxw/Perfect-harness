import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import type { Goal } from "../domain/model.js";
import type { SkillRelease } from "./model.js";
import { Blocked, hash, id, now } from "../domain/util.js";

export interface SkillPin {
  skillId: string;
  releaseId: string;
  hash: string;
}
export interface SkillControl {
  id: string;
  goalId: string;
  epoch: number;
  manual: SkillPin[];
  updatedAt: string;
}
export interface SkillInspection {
  id: string;
  goalId: string;
  workspace: string;
  releaseId: string;
  hash: string;
  inspectedAt: string;
}
export interface SkillDecision {
  id: string;
  goalId: string;
  workspace: string;
  releaseId: string;
  hash: string;
  action: "approve" | "evaluation";
  inspectionId: string;
  createdAt: string;
  actor: "user";
}
export const controlId = (workspace?: string): string =>
  workspace ? `studio-${hash(workspace).slice(0, 24)}` : "skills-global";
export function control(store: StateStore, workspace?: string): SkillControl {
  const key = controlId(workspace);
  return (
    store.get("skillControls", key) ?? {
      id: key,
      goalId: key,
      epoch: 0,
      manual: [],
      updatedAt: "",
    }
  );
}
export function epoch(store: StateStore, workspace: string): string {
  return `${control(store).epoch}/${control(store, workspace).epoch}`;
}
export function invalidateSkills(store: StateStore, workspace?: string): void {
  const before = control(store, workspace);
  store.put(
    "skillControls",
    { ...before, epoch: before.epoch + 1, updatedAt: now() },
    "skills.policy_invalidated",
    "user",
  );
}
export function pinned(
  list: readonly SkillPin[],
  release: SkillRelease,
): boolean {
  return list.some(
    (p) =>
      p.skillId === release.skillId &&
      p.releaseId === release.id &&
      p.hash === release.hash,
  );
}
export function snapshotPins(store: StateStore, goal: Goal): SkillPin[] {
  return goal.studioSnapshotId
    ? (store.get("studioSnapshots", goal.studioSnapshotId)?.skillManual ?? [])
    : [];
}
/** No scripts, imports or LLM calls. The user approves the entire exact dependency set. */
export function selectionClosure(
  store: StateStore,
  workspace: string,
  releaseId: string,
): SkillPin[] {
  const answer: SkillPin[] = [],
    visiting = new Set<string>();
  const add = (key: string) => {
    const r = store.get("skillReleases", key);
    if (!r) throw new Blocked("SKILL_VERSION_MISSING", key);
    if (visiting.has(r.skillId))
      throw new Blocked("SKILL_DEPENDENCY_CYCLE", r.skillId);
    if (answer.some((p) => p.skillId === r.skillId)) return;
    const selected = store.get(
      "skillSelections",
      `${controlId(workspace)}-${r.skillId}`,
    );
    if (
      !selected?.enabled ||
      selected.releaseId !== r.id ||
      selected.reviewedHash !== r.hash
    )
      throw new Blocked(
        "SKILL_REVIEW_REQUIRED",
        `Revisá la versión exacta de ${r.skillId}`,
      );
    visiting.add(r.skillId);
    for (const dependency of r.dependencies) {
      const d = store.get(
        "skillSelections",
        `${controlId(workspace)}-${dependency}`,
      );
      if (!d) throw new Blocked("SKILL_DEPENDENCY_DENIED", dependency);
      add(d.releaseId);
    }
    visiting.delete(r.skillId);
    answer.push({ skillId: r.skillId, releaseId: r.id, hash: r.hash });
  };
  add(releaseId);
  return answer;
}
export function selectManual(
  store: StateStore,
  workspace: string,
  base: PerfectConfig,
  releaseId: string,
  versionHash: string,
  selected: boolean,
  expectedEpoch: number,
  acceptedPins: SkillPin[],
): void {
  store.transaction(() => {
    const state = control(store, workspace),
      r = store.get("skillReleases", releaseId);
    if (state.epoch !== expectedEpoch)
      throw new Blocked(
        "SKILL_SELECTION_CONFLICT",
        "La selección cambió en otra ventana; actualizá antes de confirmar",
      );
    if (!r || r.hash !== versionHash)
      throw new Blocked("SKILL_REVIEW_HASH", "La versión cambió");
    const studio = store.get("studios", controlId(workspace));
    if (!studio)
      throw new Blocked("STUDIO_MISSING", "Abrí habilidades primero");
    const closure = selected
      ? selectionClosure(store, workspace, releaseId)
      : [];
    if (selected && hash(closure) !== hash(acceptedPins))
      throw new Blocked(
        "SKILL_DEPENDENCY_APPROVAL",
        "Se deben confirmar todas las dependencias y sus hashes",
      );
    if (
      closure.some((p) =>
        studio.config.skills.disabledPackages.includes(
          store.get("skillReleases", p.releaseId)!.packageId,
        ),
      )
    )
      throw new Blocked(
        "SKILL_PACKAGE_OFF",
        "Una dependencia pertenece a un paquete desactivado",
      );
    const manual = selected
      ? [
          ...state.manual.filter(
            (p) => !closure.some((q) => q.skillId === p.skillId),
          ),
          ...closure,
        ]
      : state.manual.filter((p) => p.skillId !== r.skillId);
    if (manual.length > 64)
      throw new Blocked(
        "SKILL_MANUAL_SIZE",
        "Reducí la selección manual global",
      );
    // maxActive is enforced per profile, not over unrelated teams.
    store.put(
      "skillControls",
      { ...state, manual, epoch: state.epoch + 1, updatedAt: now() },
      "skills.manual_selected",
      "user",
    );
    for (const goal of store.list("goals"))
      if (
        goal.source === workspace &&
        !["DONE", "ABORTED", "FAILED", "PAUSED"].includes(goal.state)
      )
        store.put(
          "goals",
          { ...goal, controlRequest: "pause", updatedAt: now() },
          "skills.session_restart_requested",
          "user",
        );
    void base;
  });
}
export function inspectReceipt(
  store: StateStore,
  workspace: string,
  r: SkillRelease,
): SkillInspection {
  const value = {
    id: id("skill-inspection"),
    goalId: controlId(workspace),
    workspace,
    releaseId: r.id,
    hash: r.hash,
    inspectedAt: now(),
  };
  store.put("skillInspections", value, "skill.content_inspected", "user");
  return value;
}
export function userDecision(
  store: StateStore,
  workspace: string,
  r: SkillRelease,
  action: "approve" | "evaluation",
  inspectionId: string,
): SkillDecision {
  const seen = store.get("skillInspections", inspectionId);
  if (
    !seen ||
    seen.workspace !== workspace ||
    seen.releaseId !== r.id ||
    seen.hash !== r.hash
  )
    throw new Blocked(
      "SKILL_INSPECT_FIRST",
      "Inspeccioná esta versión antes de aprobar o evaluar",
    );
  const value: SkillDecision = {
    id: id("skill-decision"),
    goalId: controlId(workspace),
    workspace,
    releaseId: r.id,
    hash: r.hash,
    action,
    inspectionId,
    actor: "user",
    createdAt: now(),
  };
  store.put("skillDecisions", value, "skill.user_decision", "user");
  return value;
}
/** Polls only while an agent is alive, covering policy changes from other processes. */
export function policyLease(
  store: StateStore,
  workspace: string,
  signal: AbortSignal,
  extraGuard?: () => void,
): { signal: AbortSignal; close: () => void } {
  const start = epoch(store, workspace),
    abort = new AbortController();
  const check = () => {
    try {
      if (epoch(store, workspace) !== start)
        throw new Blocked(
          "SKILL_POLICY_REVOKED",
          "Las skills cambiaron; reiniciar con contexto limpio",
        );
      extraGuard?.();
    } catch (e) {
      abort.abort(e);
    }
  };
  const timer = setInterval(check, 75);
  timer.unref();
  return {
    signal: AbortSignal.any([signal, abort.signal]),
    close: () => clearInterval(timer),
  };
}
