import { readFile, lstat } from "node:fs/promises";
import { relative, join } from "node:path";
import type { Evidence, Goal } from "../domain/model.js";
import { hash, Blocked } from "../domain/util.js";
import { safePath } from "./paths.js";

export async function readEvidence(
  goal: Goal,
  evidence: Evidence,
  maxBytes: number,
): Promise<Buffer> {
  if (evidence.goalId !== goal.id || evidence.validity !== "valid")
    throw new Blocked("EVIDENCE_SCOPE", evidence.id);
  const root = join(goal.root, "artifacts");
  const path = await safePath(root, relative(root, evidence.artifactRef));
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > maxBytes)
    throw new Blocked("EVIDENCE_SIZE", evidence.id);
  const bytes = await readFile(path);
  if (
    bytes.length > maxBytes ||
    hash(bytes.toString("base64")) !== evidence.contentHash
  )
    throw new Blocked("EVIDENCE_CHANGED", evidence.id);
  return bytes;
}
export function imageMime(
  bytes: Buffer,
): "image/png" | "image/jpeg" | "image/webp" {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new Blocked("IMAGE_FORMAT", "Expected PNG, JPEG or WebP bytes");
}
