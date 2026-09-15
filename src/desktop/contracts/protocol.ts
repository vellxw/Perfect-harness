import { z } from "zod";
import type { UiAction, UiMessage, UiSnapshot } from "../../presentation/protocol.js";

export const DESKTOP_PROTOCOL = 1;
export const APP_ORIGIN = "perfect://app";
export const EnvelopeSchema = z.object({
  protocol: z.literal(1), sessionId: z.string().uuid(), workspaceId: z.string().max(96),
  requestId: z.string().uuid(),
  operation: z.enum(["action", "choose-workspace", "choose-resource", "dropped-files", "files", "file", "media", "external-auth", "preview-start", "preview-stop", "preview-layout", "restart-engine", "copy", "metrics"]),
  payload: z.unknown().optional(),
}).strict();
export type DesktopEnvelope = z.infer<typeof EnvelopeSchema>;
export interface DesktopBoot { protocol: 1; sessionId: string; workspaceId: string; version: string; buildId: string; snapshot?: UiSnapshot; connected: boolean; systemReducedMotion: boolean; platform: string }
export type DesktopEvent = { type: "engine"; message: UiMessage; sequence: number; workspaceId: string } | { type: "connection"; connected: boolean; reason?: string; workspaceId: string } | { type: "preview"; open: boolean; url?: string };
export interface DesktopReply { ok: boolean; requestId: string; message?: string; data?: unknown }
export interface DesktopAPI {
  boot(): Promise<DesktopBoot>;
  request(envelope: DesktopEnvelope): Promise<DesktopReply>;
  onEvent(listener: (event: DesktopEvent) => void): () => void;
  droppedFiles(files: File[]): Promise<string[]>;
}
declare global { interface Window { perfect: DesktopAPI } }
export type { UiAction, UiMessage, UiSnapshot };

export const EngineQuerySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("files"), goalId: z.string().optional(), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
  z.object({ kind: z.literal("file"), goalId: z.string().optional(), path: z.string().min(1).max(1024) }).strict(),
  z.object({ kind: z.literal("media"), goalId: z.string(), evidenceId: z.string() }).strict(),
  z.object({ kind: z.literal("preview-start"), goalId: z.string(), checkId: z.string(), confirmation: z.literal("PREVISUALIZAR") }).strict(),
  z.object({ kind: z.literal("preview-stop") }).strict(),
]);
export function validSnapshot(value: unknown): value is UiSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<UiSnapshot>;
  return s.protocol === 1 && typeof s.workspace === "string" && typeof s.connected === "boolean" && [s.tasks,s.agents,s.activity,s.artifacts,s.checks].every(x=>Array.isArray(x) && x.length <= 100000);
}
export function parseRange(header: string | null, size: number): { start: number; end: number; partial: boolean } {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Recurso vacío");
  if (!header) return {start:0,end:size-1,partial:false};
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error("Rango inválido");
  const start = match[1] ? Number(match[1]) : Math.max(0,size-Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]),size-1) : size-1;
  if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start> end||start>=size) throw new Error("Rango no satisfacible");
  return {start,end,partial:true};
}
export function approvedNavigation(url: string, origin: string): boolean {
  try { const parsed=new URL(url); return parsed.origin === new URL(origin).origin && ["http:","https:"].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
}
