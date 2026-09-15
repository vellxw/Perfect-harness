import { lstat, readFile, realpath } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Blocked, hash } from "../../domain/util.js";
import { IntegrationSchema, type IntegrationConfig } from "../types.js";
import { IntegrationRegistry } from "../registry.js";
import { UnityPolicySchema, UNITY_PIN, type UnityPolicy } from "./schema.js";
import { unityGrants } from "./policy.js";

const Descriptor = z
  .object({
    schemaVersion: z.literal(1),
    projectPath: z.string().min(1),
    projectName: z.string().min(1),
    unityVersion: z.string(),
    endpoint: z.string(),
    mcpUrl: z.string(),
    port: z.number().int(),
    pid: z.number().int().positive(),
    token: z.string().min(16).max(4096),
    publishedAt: z.string(),
  })
  .passthrough();
/** Explicit local file selected by the user. Secret contents are never returned. */
export async function inspectUnityDescriptor(path: string) {
  const st = await lstat(path);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > 32000)
    throw new Blocked(
      "UNITY_DESCRIPTOR_FILE",
      "Descriptor inválido o enlazado",
    );
  if (
    process.platform !== "win32" &&
    ((st.mode & 0o077) !== 0 || st.uid !== process.getuid?.())
  )
    throw new Blocked(
      "UNITY_DESCRIPTOR_PERMISSIONS",
      "El descriptor debe estar restringido al usuario",
    );
  const bytes = await readFile(path);
  let descriptor: z.infer<typeof Descriptor>;
  try {
    descriptor = Descriptor.parse(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new Blocked(
      "UNITY_DESCRIPTOR_FORMAT",
      "Descriptor inválido; su contenido privado no se muestra",
    );
  }
  const expectedName =
    createHash("sha256")
      .update(descriptor.projectPath)
      .digest("hex")
      .slice(0, 16) + ".json";
  if (
    basename(path) !== expectedName ||
    descriptor.endpoint !== `http://127.0.0.1:${descriptor.port}` ||
    descriptor.mcpUrl !== descriptor.endpoint + "/mcp"
  )
    throw new Blocked(
      "UNITY_DESCRIPTOR_IDENTITY",
      "La identidad del proyecto y su endpoint no coinciden",
    );
  if (
    process.platform !== "win32" &&
    /^[A-Za-z]:[\\/]/.test(descriptor.projectPath)
  )
    throw new Blocked(
      "UNITY_WSL_BOUNDARY",
      "Usá Perfect para Windows con este Editor; no se abre el puerto a Internet ni 0.0.0.0",
    );
  const projectPath = await realpath(descriptor.projectPath);
  return {
    projectPath,
    projectName: descriptor.projectName,
    editorPid: descriptor.pid,
    endpoint: descriptor.mcpUrl,
    version: descriptor.unityVersion,
    descriptorFingerprint: hash(bytes.toString("base64")),
    descriptorPath: await realpath(path),
  };
}
export function unityPreset(policy: UnityPolicy): IntegrationConfig {
  return IntegrationSchema.parse({
    id: "unity",
    title: "Unity · " + policy.projectName,
    kind: "mcp",
    enabled: true,
    roles: ["general", "frontend", "visual", "oracle"],
    dataClass: "private",
    transport: {
      type: "http",
      url: policy.endpoint,
      allowLoopback: true,
      bearerEnv: "PERFECT_UNITY_TOKEN",
      headers: {},
    },
    tools: unityGrants(policy),
    resourcePrefixes: [],
    unity: policy,
  });
}
export async function registerUnity(input: {
  home: string;
  workspace: string;
  descriptorPath: string;
  expectedFingerprint: string;
  profileIds: string[];
  writes: boolean;
  confirmation: string;
}): Promise<{ configHash: string; note: string }> {
  if (input.confirmation !== "CONFIAR PROYECTO")
    throw new Blocked(
      "UNITY_TRUST_REQUIRED",
      "Unity ejecuta código del proyecto con permisos del usuario. Confirmá CONFIAR PROYECTO después de revisar el proyecto.",
    );
  const seen = await inspectUnityDescriptor(input.descriptorPath);
  if (seen.descriptorFingerprint !== input.expectedFingerprint)
    throw new Blocked(
      "UNITY_DESCRIPTOR_CHANGED",
      "El descriptor cambió; revisalo de nuevo",
    );
  const policy = UnityPolicySchema.parse({
    projectPath: seen.projectPath,
    projectName: seen.projectName,
    editorPid: seen.editorPid,
    endpoint: seen.endpoint,
    profileIds: input.profileIds,
    writeMode: input.writes ? "confirm" : "deny",
    trustedProject: true,
    descriptorPath: seen.descriptorPath,
    descriptorFingerprint: seen.descriptorFingerprint,
    sourceCommit: UNITY_PIN,
  });
  const registry = new IntegrationRegistry(input.home);
  try {
    const record = registry.save(
      await realpath(input.workspace),
      unityPreset(policy),
    );
    return {
      configHash: record.configHash,
      note: "Conexión registrada. Ingresá el Bearer del Editor en la credencial local PERFECT_UNITY_TOKEN desde /integraciones. No se extrajo ni copió automáticamente el token. Probá y revisá el catálogo antes de usar.",
    };
  } finally {
    registry.close();
  }
}

export async function verifyUnityBinding(policy: UnityPolicy): Promise<void> {
  const actual = await inspectUnityDescriptor(policy.descriptorPath);
  if (
    actual.descriptorFingerprint !== policy.descriptorFingerprint ||
    actual.projectPath !== policy.projectPath ||
    actual.editorPid !== policy.editorPid ||
    actual.endpoint !== policy.endpoint
  )
    throw new Blocked(
      "UNITY_BINDING_CHANGED",
      "El Editor, proyecto o token cambió. Volvé a autorizar después de reconciliar operaciones inciertas.",
    );
  try {
    process.kill(policy.editorPid, 0);
  } catch {
    throw new Blocked("UNITY_EDITOR_STOPPED", "Editor no disponible");
  }
}
