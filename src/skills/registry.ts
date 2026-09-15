import { invalidateSkills, control } from "./control.js";
import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import type { Goal } from "../domain/model.js";
import { Blocked, hash, id, now } from "../domain/util.js";
import { defaultStudio } from "../agents/profiles.js";
import {
  StudioConfigSchema,
  type StudioConfig,
  type StudioRecord,
  type StudioSnapshot,
  type SkillRelease,
  type SkillLock,
} from "./model.js";
import { builtinSkills } from "./library.js";
import { releaseBytes } from "./importer.js";

export const studioId = (workspace: string): string =>
  `studio-${hash(workspace).slice(0, 24)}`;
export class SkillsRegistry {
  constructor(readonly store: StateStore) {}
  get(workspace: string, base: PerfectConfig): StudioRecord {
    const key = studioId(workspace),
      found = this.store.get("studios", key);
    if (found) {
      StudioConfigSchema.parse(found.config);
      if (hash(found.config) !== found.hash)
        throw new Blocked("STUDIO_INTEGRITY", key);
      return found;
    }
    const config = defaultStudio(base);
    const record: StudioRecord = {
      id: key,
      goalId: key,
      workspace,
      config,
      revision: 1,
      hash: hash(config),
      updatedAt: now(),
    };
    this.store.transaction(() => {
      if (!this.store.get("studios", key))
        this.store.put("studios", record, "studio.initialized");
      for (const release of builtinSkills()) {
        if (!this.store.get("skillReleases", release.id))
          this.store.put("skillReleases", release, "skill.builtin_registered");
        const selectionId = `${key}-${release.skillId}`;
        if (!this.store.get("skillSelections", selectionId))
          this.store.put(
            "skillSelections",
            {
              id: selectionId,
              goalId: key,
              workspace,
              skillId: release.skillId,
              releaseId: release.id,
              enabled: true,
              reviewedHash: release.hash,
              reviewedBy: "project-maintainers",
              updatedAt: now(),
            },
            "skill.builtin_available",
          );
      }
    });
    return this.store.get("studios", key)!;
  }
  masterEnabled(): boolean {
    return this.store.get("skillsMaster", "skills-master")?.enabled ?? true;
  }
  setMaster(enabled: boolean): void {
    this.store.transaction(() => {
      this.store.put(
        "skillsMaster",
        {
          id: "skills-master",
          goalId: "skills-master",
          enabled,
          updatedAt: now(),
        },
        "skills.master_changed",
        "user",
      );
      invalidateSkills(this.store);
      if (!enabled) this.pauseAffected();
    });
  }
  update(
    workspace: string,
    base: PerfectConfig,
    expectedHash: string,
    value: unknown,
  ): StudioRecord {
    const config = StudioConfigSchema.parse(value);
    return this.store.transaction(() => {
      const before = this.get(workspace, base);
      if (before.hash !== expectedHash)
        throw new Blocked(
          "STUDIO_CONFLICT",
          "Los ajustes cambiaron; actualizá antes de guardar",
        );
      const record = {
        ...before,
        config,
        hash: hash(config),
        revision: before.revision + 1,
        updatedAt: now(),
      };
      this.store.put(
        "studioHistory",
        {
          id: id("studio-history"),
          goalId: before.id,
          workspace,
          config: before.config,
          revision: before.revision,
          hash: before.hash,
          createdAt: now(),
        },
        "studio.checkpointed",
        "user",
      );
      this.store.put("studios", record, "studio.updated", "user");
      // Every change may revoke a capability. Active sessions pause and must restart;
      // old prompts, bindings and accepted artifacts are never retroactively rewritten.
      this.pauseAffected(workspace);
      return record;
    });
  }
  private pauseAffected(workspace?: string): void {
    invalidateSkills(this.store, workspace);
    for (const goal of this.store.list("goals"))
      if (
        (!workspace || goal.source === workspace) &&
        !["DONE", "FAILED", "ABORTED", "PAUSED"].includes(goal.state)
      )
        this.store.put(
          "goals",
          { ...goal, controlRequest: "pause", updatedAt: now() },
          "skills.session_restart_requested",
          "user",
        );
  }
  snapshot(
    goal: Pick<Goal, "id" | "source">,
    base: PerfectConfig,
    modeOverride?: string,
  ): StudioSnapshot {
    const record = this.get(goal.source, base);
    const selectedConfig = structuredClone(record.config);
    if (modeOverride) selectedConfig.activeMode = modeOverride;
    StudioConfigSchema.parse(selectedConfig);
    const result: StudioSnapshot = {
      id: id("studio-snapshot"),
      goalId: goal.id,
      workspace: goal.source,
      config: selectedConfig,
      hash: hash(selectedConfig),
      revision: record.revision,
      skillLock: this.lock(goal.source),
      skillManual: structuredClone(control(this.store, goal.source).manual),
      createdAt: now(),
    };
    this.store.put("studioSnapshots", result, "studio.snapshot_created");
    return result;
  }
  forGoal(goal: Goal, base: PerfectConfig): StudioConfig {
    if (!goal.studioSnapshotId) return defaultStudio(base);
    const snapshot = this.store.get("studioSnapshots", goal.studioSnapshotId);
    if (
      !snapshot ||
      snapshot.goalId !== goal.id ||
      snapshot.workspace !== goal.source ||
      hash(snapshot.config) !== snapshot.hash
    )
      throw new Blocked("STUDIO_SNAPSHOT", "Snapshot de perfiles inválido");
    return StudioConfigSchema.parse(snapshot.config);
  }
  quarantine(release: SkillRelease, workspace: string): string {
    for (const path of Object.keys(release.files)) releaseBytes(release, path);
    if (
      /supabase/i.test(
        release.skillId +
          " " +
          release.packageId +
          " " +
          release.provenance.source,
      )
    )
      throw new Blocked(
        "SKILL_EXCLUDED",
        "Supabase está excluido de esta biblioteca",
      );
    if (
      release.packageId === "dashi-motion" &&
      release.provenance.redistribution === "unknown"
    )
      throw new Blocked(
        "SKILL_LICENSE",
        "Dashi Motion requiere permiso de reutilización verificado",
      );
    this.store.transaction(() => {
      const existing = this.store.get("skillReleases", release.id);
      if (!existing)
        this.store.put("skillReleases", release, "skill.quarantined", "user");
      else if (
        hash({ ...existing, createdAt: "" }) !==
        hash({ ...release, createdAt: "" })
      )
        throw new Blocked(
          "SKILL_COLLISION",
          "Mismo contenido con procedencia incompatible",
        );
      this.store.event(
        studioId(workspace),
        "skill.import_pending",
        { releaseId: release.id, hash: release.hash },
        "user",
      );
    });
    return release.id;
  }
  approve(
    workspace: string,
    releaseId: string,
    expectedHash: string,
    reviewer: string,
  ): void {
    const release = this.store.get("skillReleases", releaseId);
    if (!release || release.hash !== expectedHash)
      throw new Blocked("SKILL_REVIEW_HASH", "Revisá la versión exacta");
    if (!reviewer || reviewer === release.creatorRunId)
      throw new Blocked(
        "SKILL_SELF_APPROVAL",
        "El autor no puede autoaprobar la habilidad",
      );
    if (release.provenance.redistribution === "unknown")
      throw new Blocked("SKILL_LICENSE", "Falta autorización de reutilización");
    for (const path of Object.keys(release.files)) releaseBytes(release, path);
    const decision = this.store.get("skillDecisions", reviewer);
    if (
      !decision ||
      decision.workspace !== workspace ||
      decision.releaseId !== releaseId ||
      decision.hash !== expectedHash ||
      decision.action !== "approve"
    )
      throw new Blocked(
        "SKILL_USER_DECISION",
        "Se requiere una aprobación real del usuario ligada a la inspección de esta versión",
      );
    const key = studioId(workspace);
    this.store.put(
      "skillSelections",
      {
        id: `${key}-${release.skillId}`,
        goalId: key,
        workspace,
        skillId: release.skillId,
        releaseId,
        enabled: true,
        reviewedHash: expectedHash,
        reviewedBy: reviewer,
        updatedAt: now(),
      },
      "skill.user_approved",
      "user",
    );
    this.pauseAffected(workspace);
  }
  lock(workspace: string): SkillLock {
    return {
      schemaVersion: 1,
      entries: this.store
        .list("skillSelections", studioId(workspace))
        .filter((s) => s.enabled)
        .map((s) => {
          const r = this.store.get("skillReleases", s.releaseId)!;
          return {
            skillId: r.skillId,
            releaseId: r.id,
            hash: r.hash,
            source: r.provenance.source,
            ...(r.provenance.commit ? { commit: r.provenance.commit } : {}),
            license: r.provenance.license,
            redistribution: r.provenance.redistribution,
          };
        })
        .sort((a, b) => a.skillId.localeCompare(b.skillId)),
    };
  }
}
