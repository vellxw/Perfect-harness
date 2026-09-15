import { constants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { processRun } from "../adapters/git/process.js";
import { PiRuntime } from "../adapters/pi/runtime.js";
import { PI_VERSION } from "../adapters/pi/session.js";
import { localPolicy } from "../config/load.js";
import type { PerfectConfig } from "../config/schema.js";
import { errorText } from "../domain/util.js";
export interface DoctorCheck {
  name: string;
  status: "PASS" | "WARN" | "BLOCKED" | "UNCONFIGURED" | "NOT_TESTED";
  detail: string;
}
export async function doctor(
  home: string,
  workspace: string,
  config: PerfectConfig,
  online = false,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push({
    name: "node",
    status:
      process.versions.node.split(".")[0] === "26" &&
      Number(process.versions.node.split(".")[1]) >= 4
        ? "PASS"
        : "BLOCKED",
    detail: `Node ${process.versions.node}; se requiere Node 26.4+ (26.x), fijado para OpenTUI FFI`,
  });
  checks.push({
    name: "platform",
    status: process.platform === "linux" ? "PASS" : "WARN",
    detail:
      process.platform === "linux"
        ? "Linux/WSL2 es la plataforma de ejecución validada"
        : "Linux/WSL2 es la plataforma de ejecución validada del núcleo V1",
  });
  if (process.getuid?.() === 0)
    checks.push({
      name: "user",
      status: "WARN",
      detail:
        "Ejecutá Perfect sin privilegios elevados; no uses agentes como administrador del sistema",
    });
  const require = createRequire(import.meta.url);
  try {
    const entry = require.resolve("@earendil-works/pi-coding-agent");
    const metadata = JSON.parse(
      await readFile(join(dirname(dirname(entry)), "package.json"), "utf8"),
    ) as { version: string };
    checks.push({
      name: "pi-sdk",
      status: metadata.version === PI_VERSION ? "PASS" : "BLOCKED",
      detail: `Instalado ${metadata.version}; adaptador fijado ${PI_VERSION}`,
    });
  } catch (error) {
    checks.push({
      name: "pi-sdk",
      status: "BLOCKED",
      detail: errorText(error),
    });
  }
  try {
    await access(workspace, constants.R_OK | constants.W_OK);
    await mkdir(home, { recursive: true, mode: 0o700 });
    await access(home, constants.W_OK);
    checks.push({
      name: "filesystem",
      status: "PASS",
      detail:
        "Carpeta de trabajo accesible; carpeta separada de estado local con permiso de escritura",
    });
  } catch (error) {
    checks.push({
      name: "filesystem",
      status: "BLOCKED",
      detail: errorText(error),
    });
  }
  try {
    const git = await processRun("git", ["--version"], { timeoutMs: 5000 });
    checks.push({
      name: "git",
      status: git.code === 0 ? "PASS" : "BLOCKED",
      detail: git.stdout.trim() || git.stderr,
    });
  } catch (error) {
    checks.push({ name: "git", status: "BLOCKED", detail: errorText(error) });
  }
  let docker = false;
  try {
    const result = await processRun(
      "docker",
      ["version", "--format", "{{.Server.Version}}"],
      { timeoutMs: 5000 },
    );
    docker = result.code === 0;
    checks.push({
      name: "sandbox",
      status: docker ? "PASS" : "BLOCKED",
      detail: docker
        ? `Servicio de Docker ${result.stdout.trim()}`
        : "El servicio de Docker no está disponible; no se ejecutarán comandos en el equipo como alternativa",
    });
  } catch {
    checks.push({
      name: "sandbox",
      status: "BLOCKED",
      detail: "Docker no está instalado o no es accesible",
    });
  }
  for (const image of [config.sandbox.image, config.sandbox.browserImage]) {
    if (!docker) {
      checks.push({
        name: `image:${image}`,
        status: "NOT_TESTED",
        detail: "Docker no disponible",
      });
      continue;
    }
    const result = await processRun(
      "docker",
      ["image", "inspect", "--format", "{{.Id}}", image],
      { timeoutMs: 5000 },
    );
    checks.push({
      name: `image:${image}`,
      status: result.code === 0 ? "PASS" : "BLOCKED",
      detail:
        result.code === 0
          ? result.stdout.trim()
          : `Descargá la imagen autorizada explícitamente: docker pull ${image}`,
    });
  }
  const pi = new PiRuntime(home, config),
    policy = await localPolicy(home);
  for (const [role, definition] of Object.entries(config.agents)) {
    try {
      const runtime = await pi.modelRuntime(definition),
        model = runtime.getModel(definition.provider, definition.model);
      if (!model) {
        checks.push({
          name: `route:${role}`,
          status: "BLOCKED",
          detail: `No está en el catálogo instalado: ${definition.provider}/${definition.model}`,
        });
        continue;
      }
      const native =
        definition.reasoning === "off"
          ? "off"
          : (model.thinkingLevelMap?.[definition.reasoning] ??
            definition.reasoning);
      const supported =
        definition.reasoning === "off" ||
        (model.reasoning &&
          model.thinkingLevelMap?.[definition.reasoning] !== null &&
          (!["xhigh", "max"].includes(definition.reasoning) ||
            Boolean(model.thinkingLevelMap?.[definition.reasoning])));
      checks.push({
        name: `route:${role}`,
        status: supported ? "PASS" : "BLOCKED",
        detail: `Solo catálogo: ${definition.provider}/${definition.model}; solicitado ${definition.reasoning}, seleccionado ${native}. La inferencia real no fue probada.`,
      });
      const auth = await runtime.checkAuth(definition.provider, {
        signal: AbortSignal.timeout(15000),
      });
      checks.push({
        name: `auth:${role}`,
        status: !auth
          ? "UNCONFIGURED"
          : auth.type !== definition.auth
            ? "BLOCKED"
            : "PASS",
        detail: auth
          ? `Autenticación configurada: ${auth.type}; requerida: ${definition.auth}. Cuenta: ${definition.accountRef}.`
          : `Ejecutá perfect conectar ${definition.provider}`,
      });
      if (online && auth) {
        await runtime.getAuth(definition.provider, {
          signal: AbortSignal.timeout(15000),
        });
        checks.push({
          name: `auth-online:${role}`,
          status: "PASS",
          detail:
            "Credenciales resueltas o renovadas; esto no demuestra acceso a inferencias ni cuota disponible",
        });
      }
    } catch (error) {
      checks.push({
        name: `route:${role}`,
        status: "BLOCKED",
        detail: errorText(error),
      });
    }
  }
  checks.push({
    name: "contributor-privacy",
    status: policy.contributorWorkspaces.includes(resolve(workspace))
      ? "PASS"
      : "WARN",
    detail:
      "Muse Contributor requiere consentimiento de esta carpeta Y un objetivo público; los mensajes y respuestas pueden usarse para entrenamiento",
  });
  checks.push({
    name: "real-provider-inference",
    status: "NOT_TESTED",
    detail: "Usá perfect prueba. El diagnóstico nunca envía inferencias.",
  });
  return checks;
}
