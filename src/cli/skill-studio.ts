import type { Command } from "commander";
import { lstat, readFile } from "node:fs/promises";
import type { CliContext } from "./context.js";
import { StudioAdmin } from "../skills/admin.js";
import { selectionClosure, control } from "../skills/control.js";
import { Blocked } from "../domain/util.js";

async function jsonFile(path: string) {
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 160000)
    throw new Blocked("STUDIO_FILE", "Archivo de contrato inválido");
  return JSON.parse(await readFile(path, "utf8"));
}
export function registerSkillStudio(
  program: Command,
  context: <T>(fn: (ctx: CliContext) => Promise<T>) => Promise<T>,
): void {
  const run = (input: (ctx: CliContext, a: StudioAdmin) => Promise<unknown>) =>
    context(async (ctx) => {
      const a = new StudioAdmin(ctx.store, ctx.home);
      try {
        const r = await a.perform(
          ctx.workspace,
          await ctx.config(),
          await input(ctx, a),
          AbortSignal.timeout(1200000),
        );
        ctx.print(r, r.content ?? r.message);
      } finally {
        await a.close();
      }
    });
  const root = program
    .command("skill-studio")
    .description(
      "Selección exacta, borradores y evaluaciones A/B; alternativa guiada en /habilidades",
    );
  root
    .command("seleccionar <releaseId> <hash> <estado>")
    .requiredOption("--yes", "Confirmar selección y dependencias exactas")
    .action((releaseId: string, hash: string, estado: string) =>
      run(async (ctx) => {
        if (!["on", "off"].includes(estado))
          throw new Blocked("SKILL_MODE", "Usá on/off");
        return {
          command: "manual-select",
          releaseId,
          hash,
          selected: estado === "on",
          expectedEpoch: control(ctx.store, ctx.workspace).epoch,
          pins:
            estado === "on"
              ? selectionClosure(ctx.store, ctx.workspace, releaseId)
              : [],
          confirmation: "SELECCIONAR",
        };
      }),
    );
  root
    .command("recopilar <goalId> <carpeta>")
    .requiredOption("--equipo <id>")
    .requiredOption("--licencia <licencia>")
    .option("--activadores <texto>", "Separados por coma", "")
    .requiredOption("--yes")
    .action(
      (
        goalId: string,
        folder: string,
        f: { equipo: string; licencia: string; activadores: string },
      ) =>
        run(async () => ({
          command: "collect-draft",
          goalId,
          folder,
          setIds: [f.equipo],
          license: f.licencia,
          triggers: f.activadores
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          confirmation: "RECOPILAR",
        })),
    );
  root
    .command("proponer <contrato>")
    .description("Proponer contrato A/B, sin inferencias")
    .action((file: string) =>
      run(async () => ({
        command: "trial-propose",
        spec: await jsonFile(file),
      })),
    );
  root
    .command("autorizar <trialId> <specHash>")
    .requiredOption(
      "--inspecciones <ids>",
      "Recibos de revisión separados por coma",
    )
    .requiredOption("--yes")
    .action((trialId: string, specHash: string, f: { inspecciones: string }) =>
      run(async () => ({
        command: "trial-authorize",
        trialId,
        specHash,
        inspectionIds: f.inspecciones.split(","),
        confirmation: "EVALUAR",
      })),
    );
  root
    .command("ejecutar <trialId>")
    .requiredOption("--yes", "Consume cuota real según contrato")
    .action((trialId: string) =>
      run(async () => ({
        command: "trial-run",
        trialId,
        confirmation: "EJECUTAR",
      })),
    );
  root
    .command("cancelar <trialId>")
    .action((trialId: string) =>
      run(async () => ({ command: "trial-cancel", trialId })),
    );
  root
    .command("informe <trialId>")
    .action((trialId: string) =>
      run(async () => ({ command: "trial-report", trialId })),
    );
  root
    .command("recuperar <trialId>")
    .requiredOption(
      "--yes",
      "Reconciliar procesos detenidos sin repetir escrituras inciertas",
    )
    .action((trialId: string) =>
      run(async () => ({
        command: "trial-recover",
        trialId,
        confirmation: "RECUPERAR",
      })),
    );
  const validation = program
    .command("validacion")
    .description(
      "Estado real de perfiles y editores; no confunde instalación con ejecución verificada",
    );
  validation.action(() => run(async () => ({ command: "validation-check" })));
  validation
    .command("exportar")
    .action(() => run(async () => ({ command: "validation-export" })));
  validation
    .command("perfil <id>")
    .option(
      "--contributor",
      "Autorizar datos sintéticos públicos a Contributor",
    )
    .requiredOption("--yes", "Autorizar inferencias acotadas de este perfil")
    .action((profileId: string, f: { contributor?: boolean }) =>
      run(async () => ({
        command: "validation-profile",
        profileId,
        contributorConsent: Boolean(f.contributor),
        confirmation: "PROBAR",
      })),
    );
  validation
    .command("blender")
    .requiredOption(
      "--yes",
      "Ejecutar render aislado local, sin descargar automáticamente",
    )
    .action(() =>
      run(async () => ({
        command: "validation-blender",
        confirmation: "RENDERIZAR",
      })),
    );
}
