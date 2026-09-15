import { z } from "zod";
import {
  IntegrationSchema,
  integrationId,
  type IntegrationSummary,
} from "./types.js";
const literalId = z.string().min(1).max(128),
  digest = z.string().min(8).max(100);
export const IntegrationActionSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("refresh") }).strict(),
  z
    .object({
      command: z.literal("import"),
      path: z.string().min(1).max(4096),
      confirmation: z.literal("CONFIAR"),
    })
    .strict(),
  z
    .object({
      command: z.literal("configure"),
      config: IntegrationSchema,
      confirmation: z.literal("CONFIAR"),
    })
    .strict(),
  z.object({ command: z.literal("probe"), id: integrationId }).strict(),
  z
    .object({
      command: z.literal("authorize"),
      id: integrationId,
      hash: digest,
      confirmation: z.literal("CONECTAR"),
    })
    .strict(),
  z.object({ command: z.literal("disable"), id: integrationId }).strict(),
  z.object({ command: z.literal("inspect"), id: literalId }).strict(),
  z
    .object({
      command: z.literal("approve"),
      id: literalId,
      digest,
      confirmation: z.literal("AUTORIZAR"),
    })
    .strict(),
  z.object({ command: z.literal("deny"), id: literalId, digest }).strict(),
  z
    .object({
      command: z.literal("reconcile"),
      id: literalId,
      digest,
      confirmation: z.literal("NO_EJECUTADO"),
    })
    .strict(),
  z.object({ command: z.literal("windows") }).strict(),
  z
    .object({
      command: z.literal("window"),
      handle: z.string().regex(/^[1-9][0-9]{0,18}$/),
      hash: digest,
      minutes: z.number().int().min(1).max(20).default(10),
      confirmation: z.literal("CONTROLAR"),
    })
    .strict(),
  z.object({ command: z.literal("stop-desktop") }).strict(),
  z.object({ command: z.literal("recover-browser") }).strict(),
  z.object({ command: z.literal("login"), id: integrationId }).strict(),
]);
export type IntegrationAction = z.infer<typeof IntegrationActionSchema>;
export interface PendingIntegration {
  id: string;
  serverId: string;
  tool: string;
  digest: string;
  state: string;
  effect: string;
  role: string;
  runId: string;
  expiresAt: string;
  arguments: string;
}
export interface DesktopWindowChoice {
  handle: string;
  pid: number;
  startedAt: string;
  executable: string;
  title: string;
  visible: boolean;
  minimized: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  hash: string;
}
export interface IntegrationPanelSnapshot {
  connections: IntegrationSummary[];
  pending: PendingIntegration[];
  windows: DesktopWindowChoice[];
}
