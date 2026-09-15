import { z } from "zod";

export const UNITY_SOURCE = "https://github.com/isuzu-shiranui/UnityMCP";
export const UNITY_PIN = "65a45acecddf91236024bef080fdc946195d029a";
/** User-approved project identity; credentials remain in the existing local vault. */
export const UnityPolicySchema = z.object({
  projectPath: z.string().min(1).max(4096),
  projectName: z.string().min(1).max(200),
  editorPid: z.number().int().positive(),
  endpoint: z.string().url(),
  profileIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(32),
  writeMode: z.enum(["deny", "confirm"]).default("deny"),
  trustedProject: z.literal(true),
  descriptorFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceCommit: z.literal(UNITY_PIN),
}).strict().superRefine((value, ctx) => {
  let endpoint: URL;
  try { endpoint = new URL(value.endpoint); } catch { return; }
  if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port || endpoint.pathname !== "/mcp" || endpoint.search || endpoint.hash || endpoint.username || endpoint.password)
    ctx.addIssue({ code: "custom", message: "Unity solo usa el endpoint loopback exacto /mcp, sin redirecciones ni túneles" });
});
export type UnityPolicy = z.infer<typeof UnityPolicySchema>;
