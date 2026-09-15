import { Blocked } from "../../domain/util.js";
import { z } from "zod";
export const BLENDER_VERSION = "4.5.13";
export const BLENDER_IMAGE = `perfect-blender:${BLENDER_VERSION}`;
export const BlenderSpecSchema = z
  .object({
    script: z.string().regex(/^[A-Za-z0-9_./-]+\.py$/),
    sourceFile: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+\.blend$/)
      .default("source.blend"),
    width: z.number().int().min(128).max(1920).default(640),
    height: z.number().int().min(128).max(1080).default(480),
    timeoutMs: z.number().int().min(1000).max(1200000).default(240000),
    maxBytes: z.number().int().min(100000).max(32000000).default(16000000),
  })
  .strict();
export type BlenderSpec = z.infer<typeof BlenderSpecSchema>;
export function validateGlb(bytes: Buffer): {
  meshes: number;
  materials: number;
  accessors: number;
} {
  if (
    bytes.length < 24 ||
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw new Blocked(
      "GLB_INVALID",
      "Encabezado, versión o longitud inválidos",
    );
  let position = 12,
    json: Record<string, unknown> | undefined,
    binBytes = 0;
  while (position < bytes.length) {
    if (position + 8 > bytes.length)
      throw new Blocked("GLB_CHUNK", "Chunk incompleto");
    const size = bytes.readUInt32LE(position),
      kind = bytes.readUInt32LE(position + 4);
    if (size % 4 || position + 8 + size > bytes.length)
      throw new Blocked("GLB_CHUNK", "Longitud de chunk inválida");
    if (kind === 0x4e4f534a) {
      if (json || position !== 12)
        throw new Blocked("GLB_CHUNK", "JSON duplicado o fuera de posición");
      try {
        json = JSON.parse(
          bytes.toString("utf8", position + 8, position + 8 + size).trim(),
        );
      } catch {
        throw new Blocked("GLB_JSON", "JSON inválido");
      }
    } else if (kind === 0x004e4942) binBytes += size;
    position += 8 + size;
  }
  if (
    !json ||
    (json.asset as { version?: string })?.version !== "2.0" ||
    !Array.isArray(json.meshes) ||
    !json.meshes.length ||
    !Array.isArray(json.scenes) ||
    !json.scenes.length
  )
    throw new Blocked("GLB_EMPTY", "Falta geometría/escena glTF 2.0");
  const buffers = Array.isArray(json.buffers) ? json.buffers : [],
    images = Array.isArray(json.images) ? json.images : [];
  for (const entry of [...buffers, ...images])
    if (entry.uri !== undefined)
      throw new Blocked(
        "GLB_EXTERNAL",
        "El contrato exige un GLB autocontenido sin URI externas",
      );
  for (const buffer of buffers)
    if (
      !Number.isSafeInteger(buffer.byteLength) ||
      buffer.byteLength < 0 ||
      buffer.byteLength > binBytes
    )
      throw new Blocked("GLB_BUFFER", "Buffer fuera del chunk binario");
  for (const view of Array.isArray(json.bufferViews) ? json.bufferViews : []) {
    if (
      view.buffer !== 0 ||
      !Number.isSafeInteger(view.byteLength) ||
      view.byteLength < 0 ||
      !Number.isSafeInteger(view.byteOffset ?? 0) ||
      (view.byteOffset ?? 0) < 0 ||
      (view.byteOffset ?? 0) + view.byteLength > binBytes
    )
      throw new Blocked("GLB_VIEW", "BufferView fuera del archivo");
  }
  return {
    meshes: json.meshes.length,
    materials: Array.isArray(json.materials) ? json.materials.length : 0,
    accessors: Array.isArray(json.accessors) ? json.accessors.length : 0,
  };
}
