import { z } from "zod";
import { RoleSchema, type Role } from "../domain/model.js";

export const MCP_SDK_VERSION = "2.0.0";
export const integrationId = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/);
export const toolName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/);
export const EffectSchema = z.enum(["read", "write", "interactive"]);
export type Effect = z.infer<typeof EffectSchema>;
const envName = z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/);
export const TransportSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("stdio"),
      command: z.string().min(1).max(4096),
      args: z.array(z.string().max(8192)).max(64).default([]),
      envRefs: z.record(envName, envName).default({}),
      // This is explicit trust in a local executable, not a sandbox assertion.
      trustLocalProcess: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("http"),
      url: z.string().url().max(2048),
      bearerEnv: envName.optional(),
      headers: z
        .record(
          z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/),
          z.string().max(2048),
        )
        .default({}),
      allowLoopback: z.boolean().default(false),
    })
    .strict(),
]);
export type TransportConfig = z.infer<typeof TransportSchema>;
const common = {
  id: integrationId,
  title: z.string().min(1).max(100),
  roles: z.array(RoleSchema).min(1).max(7),
  enabled: z.boolean().default(false),
  dataClass: z.enum(["public", "private"]).default("private"),
  maxCallsPerRun: z.number().int().min(1).max(500).default(50),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  approvalTimeoutMs: z.number().int().min(1000).max(900000).default(600000),
};
export const WindowGrantSchema = z
  .object({
    handle: z.string().regex(/^[1-9][0-9]{0,18}$/),
    pid: z.number().int().positive(),
    startedAt: z.string().min(1),
    executable: z.string().min(1),
    title: z.string().max(2000),
    nonce: z.string().uuid(),
    expiresAt: z.string().datetime(),
    maxActions: z.number().int().min(1).max(200).default(50),
  })
  .strict();
export type WindowGrant = z.infer<typeof WindowGrantSchema>;
export const IntegrationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("mcp"),
      transport: TransportSchema,
      tools: z.record(toolName, EffectSchema),
      resourcePrefixes: z.array(z.string().max(2048)).max(32).default([]),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("github"),
      repositories: z
        .array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/))
        .min(1)
        .max(20),
      tokenEnv: envName.default("PERFECT_GITHUB_TOKEN"),
      writeMode: z.enum(["deny", "confirm"]).default("deny"),
      branchPrefix: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+\/$/)
        .default("perfect/"),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("browser"),
      maxActions: z.number().int().min(1).max(500).default(100),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("desktop"),
      grant: WindowGrantSchema.optional(),
    })
    .strict(),
]);
export type IntegrationConfig = z.infer<typeof IntegrationSchema>;
export interface CatalogTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}
export interface Catalog {
  server?: { name: string; version: string };
  tools: CatalogTool[];
  hash: string;
  checkedAt: string;
}
export interface IntegrationRecord {
  workspace: string;
  config: IntegrationConfig;
  configHash: string;
  catalog?: Catalog;
  authorizedCatalog?: string;
  updatedAt: string;
}
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };
export interface IntegrationResult {
  content: ContentBlock[];
  isError?: boolean;
  replayed?: boolean;
}
export interface OperationScope {
  workspace: string;
  goalId: string;
  taskId?: string;
  runId: string;
  revision: string;
  role: Role;
  model: string;
  readOnly: boolean;
  privateData: boolean;
}
export interface IntegrationOperation {
  id: string;
  workspace: string;
  goalId: string;
  runId: string;
  ownerPid?: number;
  serverId: string;
  configHash: string;
  catalogHash: string;
  tool: string;
  arguments: Record<string, unknown>;
  effect: Effect;
  scope: OperationScope;
  digest: string;
  logicalKey: string;
  state:
    | "pending"
    | "approved"
    | "running"
    | "completed"
    | "denied"
    | "expired"
    | "unknown"
    | "reconciled";
  createdAt: string;
  expiresAt: string;
  result?: IntegrationResult;
  error?: string;
}
export interface IntegrationSummary {
  id: string;
  title: string;
  kind: IntegrationConfig["kind"];
  enabled: boolean;
  configHash: string;
  catalogHash?: string;
  authorized: boolean;
  tools: number;
  roles: Role[];
  pending: number;
  status: string;
}
