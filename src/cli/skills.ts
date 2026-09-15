import type { Command } from "commander";
import { readFile, lstat } from "node:fs/promises";
import type { CliContext } from "./context.js";
import { StudioAdmin } from "../skills/admin.js";
import { Blocked } from "../domain/util.js";
import type { StudioAction } from "../skills/actions.js";

export function registerSkills(
  program: Command,
  context: <T>(action: (ctx: CliContext) => Promise<T>) => Promise<T>,
): void {
  const run = (
    build: (ctx: CliContext, admin: StudioAdmin) => Promise<unknown>,
  ) =>
    context(async (ctx) => {
      const admin = new StudioAdmin(ctx.store, ctx.home);
      const raw = await build(ctx, admin);
      const result = await admin.perform(
        ctx.workspace,
        await ctx.config(),
        raw,
      );
      ctx.print(result, result.content ?? result.message);
      return;
    });
  const root = program
    .command("habilidades")
    .alias("skills")
    .description(
      "Skills: ámbitos, desactivación, importación y evaluación sin permisos implícitos",
    );
  root.action(() => run(async () => ({ command: "status" })));
  root
    .command("sistema <estado>")
    .option("--yes", "Confirmar activación")
    .action((estado: string, flags: { yes?: boolean }) =>
      run(async () => {
        if (!["on", "off"].includes(estado))
          throw new Blocked("SKILL_MODE", "Usá on/off");
        return {
          command: "master",
          enabled: estado === "on",
          ...(flags.yes ? { confirmation: "ACTIVAR" } : {}),
        };
      }),
    );
  root.command("modo <modo>").action((mode: string) =>
    run(async (ctx, a) => ({
      command: "skill-mode",
      mode,
      expectedHash: a.registry.get(ctx.workspace, await ctx.config()).hash,
    })),
  );
  root
    .command("paquete <id> <estado>")
    .option("--yes", "Confirmar activación")
    .action((id: string, estado: string, flags: { yes?: boolean }) =>
      run(async (ctx, a) => {
        if (!["on", "off"].includes(estado))
          throw new Blocked("SKILL_MODE", "Usá on/off");
        return {
          command: "package",
          id,
          enabled: estado === "on",
          expectedHash: a.registry.get(ctx.workspace, await ctx.config()).hash,
          ...(flags.yes ? { confirmation: "ACTIVAR" } : {}),
        };
      }),
    );
  root
    .command("ver <releaseId>")
    .action((releaseId: string) =>
      run(async () => ({ command: "inspect", releaseId })),
    );
  root
    .command("aprobar <releaseId> <hash>")
    .requiredOption("--yes", "Aprobar la versión revisada")
    .action((releaseId: string, hash: string) =>
      run(async () => ({
        command: "approve",
        releaseId,
        hash,
        confirmation: "APROBAR",
      })),
    );
  root
    .command("evaluar <releaseId>")
    .option("--casos <archivo>")
    .option("--particion <particion>", "development o holdout", "development")
    .action((releaseId: string, flags: { casos?: string; particion: string }) =>
      run(async () => ({
        command: "evaluate",
        releaseId,
        casesFile: flags.casos,
        partition: flags.particion,
      })),
    );
  root
    .command("asignar <skillId> <ambito> <destino> <decision>")
    .action(
      (skillId: string, ambito: string, destino: string, decision: string) =>
        run(async (ctx, a) => ({
          command: "assign",
          assignment: {
            skillId,
            scope:
              (
                {
                  global: "global",
                  equipo: "set",
                  perfil: "profile",
                } as Record<string, string>
              )[ambito] ?? ambito,
            ...(ambito === "global" ? {} : { target: destino }),
            decision:
              (
                {
                  activar: "enable",
                  desactivar: "disable",
                  heredar: "inherit",
                } as Record<string, string>
              )[decision] ?? decision,
          },
          expectedHash: a.registry.get(ctx.workspace, await ctx.config()).hash,
        })),
    );
  root
    .command("importar <manifiesto>")
    .requiredOption(
      "--yes",
      "Autorizar la descarga/importación, no la activación",
    )
    .action((path: string) =>
      run(async () => {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100000)
          throw new Blocked("SKILL_MANIFEST", "Manifiesto inválido");
        const input = JSON.parse(await readFile(path, "utf8"));
        return input.directory
          ? { ...input, command: "import-local", confirmation: "IMPORTAR" }
          : { command: "import-github", input, confirmation: "IMPORTAR" };
      }),
    );
  root
    .command("capacidades")
    .action(() => run(async () => ({ command: "capabilities" })));
  root
    .command("actualizar-catalogo")
    .requiredOption("--yes", "Mostrar nuevas versiones incluidas para revisión")
    .action(() =>
      run(async () => ({
        command: "refresh-bundled",
        confirmation: "REVISAR",
      })),
    );
  root.command("lock").action(() => run(async () => ({ command: "lock" })));
  root
    .command("adoptar <goalId>")
    .requiredOption("--yes", "Cambiar snapshot de una goal en pausa")
    .action((goalId: string) =>
      run(async (ctx, a) => ({
        command: "adopt",
        goalId,
        expectedHash: a.registry.get(ctx.workspace, await ctx.config()).hash,
        confirmation: "APLICAR",
      })),
    );
  program
    .command("equipos")
    .description("Equipos de agentes y sus miembros")
    .action(() =>
      context(async (ctx) => {
        const p = new StudioAdmin(ctx.store, ctx.home).panel(
          ctx.workspace,
          await ctx.config(),
        );
        ctx.print(p.config.sets, JSON.stringify(p.config.sets, null, 2));
      }),
    );
  program
    .command("perfiles")
    .description("Perfiles independientes de su modelo")
    .action(() =>
      context(async (ctx) => {
        const p = new StudioAdmin(ctx.store, ctx.home).panel(
          ctx.workspace,
          await ctx.config(),
        );
        ctx.print(
          p.config.profiles,
          JSON.stringify(p.config.profiles, null, 2),
        );
      }),
    );
  program
    .command("modos [id]")
    .description(
      "Aplicaciones, Motion Studio, Game Creator o Estudio de skills",
    )
    .action((modeId?: string) =>
      run(async (ctx, a) =>
        modeId
          ? {
              command: "mode",
              modeId,
              expectedHash: a.registry.get(ctx.workspace, await ctx.config())
                .hash,
            }
          : { command: "status" },
      ),
    );
  program
    .command("estudio <accionJson>")
    .description(
      "Acción avanzada validada de equipos/perfiles; el JSON no puede fijar DONE",
    )
    .action((json: string) =>
      run(async () => JSON.parse(json) as StudioAction),
    );
}
