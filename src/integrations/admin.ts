import { lstat, readFile } from "node:fs/promises";
import { Blocked, hash } from "../domain/util.js";
import { text } from "../presentation/protocol.js";
import {
  IntegrationActionSchema,
  type DesktopWindowChoice,
  type IntegrationPanelSnapshot,
} from "./actions.js";
import { probeIntegration } from "./agent-session.js";
import { recoverBrowserResources } from "./browser/sandbox.js";
import { saveCredential } from "./credentials.js";
import {
  bindDesktopWindow,
  listDesktopWindows,
  revokeDesktopWindow,
} from "./desktop/session.js";
import { IntegrationRegistry } from "./registry.js";
import type { IntegrationOperation } from "./types.js";

/** User-authority surface. Never registered as an agent tool. */
export class IntegrationAdmin {
  readonly registry: IntegrationRegistry;
  private windows: DesktopWindowChoice[] = [];
  private windowWorkspace = "";
  constructor(readonly home: string) {
    this.registry = new IntegrationRegistry(home);
    this.registry.recoverInterrupted();
  }
  close(): void {
    this.registry.close();
  }
  snapshot(workspace: string): IntegrationPanelSnapshot {
    return {
      connections: this.registry.summaries(workspace),
      pending: this.registry
        .operations(workspace)
        .filter((o) => ["pending", "unknown"].includes(o.state))
        .slice(0, 50)
        .map((o) => ({
          id: o.id,
          serverId: o.serverId,
          tool: o.tool,
          digest: o.digest,
          state: o.state,
          effect: o.effect,
          role: o.scope.role,
          runId: o.runId,
          expiresAt: o.expiresAt,
          arguments: text(JSON.stringify(o.arguments, null, 2), 2000000),
        })),
      windows: workspace === this.windowWorkspace ? this.windows : [],
    };
  }
  credentialKey(workspace: string, id: string): string {
    const config = this.registry.require(workspace, id).config;
    if (config.kind === "github") return config.tokenEnv;
    if (
      config.kind === "mcp" &&
      config.transport.type === "http" &&
      config.transport.bearerEnv
    )
      return config.transport.bearerEnv;
    throw new Blocked(
      "MCP_LOGIN_TYPE",
      "Esta conexión no utiliza una credencial Bearer. Configurá sus referencias de entorno explícitas.",
    );
  }
  async credential(
    workspace: string,
    id: string,
    value: string,
  ): Promise<void> {
    const key = this.credentialKey(workspace, id);
    await saveCredential(this.home, key, value);
    this.registry.event(workspace, "integration.credential_saved", {
      serverId: id,
      storage:
        process.platform === "win32" ? "dpapi-current-user" : "owner-only-file",
    });
  }
  private operation(workspace: string, id: string): IntegrationOperation {
    const op = this.registry.operation(id);
    if (!op || op.workspace !== workspace)
      throw new Blocked(
        "MCP_OPERATION_SCOPE",
        "La operación no pertenece a esta carpeta",
      );
    return op;
  }
  async perform(
    workspace: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<{ message: string; content?: string }> {
    const action = IntegrationActionSchema.parse(input);
    switch (action.command) {
      case "refresh":
        return { message: "Integraciones actualizadas" };
      case "import": {
        const st = await lstat(action.path);
        if (!st.isFile() || st.isSymbolicLink() || st.size > 200000)
          throw new Blocked(
            "MCP_CONFIG_FILE",
            "Archivo de conexión inválido o demasiado grande",
          );
        const value = JSON.parse(await readFile(action.path, "utf8"));
        this.registry.save(workspace, value);
        return {
          message:
            "Configuración local importada; revisá el catálogo antes de usarla",
        };
      }
      case "configure":
        this.registry.save(workspace, action.config);
        return {
          message:
            "Integración configurada para esta carpeta. Conectar no autoriza escrituras ni otras cuentas.",
        };
      case "probe": {
        const record = await probeIntegration(
          this.home,
          workspace,
          action.id,
          signal,
        );
        return {
          message:
            "Conexión probada, sin inferencias ni llamadas de herramientas",
          content: JSON.stringify(record, null, 2),
        };
      }
      case "authorize":
        this.registry.authorizeCatalog(workspace, action.id, action.hash);
        return {
          message:
            "Catálogo exacto autorizado. Los permisos por herramienta y las confirmaciones siguen activos.",
        };
      case "disable": {
        const record = this.registry.require(workspace, action.id);
        this.registry.setEnabled(workspace, action.id, false);
        if (record.config.kind === "desktop" && record.config.grant)
          await revokeDesktopWindow(this.home, record.config.grant);
        return {
          message:
            "Integración desactivada; las ejecuciones activas recibirán la revocación.",
        };
      }
      case "inspect":
        return {
          message: "Operación externa pendiente",
          content: JSON.stringify(
            this.operation(workspace, action.id),
            null,
            2,
          ),
        };
      case "approve":
        this.registry.decide(workspace, action.id, action.digest, true);
        return {
          message:
            "Autorización de un solo uso registrada para los argumentos exactos",
        };
      case "deny":
        this.registry.decide(workspace, action.id, action.digest, false);
        return { message: "Acción rechazada; no se enviará al servicio" };
      case "reconcile":
        this.registry.reconcile(workspace, action.id, action.digest);
        return {
          message:
            "Resultado revisado por el usuario. No se repitió ninguna acción automáticamente.",
        };
      case "windows":
        this.windows = (await listDesktopWindows(this.home, signal)).map(
          (w) => ({ ...w, hash: hash(w) }),
        );
        this.windowWorkspace = workspace;
        return {
          message:
            "Ventanas visibles no elevadas. Elegí únicamente una aplicación de prueba autorizada.",
        };
      case "window": {
        const grant = await bindDesktopWindow(
          this.home,
          action.handle,
          action.hash,
          action.minutes,
          50,
          signal,
        );
        this.registry.save(workspace, {
          id: "escritorio",
          title: "Escritorio Windows",
          kind: "desktop",
          roles: ["general", "backend"],
          enabled: true,
          dataClass: "private",
          grant,
        });
        return {
          message: `Ventana autorizada: ${grant.title}. Ctrl+Alt+F10 detiene el control cuando esté activo. Cada interacción requiere confirmación.`,
        };
      }
      case "stop-desktop": {
        for (const r of this.registry.list(workspace)) {
          if (r.config.kind !== "desktop") continue;
          this.registry.setEnabled(workspace, r.config.id, false);
          if (r.config.grant)
            await revokeDesktopWindow(this.home, r.config.grant);
        }
        return { message: "Control de escritorio revocado" };
      }
      case "recover-browser":
        await recoverBrowserResources(this.registry);
        return {
          message:
            "Recursos de navegador interrumpidos reconciliados. Los procesos vivos ajenos no se modificaron.",
        };
      case "login":
        throw new Blocked(
          "MCP_SECRET_PROMPT",
          "Usá la entrada enmascarada de la interfaz o --clave-env en la CLI; nunca pases un token como argumento.",
        );
    }
  }
}
