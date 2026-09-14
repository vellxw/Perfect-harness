import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  DEFAULT_INHERITED_ENV_VARS,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { Blocked, hash, now } from "../domain/util.js";
import { text } from "../presentation/protocol.js";
import { imageMime } from "../tools/evidence.js";
import { secretContent } from "../tools/paths.js";
import {
  MCP_SDK_VERSION,
  toolName,
  type Catalog,
  type CatalogTool,
  type ContentBlock,
  type IntegrationResult,
  type TransportConfig,
} from "./types.js";

const MAX_WIRE_BYTES = 8_000_000;
export function safeSchema(schema: Record<string, unknown>): void {
  if (Buffer.byteLength(JSON.stringify(schema)) > 64000)
    throw new Blocked(
      "MCP_SCHEMA_LIMIT",
      "El esquema supera el límite permitido",
    );
  let nodes = 0;
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 5000 || depth > 32)
      throw new Blocked("MCP_SCHEMA_LIMIT", "Esquema excesivamente complejo");
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        throw new Blocked("MCP_SCHEMA_UNSAFE", "Clave de esquema no permitida");
      if (
        (k === "$ref" || k === "$dynamicRef") &&
        (typeof x !== "string" || !x.startsWith("#"))
      )
        throw new Blocked(
          "MCP_SCHEMA_REF",
          "No se resuelven esquemas externos",
        );
      if (k === "pattern" && (typeof x !== "string" || x.length > 256))
        throw new Blocked("MCP_SCHEMA_PATTERN", "Patrón demasiado extenso");
      visit(x, depth + 1);
    }
  };
  visit(schema, 0);
}
export function validateInput(
  tool: CatalogTool,
  args: Record<string, unknown>,
): void {
  if (Buffer.byteLength(JSON.stringify(args)) > 2_000_000)
    throw new Blocked("MCP_ARGUMENT_LIMIT", "Argumentos demasiado grandes");
  safeSchema(tool.inputSchema);
  const cls = String(tool.inputSchema.$schema ?? "").includes("2020-12")
    ? Ajv2020
    : Ajv;
  const validator = new cls({
    strict: false,
    allErrors: false,
    validateFormats: false,
    addUsedSchema: false,
  });
  const check = validator.compile(tool.inputSchema);
  if (!check(args))
    throw new Blocked(
      "MCP_ARGUMENT_SCHEMA",
      "Los argumentos no coinciden con el esquema autorizado: " +
        validator.errorsText(check.errors),
    );
}
export function resourceAllowed(uri: string, prefixes: string[]): boolean {
  try {
    const value = new URL(uri);
    if (
      value.username ||
      value.password ||
      /%(?:2e|2f|5c)/i.test(uri) ||
      uri.includes("\\")
    )
      return false;
    return prefixes.some((prefix) => {
      const p = new URL(prefix);
      return (
        value.protocol === p.protocol &&
        value.host === p.host &&
        (value.pathname === p.pathname ||
          (p.pathname.endsWith("/") &&
            value.pathname.startsWith(p.pathname))) &&
        !value.hash
      );
    });
  } catch {
    return false;
  }
}
export function boundedResult(raw: unknown): IntegrationResult {
  if (
    !raw ||
    typeof raw !== "object" ||
    Buffer.byteLength(JSON.stringify(raw)) > MAX_WIRE_BYTES
  )
    throw new Blocked(
      "MCP_RESULT_LIMIT",
      "Respuesta MCP inválida o demasiado grande",
    );
  const result = raw as {
    content?: unknown;
    isError?: boolean;
    structuredContent?: unknown;
  };
  const content: ContentBlock[] = [];
  let textBudget = 32000,
    images = 0;
  if (Array.isArray(result.content))
    for (const item of result.content.slice(0, 64)) {
      if (!item || typeof item !== "object") continue;
      const block = item as Record<string, unknown>;
      if (
        block.type === "text" &&
        typeof block.text === "string" &&
        textBudget > 0
      ) {
        const clean = secretContent(block.text)
          ? "[Contenido omitido: posible secreto en la respuesta externa]"
          : text(block.text, textBudget);
        content.push({ type: "text", text: clean });
        textBudget -= clean.length;
      } else if (
        block.type === "image" &&
        typeof block.data === "string" &&
        ++images <= 4
      ) {
        if (
          block.data.length > 5_400_000 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(block.data)
        )
          throw new Blocked(
            "MCP_IMAGE_LIMIT",
            "Imagen inválida o demasiado grande",
          );
        const bytes = Buffer.from(block.data, "base64"),
          mimeType = imageMime(bytes);
        if (mimeType !== block.mimeType)
          throw new Blocked(
            "MCP_IMAGE_TYPE",
            "Los bytes no coinciden con el tipo de imagen declarado",
          );
        content.push({ type: "image", data: block.data, mimeType });
      } else if (block.type === "resource_link" || block.type === "resource") {
        content.push({
          type: "text",
          text: "[Recurso externo no seguido automáticamente; solicitá lectura explícita con permiso de URI]",
        });
      }
    }
  if (result.structuredContent !== undefined && textBudget > 0) {
    const data = JSON.stringify(result.structuredContent);
    content.push({
      type: "text",
      text: secretContent(data)
        ? "[Datos estructurados omitidos: posible secreto]"
        : text(data, textBudget),
    });
  }
  if (!content.length)
    content.push({
      type: "text",
      text: "El servidor no devolvió contenido compatible.",
    });
  return { content, isError: result.isError === true };
}
export function cleanEnvironment(
  directory: string,
  refs: Record<string, string>,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = Object.fromEntries(
    DEFAULT_INHERITED_ENV_VARS.map((k) => [k, ""]),
  );
  for (const key of [
    "PATH",
    "SYSTEMROOT",
    "WINDIR",
    "SYSTEMDRIVE",
    "PROCESSOR_ARCHITECTURE",
    "PROGRAMFILES",
  ])
    if (source[key]) env[key] = source[key]!;
  Object.assign(env, {
    HOME: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
    TMPDIR: directory,
    TEMP: directory,
    TMP: directory,
    TERM: "dumb",
    NODE_OPTIONS: "",
    ELECTRON_RUN_AS_NODE: "",
    PYTHONPATH: "",
    PYTHONSTARTUP: "",
    LD_PRELOAD: "",
    DYLD_INSERT_LIBRARIES: "",
  });
  for (const [key, sourceKey] of Object.entries(refs)) {
    if (
      /^(?:NODE_|PYTHON|LD_|DYLD_|PATH$|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$|TEMP$|TMP$|COMSPEC$)/.test(
        key,
      )
    )
      throw new Blocked(
        "MCP_ENV_DENIED",
        `Variable de control no permitida: ${key}`,
      );
    const value = source[sourceKey];
    if (!value || /[\r\n\0]/.test(value))
      throw new Blocked(
        "MCP_CREDENTIAL_REQUIRED",
        `Falta la variable local ${sourceKey}`,
      );
    env[key] = value;
  }
  return env;
}
export function validateEndpoint(
  config: Extract<TransportConfig, { type: "http" }>,
): URL {
  const url = new URL(config.url);
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && config.allowLoopback && loopback))
  )
    throw new Blocked(
      "MCP_ENDPOINT",
      "Usá HTTPS sin credenciales en la URL; HTTP solo en loopback autorizado",
    );
  if (loopback && !config.allowLoopback)
    throw new Blocked(
      "MCP_LOOPBACK",
      "El acceso local necesita autorización explícita",
    );
  for (const [key, value] of Object.entries(config.headers)) {
    if (
      /authorization|cookie|host|proxy|connection|content-length|mcp-session-id/i.test(
        key,
      ) ||
      /[\r\n]/.test(value) ||
      secretContent(value)
    )
      throw new Blocked(
        "MCP_HEADER",
        "No se permiten secretos ni encabezados de control en la configuración",
      );
  }
  return url;
}
export function confinedFetch(
  endpoint: URL,
  parentSignal: AbortSignal,
  fetcher: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin !== endpoint.origin ||
      url.pathname !== endpoint.pathname ||
      url.search ||
      url.username ||
      url.password
    )
      throw new Blocked(
        "MCP_ORIGIN_CHANGED",
        "El servidor intentó cambiar el destino de la conexión",
      );
    const signal = AbortSignal.any([
      parentSignal,
      ...(init?.signal ? [init.signal] : []),
      AbortSignal.timeout(120000),
    ]);
    const response = await fetcher(input, {
      ...init,
      signal,
      redirect: "error",
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Blocked(
        "MCP_REDIRECT_DENIED",
        "No se siguen redirecciones con credenciales MCP",
      );
    }
    if (Number(response.headers.get("content-length") ?? 0) > MAX_WIRE_BYTES) {
      await response.body?.cancel();
      throw new Blocked("MCP_WIRE_LIMIT", "Respuesta remota demasiado grande");
    }
    if (!response.body) return response;
    let bytes = 0;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > MAX_WIRE_BYTES) {
            controller.error(
              new Blocked("MCP_WIRE_LIMIT", "Se superó el límite de respuesta"),
            );
            return;
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
export class McpConnection {
  readonly client = new Client(
    { name: "perfect-harness", version: "0.3.0" },
    { capabilities: {}, versionNegotiation: { mode: "legacy" } },
  );
  private abort?: () => void;
  private signal?: AbortSignal;
  private constructor() {}
  static async open(
    config: TransportConfig,
    directory: string,
    signal: AbortSignal,
    timeout = 30000,
    credentials: Record<string, string> = {},
  ): Promise<McpConnection> {
    signal.throwIfAborted();
    const connection = new McpConnection();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      let transport: Parameters<Client["connect"]>[0];
      if (config.type === "stdio") {
        if (!isAbsolute(config.command))
          throw new Blocked(
            "MCP_EXECUTABLE",
            "El servidor local requiere un ejecutable con ruta absoluta autorizado por el usuario",
          );
        const command = await realpath(config.command);
        if (!(await lstat(command)).isFile())
          throw new Blocked("MCP_EXECUTABLE", "El ejecutable no es un archivo");
        const env = cleanEnvironment(directory, config.envRefs, {
          ...process.env,
          ...credentials,
        });
        const stdio = new StdioClientTransport({
          command,
          args: config.args,
          env,
          cwd: directory,
          stderr: "pipe",
          maxBufferSize: MAX_WIRE_BYTES,
        });
        // stderr is not printed or persisted: a server could put credentials there.
        stdio.stderr?.on("data", () => {});
        transport = stdio;
      } else {
        const url = validateEndpoint(config);
        const token = config.bearerEnv
          ? (credentials[config.bearerEnv] ?? process.env[config.bearerEnv])
          : undefined;
        if (config.bearerEnv && (!token || /[\r\n\0]/.test(token)))
          throw new Blocked(
            "MCP_CREDENTIAL_REQUIRED",
            `Configurá ${config.bearerEnv} localmente, nunca en el repositorio`,
          );
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: {
              ...config.headers,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
          fetch: confinedFetch(url, signal),
          reconnectionOptions: {
            initialReconnectionDelay: 1000,
            maxReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1,
            maxRetries: 0,
          },
        });
      }
      connection.signal = signal;
      connection.abort = () => {
        void connection.client.close().catch(() => {});
      };
      signal.addEventListener("abort", connection.abort, { once: true });
      await connection.client.connect(transport, { timeout, signal });
      signal.throwIfAborted();
      return connection;
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
  async catalog(signal: AbortSignal, timeout = 30000): Promise<Catalog> {
    const tools: CatalogTool[] = [],
      seen = new Set<string>(),
      cursors = new Set<string>();
    let cursor: string | undefined;
    for (
      let page = 0;
      page < 20 && this.client.getServerCapabilities()?.tools;
      page++
    ) {
      const result = await this.client.listTools(cursor ? { cursor } : {}, {
        signal,
        timeout,
      });
      for (const raw of result.tools) {
        toolName.parse(raw.name);
        if (seen.has(raw.name) || tools.length >= 250)
          throw new Blocked(
            "MCP_CATALOG_LIMIT",
            "Catálogo duplicado o demasiado grande",
          );
        seen.add(raw.name);
        safeSchema(raw.inputSchema as Record<string, unknown>);
        if (raw.outputSchema)
          safeSchema(raw.outputSchema as Record<string, unknown>);
        tools.push({
          name: raw.name,
          description: text(raw.description ?? "", 4000),
          inputSchema: raw.inputSchema as Record<string, unknown>,
          ...(raw.outputSchema
            ? { outputSchema: raw.outputSchema as Record<string, unknown> }
            : {}),
          ...(raw.annotations
            ? { annotations: raw.annotations as Record<string, unknown> }
            : {}),
        });
      }
      if (!result.nextCursor) {
        cursor = undefined;
        break;
      }
      if (cursors.has(result.nextCursor))
        throw new Blocked(
          "MCP_CATALOG_CURSOR",
          "El servidor repitió el cursor de paginación",
        );
      cursor = result.nextCursor;
      cursors.add(cursor);
    }
    if (cursor)
      throw new Blocked(
        "MCP_CATALOG_LIMIT",
        "Catálogo incompleto: demasiadas páginas",
      );
    tools.sort((a, b) => a.name.localeCompare(b.name));
    const server = this.client.getServerVersion();
    const identity = server
      ? { name: text(server.name, 200), version: text(server.version, 100) }
      : undefined;
    return {
      server: identity,
      tools,
      hash: hash({ server: identity, tools, sdk: MCP_SDK_VERSION }),
      checkedAt: now(),
    };
  }
  async call(
    tool: CatalogTool,
    args: Record<string, unknown>,
    signal: AbortSignal,
    timeout: number,
  ): Promise<IntegrationResult> {
    validateInput(tool, args);
    const result = await this.client.callTool(
      { name: tool.name, arguments: args },
      { signal, timeout },
    );
    return boundedResult(result);
  }
  async resources(
    prefixes: string[],
    signal: AbortSignal,
    cursor?: string,
  ): Promise<unknown> {
    const result = await this.client.listResources(cursor ? { cursor } : {}, {
      signal,
      timeout: 30000,
    });
    return {
      resources: result.resources
        .filter((r) => resourceAllowed(r.uri, prefixes))
        .slice(0, 100)
        .map((r) => ({
          uri: r.uri,
          name: text(r.name, 200),
          mimeType: r.mimeType,
        })),
      nextCursor: result.nextCursor,
    };
  }
  async readResource(
    uri: string,
    prefixes: string[],
    signal: AbortSignal,
  ): Promise<IntegrationResult> {
    if (!resourceAllowed(uri, prefixes))
      throw new Blocked(
        "MCP_RESOURCE_SCOPE",
        "URI fuera de los prefijos autorizados",
      );
    const result = await this.client.readResource(
      { uri },
      { signal, timeout: 30000 },
    );
    return boundedResult({
      content: result.contents.map((c) => ({
        type: "text",
        text: "text" in c ? c.text : "[Recurso binario no importado]",
      })),
    });
  }
  async close(): Promise<void> {
    if (this.abort && this.signal)
      this.signal.removeEventListener("abort", this.abort);
    await this.client.close().catch(() => {});
  }
}
