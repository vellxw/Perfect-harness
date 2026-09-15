import type { Command } from "commander";
import type { CliContext } from "./context.js";
import { inspectUnityDescriptor, registerUnity } from "../integrations/unity/registration.js";

export function registerUnityCommands(program: Command, context: <T>(action: (ctx: CliContext) => Promise<T>) => Promise<T>): void {
  const root = program.command("unity").description("Conectar un Unity Editor de confianza mediante su MCP local; nunca abrir un túnel público");
  root.command("inspeccionar <descriptor>").description("Leer únicamente identidad del proyecto y fingerprint; nunca imprime el token").action((path: string) => context(async ctx => {
    const result = await inspectUnityDescriptor(path); ctx.print(result, JSON.stringify(result, null, 2));
  }));
  root.command("conectar <descriptor> <fingerprint>")
    .requiredOption("--perfiles <ids>", "Perfiles explícitos separados por coma")
    .option("--editar", "Permitir solicitudes de escritura con aprobación individual; requiere copia administrada")
    .requiredOption("--confirmar <texto>", "Escribí CONFIAR PROYECTO")
    .action((descriptorPath: string, expectedFingerprint: string, flags: { perfiles: string; editar?: boolean; confirmar: string }) => context(async ctx => {
      const result = await registerUnity({ home: ctx.home, workspace: ctx.workspace, descriptorPath, expectedFingerprint, profileIds: flags.perfiles.split(",").map(s => s.trim()), writes: Boolean(flags.editar), confirmation: flags.confirmar });
      ctx.print(result, result.note);
    }));
}
