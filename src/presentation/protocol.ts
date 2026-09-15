import { DraftBriefSchema } from "../skills/creator.js";
import { StudioActionSchema } from "../skills/actions.js";
import type { StudioPanelSnapshot } from "../skills/admin.js";
import { z } from "zod";
import type { GoalState, Role } from "../domain/model.js";
import {
  IntegrationActionSchema,
  type IntegrationPanelSnapshot,
} from "../integrations/actions.js";
export const PROTOCOL_VERSION = 1;
export const MotionSchema = z.enum(["auto", "full", "reduced", "off"]);
export type Motion = z.infer<typeof MotionSchema>;
export const UiPreferencesSchema = z.object({
  ui: z
    .object({
      motion: MotionSchema.default("auto"),
      contrast: z.enum(["normal", "high"]).default("normal"),
      transparent: z.boolean().default(true),
      onboarded: z.boolean().default(false),
    })
    .default({
      motion: "auto",
      contrast: "normal",
      transparent: true,
      onboarded: false,
    }),
});
export type UiPreferences = z.infer<typeof UiPreferencesSchema>;
export type Screen =
  | "skill-trials"
  | "trial-detail"
  | "skills"
  | "teams"
  | "profiles"
  | "modes"
  | "skill-detail"
  | "team-detail"
  | "profile-detail"
  | "integrations"
  | "home"
  | "agents"
  | "plan"
  | "tasks"
  | "verify"
  | "artifacts"
  | "diff"
  | "routing"
  | "cost"
  | "logs"
  | "doctor"
  | "settings"
  | "projects"
  | "login";
export interface UiActivity {
  id: string;
  sequence: number;
  time: string;
  role: string;
  title: string;
  detail: string;
  status: "running" | "completed" | "waiting" | "blocked" | "failed" | "info";
  rawType: string;
}
export interface UiAgent {
  id: string;
  role: Role;
  model: string;
  provider: string;
  account: string;
  status: string;
  task?: string;
  startedAt?: string;
  requested: string;
  selected: string;
  sent?: string;
  reported?: string;
  modelReported?: string;
  tokens?: number;
  requests: number;
  latencyMs?: number;
  provenance: string;
}
export interface UiTask {
  id: string;
  title: string;
  status: string;
  role: string;
  dependencies: string[];
  attempt: number;
  maxAttempts: number;
  description: string;
  surfaces: string[];
}
export interface UiCheck {
  id: string;
  title: string;
  kind: string;
  status: string;
  summary: string;
  evidenceIds: string[];
  revision: string;
}
export interface UiArtifact {
  id: string;
  name: string;
  kind: string;
  revision: string;
  current: boolean;
  hash: string;
}
export interface UiDiagnostic {
  name: string;
  status: string;
  detail: string;
}
export interface UiSnapshot {
  studio?: StudioPanelSnapshot;
  integrations?: IntegrationPanelSnapshot;
  protocol: 1;
  version: string;
  sequence: number;
  workspace: string;
  workspaceName: string;
  connected: boolean;
  busy: boolean;
  demo: boolean;
  goal?: {
    id: string;
    request: string;
    state: GoalState;
    mode: "real" | "mock";
    iteration: number;
    maxIterations: number;
    revision: string;
    reason?: string;
    privacy: string;
    activeMs: number;
  };
  plan?: {
    id: string;
    hash: string;
    version: number;
    summary: string;
    architecture: string[];
    risks: string[];
    criteria: { id: string; description: string; kind: string }[];
    approved: boolean;
  };
  tasks: UiTask[];
  agents: UiAgent[];
  checks: UiCheck[];
  artifacts: UiArtifact[];
  activity: UiActivity[];
  verification: { passed: number; total: number };
  accounts: {
    account: string;
    tokens: number;
    uncertain: number;
    charge?: number;
    estimate?: number;
  }[];
  recentGoals: { id: string; request: string; state: string }[];
  diagnostics: UiDiagnostic[];
  preferences: UiPreferences;
}
const goalId = z.string().min(1).max(96);
export const UiActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create-skill-brief"),
      brief: DraftBriefSchema,
      confirmation: z.literal("CREAR"),
    })
    .strict(),
  z.object({ type: z.literal("studio"), action: StudioActionSchema }).strict(),
  z
    .object({
      type: z.literal("create-skill"),
      description: z.string().trim().min(8).max(20000),
    })
    .strict(),
  z
    .object({ type: z.literal("integration"), action: IntegrationActionSchema })
    .strict(),
  z
    .object({
      type: z.literal("goal"),
      description: z.string().trim().min(1).max(100000),
      public: z.boolean().default(false),
    })
    .strict(),
  z.object({ type: z.literal("select"), goalId }).strict(),
  z
    .object({ type: z.literal("workspace"), path: z.string().min(1).max(4096) })
    .strict(),
  z.object({ type: z.enum(["pause", "resume", "reverify"]), goalId }).strict(),
  z
    .object({
      type: z.literal("abort"),
      goalId,
      confirmation: z.literal("ABORT"),
    })
    .strict(),
  z
    .object({
      type: z.literal("apply"),
      goalId,
      revision: z.string(),
      confirmation: z.literal("APPLY"),
    })
    .strict(),
  z
    .object({ type: z.literal("approve"), goalId, planHash: z.string() })
    .strict(),
  z
    .object({
      type: z.literal("criterion"),
      goalId,
      criterionId: z.string(),
      revision: z.string(),
    })
    .strict(),
  z.object({ type: z.literal("retry"), goalId, taskId: z.string() }).strict(),
  z.object({ type: z.literal("diff"), goalId }).strict(),
  z
    .object({
      type: z.literal("artifact"),
      goalId,
      evidenceId: z.string(),
      operation: z.enum(["inspect", "open", "copy"]),
    })
    .strict(),
  z
    .object({ type: z.literal("doctor"), online: z.boolean().default(false) })
    .strict(),
  z
    .object({
      type: z.literal("preferences"),
      preferences: UiPreferencesSchema,
    })
    .strict(),
  z.object({ type: z.literal("contributor"), allow: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("login"),
      provider: z.enum(["xai", "openai-codex", "opencode"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("auth-answer"),
      promptId: z.string(),
      value: z.string().max(100000),
    })
    .strict(),
  z.object({ type: z.literal("auth-cancel") }).strict(),
  z
    .object({
      type: z.literal("prepare"),
      goalId,
      allowNetwork: z.literal(true),
      render: z.boolean().default(false),
    })
    .strict(),
  z.object({ type: z.literal("refresh") }).strict(),
]);
export type UiAction = z.infer<typeof UiActionSchema>;
export type AuthMessage = {
  type: "auth";
  provider: string;
  message: string;
  url?: string;
  code?: string;
  promptId?: string;
  secret?: boolean;
  options?: { id: string; label: string }[];
  done?: boolean;
};
export type UiMessage =
  | { type: "snapshot"; snapshot: UiSnapshot }
  | {
      type: "result";
      requestId: string;
      ok: boolean;
      message: string;
      content?: string;
      path?: string;
      operation?: string;
    }
  | AuthMessage
  | { type: "fault"; message: string };
export function text(value: unknown, limit = 12000): string {
  // Strip terminal escape/control sequences, never execute OSC from logs or provider output.
  return String(value ?? "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .slice(0, limit);
}
