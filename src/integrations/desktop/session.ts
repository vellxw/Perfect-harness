import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Blocked, hash } from "../../domain/util.js";
import { text } from "../../presentation/protocol.js";
import { imageMime } from "../../tools/evidence.js";
import { nativeProcess } from "../native-process.js";
import {
  WindowGrantSchema,
  type CatalogTool,
  type Effect,
  type IntegrationResult,
  type OperationScope,
  type WindowGrant,
} from "../types.js";
import { boundedResult, cleanEnvironment } from "../wire.js";
import { literalDesktopCommand, scopedWindowsArguments } from "./arguments.js";
import { assertNonPasswordControl } from "./password.js";

const target = {
  snapshot: z.string().uuid(),
  ref: z.string().regex(/^e[0-9]{1,4}$/),
};
export const DesktopSchemas = {
  desktop_snapshot: z.object({}).strict(),
  desktop_screenshot: z.object({}).strict(),
  desktop_invoke: z.object(target).strict(),
  desktop_click: z.object(target).strict(),
  desktop_set_value: z
    .object({ ...target, value: z.string().max(10000) })
    .strict(),
  desktop_type: z.object({ ...target, value: z.string().max(10000) }).strict(),
  desktop_key: z
    .object({
      ...target,
      key: z.enum([
        "enter",
        "tab",
        "escape",
        "up",
        "down",
        "left",
        "right",
        "backspace",
        "space",
      ]),
    })
    .strict(),
  desktop_scroll: z
    .object({ ...target, direction: z.enum(["up", "down", "left", "right"]) })
    .strict(),
};
export type DesktopTool = keyof typeof DesktopSchemas;
const descriptions: Record<DesktopTool, string> = {
  desktop_snapshot:
    "Leer la estructura accesible de la ventana específica autorizada por el usuario. No enumera otras ventanas ni da acceso al sistema.",
  desktop_screenshot:
    "Capturar únicamente la ventana autorizada mediante Windows Graphics Capture. No captura todo el escritorio ni permite seguir diálogos ajenos.",
  desktop_invoke:
    "Activar un control observado mediante UI Automation; requiere aprobación explícita de esta operación.",
  desktop_click:
    "Pulsar un control observado mediante el ratón. No acepta coordenadas libres, otras ventanas ni herramientas del sistema.",
  desktop_set_value:
    "Cambiar el valor de un campo observado mediante UI Automation. Campos de contraseña prohibidos.",
  desktop_type:
    "Escribir texto literal en el campo observado, sin interpretar comandos o atajos. Requiere permiso específico.",
  desktop_key:
    "Enviar una tecla de navegación permitida al control observado, nunca atajos del sistema.",
  desktop_scroll:
    "Desplazar el control observado mediante un patrón de UI Automation.",
};
export const DESKTOP_TOOLS: CatalogTool[] = Object.entries(DesktopSchemas).map(
  ([name, schema]) => ({
    name,
    description: descriptions[name as DesktopTool],
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>,
  }),
);
export function desktopEffect(tool: string): Effect | undefined {
  return Object.hasOwn(DesktopSchemas, tool)
    ? ["desktop_snapshot", "desktop_screenshot"].includes(tool)
      ? "read"
      : "interactive"
    : undefined;
}

const WindowDescriptionSchema = z.object({
  handle: z.string(),
  pid: z.number().int(),
  startedAt: z.string(),
  executable: z.string(),
  title: z.string(),
  visible: z.boolean(),
  minimized: z.boolean(),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});
export type WindowDescription = z.infer<typeof WindowDescriptionSchema>;
export async function desktopBinaries(): Promise<{
  guard: string;
  winapp: string;
}> {
  if (process.platform !== "win32")
    throw new Blocked(
      "DESKTOP_WINDOWS_REQUIRED",
      "El control del escritorio se ejecuta en Windows, no dentro de WSL ni del contenedor Linux",
    );
  const roots = [
    fileURLToPath(new URL("../../../assets/windows/desktop/", import.meta.url)),
    fileURLToPath(
      new URL("../../../../assets/windows/desktop/", import.meta.url),
    ),
  ];
  for (const root of roots) {
    try {
      const guard = await realpath(join(root, "Perfect.DesktopGuard.exe")),
        winapp = await realpath(join(root, "winapp.exe"));
      await access(join(root, "libSkiaSharp.dll"));
      return { guard, winapp };
    } catch {}
  }
  throw new Blocked(
    "DESKTOP_INSTALL_REQUIRED",
    "Falta el módulo nativo de escritorio. Usá el instalador completo de Perfect o compilá scripts/prepare-desktop.ps1.",
  );
}
async function directory(home: string): Promise<string> {
  const dir = join(home, "desktop");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return realpath(dir);
}
export function stopPath(home: string, nonce: string): string {
  z.string().uuid().parse(nonce);
  return join(home, "desktop", `${nonce}.stop`);
}
async function guardRequest(
  home: string,
  request: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const { guard } = await desktopBinaries();
  const dir = await directory(home);
  const result = await nativeProcess(
    guard,
    [],
    dir,
    signal,
    JSON.stringify(request) + "\n",
  );
  let parsed: { ok?: boolean; result?: unknown; error?: string };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Blocked(
      "DESKTOP_GUARD_PROTOCOL",
      "El comprobador nativo no devolvió una respuesta válida",
    );
  }
  if (result.code !== 0 || !parsed.ok)
    throw new Blocked(
      "DESKTOP_GUARD",
      text(parsed.error ?? "Windows rechazó la operación", 2000),
    );
  return parsed.result;
}
export async function listDesktopWindows(
  home: string,
  signal: AbortSignal,
): Promise<WindowDescription[]> {
  const result = (await guardRequest(home, { op: "list" }, signal)) as {
    windows?: unknown;
  };
  return z.array(WindowDescriptionSchema).max(500).parse(result.windows);
}
export async function bindDesktopWindow(
  home: string,
  handle: string,
  expectedHash: string,
  minutes = 10,
  maxActions = 50,
  signal = AbortSignal.timeout(30000),
): Promise<WindowGrant> {
  const description = WindowDescriptionSchema.parse(
    await guardRequest(home, { op: "describe", handle }, signal),
  );
  if (hash(description) !== expectedHash)
    throw new Blocked(
      "DESKTOP_SELECTION_CHANGED",
      "La ventana cambió desde que se mostró. Revisala de nuevo antes de autorizarla.",
    );
  if (!description.visible || description.minimized)
    throw new Blocked(
      "DESKTOP_WINDOW_HIDDEN",
      "Restaurá la ventana antes de autorizarla",
    );
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 20)
    throw new Blocked(
      "DESKTOP_GRANT_DURATION",
      "El permiso debe durar entre uno y veinte minutos",
    );
  const grant = WindowGrantSchema.parse({
    handle,
    pid: description.pid,
    startedAt: description.startedAt,
    executable: description.executable,
    title: description.title,
    nonce: randomUUID(),
    expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
    maxActions,
  });
  await guardRequest(home, { op: "bind", handle, nonce: grant.nonce }, signal);
  return grant;
}
export async function revokeDesktopWindow(
  home: string,
  grant: WindowGrant,
): Promise<void> {
  await directory(home);
  await writeFile(stopPath(home, grant.nonce), "revoked", { mode: 0o600 });
  await guardRequest(
    home,
    { op: "unbind", handle: grant.handle, nonce: grant.nonce },
    AbortSignal.timeout(5000),
  ).catch(() => {});
}
interface ElementInfo {
  selector: string;
  type: string;
  name?: string;
  value?: string;
  isEnabled?: boolean;
  isOffscreen?: boolean;
  isPassword?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
export function inspectedElements(raw: unknown, handle: string): ElementInfo[] {
  const root = z
    .object({
      windows: z
        .array(
          z.object({
            hwnd: z.union([z.string(), z.number()]),
            elements: z.array(z.unknown()),
          }),
        )
        .min(1)
        .max(1),
    })
    .parse(raw);
  if (String(root.windows[0]!.hwnd) !== handle)
    throw new Blocked(
      "DESKTOP_CAPTURE_SCOPE",
      "La respuesta incluye otra ventana o un diálogo no autorizado",
    );
  const found: ElementInfo[] = [];
  let nodes = 0;
  const visit = (raw: unknown, depth: number): void => {
    if (++nodes > 1500 || depth > 12)
      throw new Blocked(
        "DESKTOP_TREE_LIMIT",
        "La estructura de la ventana excede el límite",
      );
    if (!raw || typeof raw !== "object") return;
    const e = raw as Record<string, unknown>;
    if (
      typeof e.selector === "string" &&
      /^[A-Za-z0-9_-]{1,200}$/.test(e.selector) &&
      typeof e.type === "string" &&
      !e.isPassword
    ) {
      found.push({
        selector: e.selector,
        type: text(e.type, 100),
        name: typeof e.name === "string" ? text(e.name, 500) : undefined,
        value: typeof e.value === "string" ? text(e.value, 2000) : undefined,
        isEnabled: e.isEnabled === true,
        isOffscreen: e.isOffscreen === true,
        isPassword: false,
        x: Number(e.x),
        y: Number(e.y),
        width: Number(e.width),
        height: Number(e.height),
      });
    }
    if (Array.isArray(e.children))
      for (const c of e.children) visit(c, depth + 1);
  };
  for (const e of root.windows[0]!.elements) visit(e, 0);
  return found.slice(0, 300);
}
function elementIdentity(e: ElementInfo): string {
  return hash({
    selector: e.selector,
    type: e.type,
    name: e.name,
    isEnabled: e.isEnabled,
    isOffscreen: e.isOffscreen,
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
  });
}

/** One scoped, non-elevated window. Every mutation is authorized by the outer integration broker. */
export class DesktopSession {
  private watcher?: ChildProcess;
  private started = false;
  private stopped = false;
  private abort = new AbortController();
  private signal: AbortSignal;
  private snapshot = "";
  private snapshotTime = 0;
  private elements = new Map<string, ElementInfo>();
  private actions = 0;
  private work = "";
  constructor(
    private home: string,
    private grant: WindowGrant,
    private scope: OperationScope,
    parent: AbortSignal,
  ) {
    this.signal = AbortSignal.any([parent, this.abort.signal]);
  }
  private async check(): Promise<WindowDescription> {
    this.signal.throwIfAborted();
    if (Date.parse(this.grant.expiresAt) <= Date.now())
      throw new Blocked(
        "DESKTOP_GRANT_EXPIRED",
        "El permiso de escritorio venció; se necesita otra autorización local",
      );
    try {
      await access(stopPath(this.home, this.grant.nonce));
      throw new Blocked("DESKTOP_STOPPED", "Control detenido por el usuario");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return WindowDescriptionSchema.parse(
      await guardRequest(
        this.home,
        { op: "check", ...this.grant },
        this.signal,
      ),
    );
  }
  private async start(): Promise<void> {
    if (this.started) return;
    await this.check();
    this.work = await directory(this.home);
    const { guard, winapp } = await desktopBinaries();
    const version = await nativeProcess(
      winapp,
      ["--version"],
      this.work,
      this.signal,
    );
    if (version.code !== 0 || !version.stdout.trim().endsWith("0.6.0"))
      throw new Blocked(
        "DESKTOP_VERSION",
        "La versión de WinApp no coincide con el módulo probado (0.6.0)",
      );
    const expires = (
      BigInt(Date.parse(this.grant.expiresAt)) * 10000n +
      621355968000000000n
    ).toString();
    const child = spawn(
      guard,
      [
        "watch",
        stopPath(this.home, this.grant.nonce),
        String(process.pid),
        expires,
      ],
      {
        cwd: this.work,
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: cleanEnvironment(this.work, {}),
      },
    );
    this.watcher = child;
    await new Promise<void>((resolve, reject) => {
      let ready = false,
        output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Blocked(
            "DESKTOP_WATCH_TIMEOUT",
            "No se pudo activar la parada de emergencia",
          ),
        );
      }, 5000);
      const done = (error: unknown) => {
        clearTimeout(timer);
        if (!ready) reject(error);
        if (!this.stopped) this.abort.abort(error);
      };
      child.once("error", done);
      child.stderr?.resume();
      child.stdout?.on("data", (chunk: Buffer) => {
        output = (output + chunk.toString("utf8")).slice(-5000);
        if (!ready && output.includes('"ready":true')) {
          ready = true;
          clearTimeout(timer);
          resolve();
        }
        if (output.includes('"stopped":true'))
          done(
            new Blocked(
              "DESKTOP_STOPPED",
              "Se activó la parada de escritorio (Ctrl+Alt+F10), venció el permiso o terminó su proceso",
            ),
          );
      });
      child.once("close", () =>
        done(
          new Blocked(
            "DESKTOP_BUSY_OR_STOPPED",
            "El escritorio no está disponible; solo un agente puede controlarlo y la parada global debe estar activa",
          ),
        ),
      );
    });
    this.started = true;
  }
  private async winapp(args: string[]): Promise<unknown> {
    await this.check();
    const { winapp } = await desktopBinaries();
    const result = await nativeProcess(
      winapp,
      scopedWindowsArguments(this.grant.handle, args),
      this.work,
      this.signal,
    );
    let value: unknown;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Blocked(
        "DESKTOP_PROTOCOL",
        "Respuesta nativa no válida; no se asumirá éxito",
      );
    }
    if (result.code !== 0)
      throw new Blocked(
        "DESKTOP_ACTION_FAILED",
        text(JSON.stringify(value), 2000),
      );
    return value;
  }
  private async inspect(): Promise<ElementInfo[]> {
    return inspectedElements(
      await this.winapp(["inspect", "--depth", "8"]),
      this.grant.handle,
    );
  }
  private async observe(): Promise<IntegrationResult> {
    const elements = await this.inspect();
    this.snapshot = randomUUID();
    this.snapshotTime = Date.now();
    this.elements.clear();
    for (const e of elements) this.elements.set(`e${this.elements.size}`, e);
    return boundedResult({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            snapshot: this.snapshot,
            window: {
              handle: this.grant.handle,
              title: this.grant.title,
              pid: this.grant.pid,
            },
            elements: [...this.elements].map(([ref, e]) => ({ ref, ...e })),
            remainingActions: this.grant.maxActions - this.actions,
            expiresAt: this.grant.expiresAt,
            emergencyStop: "Ctrl+Alt+F10",
            untrusted: true,
          }),
        },
      ],
    });
  }
  async call(
    tool: string,
    raw: Record<string, unknown>,
  ): Promise<IntegrationResult> {
    const schema = DesktopSchemas[tool as DesktopTool];
    if (!schema) throw new Blocked("DESKTOP_TOOL", tool);
    const args = schema.parse(raw) as Record<string, unknown>;
    await this.start();
    await this.check();
    if (tool === "desktop_snapshot") return this.observe();
    if (tool === "desktop_screenshot") {
      // Reject additional owned dialogs before requesting pixels; never use screen-DC mode.
      await this.inspect();
      const path = join(this.work, `${randomUUID()}.png`);
      const result = z
        .object({
          filePath: z.string(),
          hwnd: z.union([z.number(), z.string()]),
          width: z.number().positive().max(6000),
          height: z.number().positive().max(4000),
        })
        .parse(await this.winapp(["screenshot", "--output", path]));
      if (
        String(result.hwnd) !== this.grant.handle ||
        result.filePath.toLowerCase() !== path.toLowerCase()
      )
        throw new Blocked(
          "DESKTOP_CAPTURE_SCOPE",
          "La captura no corresponde a la ventana y archivo autorizados",
        );
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5_000_000)
        throw new Blocked(
          "DESKTOP_IMAGE_LIMIT",
          "Captura inválida o demasiado grande",
        );
      const bytes = await readFile(path);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              window: this.grant.handle,
              width: result.width,
              height: result.height,
              untrusted: true,
            }),
          },
          {
            type: "image",
            data: bytes.toString("base64"),
            mimeType: imageMime(bytes),
          },
        ],
      };
    }
    if (this.scope.readOnly)
      throw new Blocked(
        "DESKTOP_READ_ONLY",
        "Este agente no puede controlar el escritorio",
      );
    if (++this.actions > this.grant.maxActions)
      throw new Blocked(
        "DESKTOP_ACTION_LIMIT",
        "Se agotó el permiso de interacciones",
      );
    if (
      args.snapshot !== this.snapshot ||
      Date.now() - this.snapshotTime > 90000
    )
      throw new Blocked(
        "DESKTOP_STALE_SNAPSHOT",
        "Observá de nuevo la ventana antes de actuar",
      );
    const element = this.elements.get(String(args.ref));
    if (!element)
      throw new Blocked("DESKTOP_REFERENCE", "Referencia no observada");
    const current = (await this.inspect()).filter(
      (e) => e.selector === element.selector,
    );
    if (
      current.length !== 1 ||
      elementIdentity(current[0]!) !== elementIdentity(element) ||
      !element.isEnabled ||
      element.isOffscreen
    )
      throw new Blocked(
        "DESKTOP_STALE_ELEMENT",
        "El control cambió, está deshabilitado o no es visible",
      );
    await assertNonPasswordControl(
      (await desktopBinaries()).guard,
      this.work,
      this.grant,
      element,
      this.signal,
    );
    let command: string[];
    if (tool === "desktop_invoke") command = ["invoke", element.selector];
    else if (tool === "desktop_click") command = ["click", element.selector];
    else if (tool === "desktop_set_value")
      command = literalDesktopCommand(
        "desktop_set_value",
        element.selector,
        String(args.value),
      );
    else if (tool === "desktop_type")
      command = literalDesktopCommand(
        "desktop_type",
        element.selector,
        String(args.value),
      );
    else if (tool === "desktop_key")
      command = [
        "send-keys",
        String(args.key),
        "--target",
        element.selector,
        "--via",
        "send-input",
      ];
    else
      command = [
        "scroll",
        element.selector,
        "--direction",
        String(args.direction),
      ];
    const result = await this.winapp(command);
    const observed = await this.observe();
    return {
      ...observed,
      content: [
        { type: "text", text: JSON.stringify({ operation: tool, result }) },
        ...observed.content,
      ],
    };
  }
  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.abort.abort();
    const child = this.watcher;
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.elements.clear();
  }
}
