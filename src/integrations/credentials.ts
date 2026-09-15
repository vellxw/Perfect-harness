import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Blocked, hash } from "../domain/util.js";
import { nativeProcess } from "./native-process.js";
import type { TransportConfig } from "./types.js";
const keySchema = z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/);
async function vaultBinary(): Promise<string> {
  for (const url of [
    "../../assets/windows/desktop/Perfect.CredentialVault.exe",
    "../../../assets/windows/desktop/Perfect.CredentialVault.exe",
  ]) {
    try {
      return await realpath(fileURLToPath(new URL(url, import.meta.url)));
    } catch {}
  }
  throw new Blocked(
    "MCP_VAULT_REQUIRED",
    "Falta el almacén cifrado de Windows; usá el instalador completo o una variable de entorno local.",
  );
}
async function folder(home: string): Promise<string> {
  const path = join(home, "integration-credentials");
  await mkdir(path, { recursive: true, mode: 0o700 });
  if ((await lstat(path)).isSymbolicLink())
    throw new Blocked(
      "MCP_VAULT_PATH",
      "La carpeta de credenciales no puede ser un enlace",
    );
  return realpath(path);
}
async function crypt(
  data: Buffer,
  mode: "protect" | "unprotect",
  dir: string,
): Promise<Buffer> {
  const result = await nativeProcess(
    await vaultBinary(),
    [mode],
    dir,
    AbortSignal.timeout(5000),
    data.toString("base64") + "\n",
  );
  const encoded = result.stdout.trim();
  if (result.code !== 0 || !encoded || !/^[A-Za-z0-9+/]+=*$/.test(encoded))
    throw new Blocked(
      "MCP_VAULT_ACCESS",
      "No se pudo abrir la credencial del usuario actual de Windows",
    );
  return Buffer.from(encoded, "base64");
}
export async function saveCredential(
  home: string,
  key: string,
  value: string,
): Promise<void> {
  keySchema.parse(key);
  if (!value || value.length > 32000 || /[\r\n\0]/.test(value))
    throw new Blocked("MCP_CREDENTIAL_VALUE", "La clave no es válida");
  const dir = await folder(home),
    path = join(dir, hash(key) + ".json"),
    temp = join(dir, randomUUID() + ".tmp");
  const bytes = Buffer.from(value),
    protectedBytes =
      process.platform === "win32" ? await crypt(bytes, "protect", dir) : bytes;
  try {
    await writeFile(
      temp,
      JSON.stringify({
        version: 1,
        protection: process.platform === "win32" ? "dpapi" : "file-permissions",
        data: protectedBytes.toString("base64"),
      }),
      { flag: "wx", mode: 0o600 },
    );
    await rename(temp, path);
  } finally {
    bytes.fill(0);
    protectedBytes.fill(0);
    await rm(temp, { force: true });
  }
}
export async function loadCredential(
  home: string,
  key: string,
): Promise<string | undefined> {
  keySchema.parse(key);
  if (process.env[key]) return process.env[key];
  const dir = await folder(home),
    path = join(dir, hash(key) + ".json");
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.size > 100000
    )
      throw new Blocked("MCP_VAULT_PATH", "Archivo de credenciales inválido");
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
      throw new Blocked(
        "MCP_VAULT_PERMISSIONS",
        "La credencial solo puede ser legible por su propietario",
      );
    const stored = z
      .object({
        version: z.literal(1),
        protection: z.enum(["dpapi", "file-permissions"]),
        data: z.string().max(100000),
      })
      .parse(JSON.parse(await readFile(path, "utf8")));
    let bytes: Buffer = Buffer.from(stored.data, "base64");
    if (stored.protection === "dpapi") {
      if (process.platform !== "win32")
        throw new Blocked(
          "MCP_VAULT_PLATFORM",
          "Esta credencial pertenece a Windows",
        );
      bytes = await crypt(bytes, "unprotect", dir);
    } else if (process.platform === "win32")
      throw new Blocked(
        "MCP_VAULT_ENCRYPTION",
        "Windows requiere credenciales protegidas por DPAPI",
      );
    const value = bytes.toString("utf8");
    bytes.fill(0);
    return value;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}
export async function transportCredentials(
  home: string,
  transport: TransportConfig,
): Promise<Record<string, string>> {
  const refs =
    transport.type === "http"
      ? transport.bearerEnv
        ? [transport.bearerEnv]
        : []
      : Object.values(transport.envRefs);
  const values: Record<string, string> = {};
  for (const key of refs) {
    const value = await loadCredential(home, key);
    if (value) values[key] = value;
  }
  return values;
}
