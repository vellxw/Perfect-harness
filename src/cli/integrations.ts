import { Command } from "commander";
import { Blocked } from "../domain/util.js";
import { IntegrationActionSchema } from "../integrations/actions.js";
import { IntegrationAdmin } from "../integrations/admin.js";
import { IntegrationSchema } from "../integrations/types.js";
import { withContext, type CliContext, type GlobalOptions } from "./context.js";
import { humanData } from "./spanish.js";

export function registerIntegrations(
  program: Command,
  globals: () => GlobalOptions,
): void {
  const command = program
    .command("integrations")
    .aliases(["integraciones", "mcp"])
    .description(
      "Conexiones MCP, GitHub, navegador y permisos temporales de Windows",
    );
  const execute = async (
    fn: (
      admin: IntegrationAdmin,
      ctx: CliContext,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ): Promise<void> => {
    const abort = new AbortController();
    const cancel = () =>
      abort.abort(new Error("Operación cancelada por el usuario"));
    process.once("SIGINT", cancel);
    try {
      await withContext(globals(), async (ctx) => {
        const admin = new IntegrationAdmin(ctx.home);
        try {
          const result = await fn(admin, ctx, abort.signal);
          console.log(
            ctx.json ? JSON.stringify(result, null, 2) : humanData(result),
          );
        } finally {
          admin.close();
        }
      });
    } finally {
      process.removeListener("SIGINT", cancel);
    }
  };
  const perform = (action: unknown) =>
    execute((admin, ctx, signal) =>
      admin.perform(
        ctx.workspace,
        IntegrationActionSchema.parse(action),
        signal,
      ),
    );
  command.action(() =>
    execute(async (admin, ctx) => admin.snapshot(ctx.workspace)),
  );
  command
    .command("listar")
    .alias("list")
    .description("Mostrar conexiones y permisos pendientes de esta carpeta")
    .action(() => execute(async (admin, ctx) => admin.snapshot(ctx.workspace)));
  command
    .command("agregar <archivo>")
    .alias("add")
    .requiredOption(
      "--confirmar <palabra>",
      "Escribir CONFIAR después de revisar el ejecutable o destino",
    )
    .action((path: string, opts: { confirmar: string }) =>
      perform({ command: "import", path, confirmation: opts.confirmar }),
    );
  command
    .command("github <repositorio>")
    .description(
      "Configurar el servidor oficial, limitado al repositorio indicado",
    )
    .option("--escritura", "Permitir escrituras confirmadas en ramas perfect/")
    .option(
      "--public",
      "La conexión solo contendrá datos públicos; no usar con repositorios privados",
    )
    .requiredOption("--confirmar <palabra>", "Escribir CONFIAR")
    .action(
      (
        repository: string,
        opts: { escritura?: boolean; public?: boolean; confirmar: string },
      ) =>
        perform({
          command: "configure",
          confirmation: opts.confirmar,
          config: IntegrationSchema.parse({
            id: "github",
            title: "GitHub oficial",
            kind: "github",
            repositories: [repository],
            roles: ["planner", "general", "backend", "integrator", "oracle"],
            enabled: true,
            writeMode: opts.escritura ? "confirm" : "deny",
            dataClass: opts.public ? "public" : "private",
          }),
        }),
    );
  command
    .command("navegador")
    .alias("browser")
    .description(
      "Habilitar el navegador de la aplicación aislada, sin perfil personal ni Internet",
    )
    .requiredOption("--confirmar <palabra>", "Escribir CONFIAR")
    .action((opts: { confirmar: string }) =>
      perform({
        command: "configure",
        confirmation: opts.confirmar,
        config: IntegrationSchema.parse({
          id: "navegador",
          title: "Navegador interactivo",
          kind: "browser",
          roles: ["frontend", "backend", "general"],
          enabled: true,
        }),
      }),
    );
  command
    .command("probar <id>")
    .alias("probe")
    .description(
      "Conectar y leer el catálogo real, sin inferencias ni llamadas de herramientas",
    )
    .action((id: string) => perform({ command: "probe", id }));
  command
    .command("autorizar <id>")
    .alias("authorize")
    .requiredOption(
      "--huella <sha256>",
      "Huella del catálogo que acabás de revisar",
    )
    .requiredOption("--confirmar <palabra>", "Escribir CONECTAR")
    .action((id: string, opts: { huella: string; confirmar: string }) =>
      perform({
        command: "authorize",
        id,
        hash: opts.huella,
        confirmation: opts.confirmar,
      }),
    );
  command
    .command("desactivar <id>")
    .alias("disable")
    .description("Revocar una integración sin borrar sus registros")
    .action((id: string) => perform({ command: "disable", id }));
  command
    .command("clave <id>")
    .description(
      "Guardar una credencial de una variable de entorno; no acepta tokens como argumento",
    )
    .requiredOption(
      "--key-env <nombre>",
      "Nombre de variable local que contiene la clave (también --clave-env)",
    )
    .action((id: string, opts: { keyEnv: string }) =>
      execute(async (admin, ctx) => {
        if (
          !/^[A-Z_][A-Z0-9_]{0,127}$/.test(opts.keyEnv) ||
          !process.env[opts.keyEnv]
        )
          throw new Blocked(
            "MCP_CREDENTIAL_REQUIRED",
            "La variable local indicada no existe o no es válida",
          );
        await admin.credential(ctx.workspace, id, process.env[opts.keyEnv]!);
        return {
          message:
            "Credencial guardada localmente. No se imprimió ni se escribió en el repositorio.",
          protection:
            process.platform === "win32"
              ? "DPAPI del usuario"
              : "archivo privado del propietario",
        };
      }),
    );
  command
    .command("pendientes")
    .description(
      "Mostrar los argumentos exactos de las operaciones que esperan permiso",
    )
    .action(() =>
      execute(async (admin, ctx) => admin.snapshot(ctx.workspace).pending),
    );
  command
    .command("inspeccionar <id>")
    .action((id: string) => perform({ command: "inspect", id }));
  command
    .command("aprobar <id>")
    .requiredOption("--huella <sha256>", "Huella exacta de la operación")
    .requiredOption("--confirmar <palabra>", "Escribir AUTORIZAR")
    .action((id: string, opts: { huella: string; confirmar: string }) =>
      perform({
        command: "approve",
        id,
        digest: opts.huella,
        confirmation: opts.confirmar,
      }),
    );
  command
    .command("rechazar <id>")
    .requiredOption("--huella <sha256>", "Huella exacta de la operación")
    .action((id: string, opts: { huella: string }) =>
      perform({ command: "deny", id, digest: opts.huella }),
    );
  command
    .command("reconciliar <id>")
    .description(
      "Tras revisar el servicio, confirmar que una operación incierta NO se ejecutó",
    )
    .requiredOption("--huella <sha256>", "Huella exacta de la operación")
    .requiredOption(
      "--confirmar <palabra>",
      "Escribir NO_EJECUTADO; nunca usar sin revisar el servicio",
    )
    .action((id: string, opts: { huella: string; confirmar: string }) =>
      perform({
        command: "reconcile",
        id,
        digest: opts.huella,
        confirmation: opts.confirmar,
      }),
    );
  command
    .command("ventanas")
    .description("Enumerar ventanas no elevadas del escritorio Windows actual")
    .action(() => perform({ command: "windows" }));
  command
    .command("ventana <handle>")
    .description("Autorizar una ventana específica con identidad comprobada")
    .requiredOption(
      "--huella <sha256>",
      "Huella de la descripción de ventana que acabás de ver",
    )
    .requiredOption("--confirmar <palabra>", "Escribir CONTROLAR")
    .option("--minutos <cantidad>", "Duración de uno a veinte minutos", "10")
    .action(
      (
        handle: string,
        opts: { huella: string; confirmar: string; minutos: string },
      ) =>
        perform({
          command: "window",
          handle,
          hash: opts.huella,
          minutes: Number(opts.minutos),
          confirmation: opts.confirmar,
        }),
    );
  command
    .command("detener-escritorio")
    .description("Revocar todos los permisos de escritorio de esta carpeta")
    .action(() => perform({ command: "stop-desktop" }));
  command
    .command("recuperar-navegador")
    .description("Limpiar recursos interrumpidos cuyo proceso ya terminó")
    .action(() => perform({ command: "recover-browser" }));
}
