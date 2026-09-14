import { z } from "zod";
import { RoleSchema, ReasoningSchema, type Role } from "../domain/model.js";

export const Key = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const BindingSchema = z
  .object({
    provider: z.string().min(1).max(120),
    accountRef: Key,
    model: z.string().min(1).max(200),
    reasoning: ReasoningSchema,
    auth: z.enum(["oauth", "api_key", "mock"]),
    billingMode: z.enum(["subscription", "free", "metered", "mock"]),
    capabilities: z.array(z.enum(["text", "image", "tools"])).min(1),
  })
  .strict();
export const ProfileSchema = z
  .object({
    id: Key,
    name: z.string().min(1).max(100),
    role: RoleSchema,
    enabled: z.boolean(),
    setIds: z.array(Key).min(1).max(8),
    readOnly: z.boolean(),
    binding: BindingSchema,
  })
  .strict()
  .superRefine((p, ctx) => {
    if (["planner", "oracle", "visual"].includes(p.role) && !p.readOnly)
      ctx.addIssue({
        code: "custom",
        message: "El coordinador y los revisores son de solo lectura",
      });
    if (p.role === "visual" && !p.binding.capabilities.includes("image"))
      ctx.addIssue({
        code: "custom",
        message: "El crítico visual requiere entrada de imágenes",
      });
  });
export type AgentProfile = z.infer<typeof ProfileSchema>;
export const SetSchema = z
  .object({ id: Key, name: z.string().min(1).max(100), enabled: z.boolean() })
  .strict();
export type AgentSet = z.infer<typeof SetSchema>;
export const AssignmentSchema = z
  .object({
    skillId: Key,
    scope: z.enum(["global", "set", "profile"]),
    target: Key.optional(),
    decision: z.enum(["enable", "disable", "inherit"]),
  })
  .strict()
  .superRefine((a, ctx) => {
    if ((a.scope === "global") === Boolean(a.target))
      ctx.addIssue({
        code: "custom",
        message: "Global no lleva destino; equipo/perfil sí",
      });
  });
export type SkillAssignment = z.infer<typeof AssignmentSchema>;
export const WorkModeSchema = z
  .object({
    id: Key,
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    profiles: z.array(Key).min(1),
    defaults: z.record(RoleSchema, Key),
    instruction: z.string().min(1).max(12000),
    engine: z
      .enum(["project", "web-2d", "web-3d", "unity", "godot"])
      .default("project"),
  })
  .strict();
export type WorkMode = z.infer<typeof WorkModeSchema>;
export const StudioConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    skills: z
      .object({
        mode: z.enum(["off", "manual", "auto-curated"]),
        maxActive: z.number().int().min(1).max(12),
        maxContextTokens: z.number().int().min(256).max(32000),
        maxCatalogTokens: z.number().int().min(64).max(8000),
        disabledPackages: z.array(Key),
        assignments: z.array(AssignmentSchema).max(1000),
      })
      .strict(),
    sets: z.array(SetSchema).min(1).max(64),
    profiles: z.array(ProfileSchema).min(1).max(128),
    modes: z.array(WorkModeSchema).min(1).max(24),
    activeMode: Key,
    preferences: z
      .object({
        database: z.literal("postgresql"),
        backendAsService: z.literal(false),
        simplicity: z.literal("minimal-sufficient"),
      })
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const list of [c.sets, c.profiles, c.modes])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({ code: "custom", message: "Identificadores duplicados" });
    if (!c.modes.some((m) => m.id === c.activeMode && m.enabled))
      ctx.addIssue({
        code: "custom",
        message: "El modo seleccionado no está habilitado",
      });
    for (const p of c.profiles)
      if (p.setIds.some((id) => !c.sets.some((s) => s.id === id)))
        ctx.addIssue({
          code: "custom",
          message: `Equipo desconocido en ${p.id}`,
        });
    for (const m of c.modes) {
      if (m.profiles.some((id) => !c.profiles.some((p) => p.id === id)))
        ctx.addIssue({
          code: "custom",
          message: `Perfil desconocido en ${m.id}`,
        });
      for (const [role, id] of Object.entries(m.defaults))
        if (
          !m.profiles.includes(id) ||
          !c.profiles.some((p) => p.id === id && p.role === role)
        )
          ctx.addIssue({
            code: "custom",
            message: `Perfil predeterminado incompatible: ${m.id}/${role}`,
          });
    }
    const keys = c.skills.assignments.map(
      (a) => `${a.skillId}/${a.scope}/${a.target ?? "*"}`,
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Asignación duplicada" });
    for (const a of c.skills.assignments) {
      if (a.scope === "set" && !c.sets.some((s) => s.id === a.target))
        ctx.addIssue({
          code: "custom",
          message: "Equipo de asignación desconocido",
        });
      if (a.scope === "profile" && !c.profiles.some((p) => p.id === a.target))
        ctx.addIssue({
          code: "custom",
          message: "Perfil de asignación desconocido",
        });
    }
  });
export type StudioConfig = z.infer<typeof StudioConfigSchema>;
export interface StudioRecord {
  id: string;
  goalId: string;
  workspace: string;
  revision: number;
  hash: string;
  config: StudioConfig;
  updatedAt: string;
}
export interface StudioSnapshot {
  skillLock?: SkillLock;
  id: string;
  goalId: string;
  workspace: string;
  revision: number;
  hash: string;
  config: StudioConfig;
  createdAt: string;
}
export interface SkillFile {
  hash: string;
  bytes: number;
  base64: string;
}
export interface SkillProvenance {
  kind: "builtin" | "local" | "github" | "draft";
  source: string;
  commit?: string;
  path?: string;
  license: string;
  redistribution: "allowed" | "local-only" | "unknown";
  reviewedBy?: string;
  reviewedAt?: string;
  adaptation?: string;
}
export interface SkillRelease {
  id: string;
  goalId: string;
  skillId: string;
  packageId: string;
  name: string;
  description: string;
  version: string;
  hash: string;
  files: Record<string, SkillFile>;
  provenance: SkillProvenance;
  defaultSets: string[];
  triggers: string[];
  excludes: string[];
  dependencies: string[];
  conflicts: string[];
  requiredCapabilities: string[];
  privacy: "public" | "private" | "confidential";
  creatorRunId?: string;
  createdAt: string;
}
export interface SkillSelection {
  id: string;
  goalId: string;
  workspace: string;
  skillId: string;
  releaseId: string;
  enabled: boolean;
  reviewedHash?: string;
  reviewedBy?: string;
  updatedAt: string;
}
export interface SkillActivation {
  id: string;
  goalId: string;
  runId: string;
  profileId: string;
  setIds: string[];
  skillId: string;
  releaseId: string;
  hash: string;
  reason: string;
  resource: string;
  estimatedTokens: number;
  createdAt: string;
}
export interface SkillEvaluation {
  id: string;
  goalId: string;
  workspace: string;
  releaseId: string;
  kind: "structure" | "selection" | "behavior";
  status: "passed" | "failed" | "not-tested";
  checks: { name: string; passed: boolean; detail: string }[];
  runs: string[];
  datasetHash: string;
  mode: "deterministic" | "real" | "mock";
  createdAt: string;
}
export interface SkillLock {
  schemaVersion: 1;
  entries: {
    skillId: string;
    releaseId: string;
    hash: string;
    source: string;
    commit?: string;
    license: string;
    redistribution: string;
  }[];
}
export interface ResolvedProfile {
  profile: AgentProfile;
  mode: WorkMode;
  sets: AgentSet[];
  role: Role;
}
