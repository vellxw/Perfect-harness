import { z } from "zod";
import {
  AssignmentSchema,
  BindingSchema,
  Key,
  ProfileSchema,
  SetSchema,
  WorkModeSchema,
  Sha256,
} from "./model.js";
import { GithubSkillSchema } from "./remote.js";

const revision = { expectedHash: Sha256 };
export const StudioActionSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("status") }).strict(),
  z
    .object({
      command: z.literal("master"),
      enabled: z.boolean(),
      confirmation: z.literal("ACTIVAR").optional(),
    })
    .strict(),
  z
    .object({
      command: z.literal("skill-mode"),
      mode: z.enum(["off", "manual", "auto-curated"]),
      ...revision,
    })
    .strict(),
  z
    .object({
      command: z.literal("package"),
      id: Key,
      enabled: z.boolean(),
      confirmation: z.literal("ACTIVAR").optional(),
      ...revision,
    })
    .strict(),
  z
    .object({
      command: z.literal("selection"),
      skillId: Key,
      enabled: z.boolean(),
      hash: Sha256,
    })
    .strict(),
  z
    .object({
      command: z.literal("assign"),
      assignment: AssignmentSchema,
      ...revision,
    })
    .strict(),
  z.object({ command: z.literal("set"), set: SetSchema, ...revision }).strict(),
  z
    .object({
      command: z.literal("profile"),
      profile: ProfileSchema,
      ...revision,
    })
    .strict(),
  z
    .object({
      command: z.literal("binding"),
      profileId: Key,
      binding: BindingSchema,
      confirmation: z.literal("CAMBIAR"),
      ...revision,
    })
    .strict(),
  z.object({ command: z.literal("mode"), modeId: Key, ...revision }).strict(),
  z
    .object({
      command: z.literal("mode-edit"),
      mode: WorkModeSchema,
      ...revision,
    })
    .strict(),
  z
    .object({
      command: z.literal("catalog"),
      profileId: Key,
      query: z.string().max(200).default(""),
    })
    .strict(),
  z
    .object({ command: z.literal("inspect"), releaseId: z.string().max(120) })
    .strict(),
  z
    .object({
      command: z.literal("import-local"),
      directory: z.string().min(1).max(4096),
      defaultSets: z.array(Key).max(8),
      triggers: z.array(z.string().min(2).max(100)).max(30),
      license: z.string().min(1).max(120),
      redistribution: z.enum(["allowed", "local-only", "unknown"]),
      confirmation: z.literal("IMPORTAR"),
    })
    .strict(),
  z
    .object({
      command: z.literal("import-github"),
      input: GithubSkillSchema,
      confirmation: z.literal("IMPORTAR"),
    })
    .strict(),
  z
    .object({
      command: z.literal("approve"),
      releaseId: z.string().max(120),
      hash: Sha256,
      confirmation: z.literal("APROBAR"),
    })
    .strict(),
  z
    .object({
      command: z.literal("evaluate"),
      releaseId: z.string().max(120),
      casesFile: z.string().max(4096).optional(),
      partition: z.enum(["development", "holdout"]).default("development"),
    })
    .strict(),
  z
    .object({
      command: z.literal("adopt"),
      goalId: z.string().max(120),
      confirmation: z.literal("APLICAR"),
      ...revision,
    })
    .strict(),
  z.object({ command: z.literal("lock") }).strict(),
]);
export type StudioAction = z.infer<typeof StudioActionSchema>;
