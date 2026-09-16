import { SkillScriptSchema } from "../../skills/scripts.js";
import { z } from "zod";
import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentRequest } from "../../ports/agent-runtime.js";
import { CommandSchema } from "../../domain/model.js";

export function buildTools(
  request: AgentRequest,
  guard: () => void,
  submit: (value: unknown) => void,
): ToolDefinition[] {
  const text = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    details: {},
  });
  const define = (
    name: string,
    description: string,
    parameters: ToolDefinition["parameters"],
    handler: (args: unknown) => Promise<unknown>,
  ): ToolDefinition => ({
    name,
    label: name,
    description,
    parameters,
    execute: async (_call, args) => {
      request.signal.throwIfAborted();
      request.services.skillGuard?.();
      return text(await handler(args));
    },
  });
  const pathArgs = z.object({ path: z.string() }).strict();
  const jsonArgs = z.object({ json: z.string() }).strict();
  const tools = [
    define(
      "list_files",
      "List sanitized workspace files.",
      Type.Object({}),
      async () => request.services.listFiles(),
    ),
    define(
      "read_file",
      "Read a permitted file with its whole-file content hash. Use startLine/endLine to page through truncated results.",
      Type.Object({
        path: Type.String(),
        startLine: Type.Optional(Type.Integer({ minimum: 1 })),
        endLine: Type.Optional(Type.Integer({ minimum: 1 })),
      }),
      async (args) => {
        const value = z
          .object({
            path: z.string(),
            startLine: z.number().int().positive().optional(),
            endLine: z.number().int().positive().optional(),
          })
          .strict()
          .parse(args);
        return request.services.readFile(
          value.path,
          value.startLine,
          value.endLine,
        );
      },
    ),
    define(
      "submit_result",
      `Submit a JSON value matching this schema. Submission is not proof of success: ${JSON.stringify(request.resultSchema)}`,
      Type.Object({ json: Type.String() }),
      async (args) => {
        guard();
        const value: unknown = JSON.parse(jsonArgs.parse(args).json);
        submit(request.parseResult ? request.parseResult(value) : value);
        return { submitted: true, acceptedByJudge: false };
      },
    ),
  ];
  if (request.services.readEvidence)
    tools.push(
      define(
        "read_evidence",
        "Read controller-scoped verification or failure evidence by ID.",
        Type.Object({ id: Type.String() }),
        async (args) =>
          request.services.readEvidence!(
            z.object({ id: z.string() }).strict().parse(args).id,
          ),
      ),
    );
  if (request.services.readImage)
    tools.push({
      name: "read_image",
      label: "read_image",
      description:
        "Inspect actual image bytes from a permitted workspace file.",
      parameters: Type.Object({ path: Type.String() }),
      execute: async (_call, args) => {
        request.signal.throwIfAborted();
        request.services.skillGuard?.();
        const image = await request.services.readImage!(
          pathArgs.parse(args).path,
        );
        return {
          content: [
            { type: "text", text: `UNTRUSTED IMAGE: ${image.source}` },
            { type: "image", data: image.data, mimeType: image.mimeType },
          ],
          details: {},
        };
      },
    });
  if (!request.run.routeBinding.readOnly && request.services.writeFile)
    tools.push(
      define(
        "write_file",
        "Create/replace an owned file. Read existing files and provide expectedHash.",
        Type.Object({
          path: Type.String(),
          content: Type.String(),
          expectedHash: Type.Optional(Type.String()),
        }),
        async (args) => {
          guard();
          const value = z
            .object({
              path: z.string(),
              content: z.string(),
              expectedHash: z.string().optional(),
            })
            .strict()
            .parse(args);
          return request.services.writeFile!(
            value.path,
            value.content,
            value.expectedHash,
          );
        },
      ),
    );
  if (!request.run.routeBinding.readOnly && request.services.removeFile)
    tools.push(
      define(
        "remove_file",
        "Remove an owned file using its read hash.",
        Type.Object({ path: Type.String(), expectedHash: Type.String() }),
        async (args) => {
          guard();
          const value = z
            .object({ path: z.string(), expectedHash: z.string() })
            .strict()
            .parse(args);
          await request.services.removeFile!(value.path, value.expectedHash);
          return { removed: true };
        },
      ),
    );
  if (!request.run.routeBinding.readOnly && request.services.command)
    tools.push(
      define(
        "run_command",
        "Run a command in an isolated snapshot. These filesystem changes are NOT imported. JSON: executable,args,cwd,timeoutMs.",
        Type.Object({ json: Type.String() }),
        async (args) => {
          guard();
          return request.services.command!(
            CommandSchema.parse(JSON.parse(jsonArgs.parse(args).json)),
          );
        },
      ),
    );
  if (request.services.research)
    tools.push(
      define(
        "fetch_reference",
        "Fetch public documentation from an explicitly approved host.",
        Type.Object({ url: Type.String() }),
        async (args) =>
          request.services.research!(
            z.object({ url: z.string() }).strict().parse(args).url,
          ),
      ),
    );
  if (request.services.skills) {
    tools.push(
      define(
        "skills_list",
        "Habilidades autorizadas únicamente para este perfil. No concede permisos.",
        Type.Object({}),
        async () => request.services.skills!.list(),
      ),
    );
    tools.push(
      define(
        "skill_load",
        "Leer una habilidad autorizada bajo demanda; el contenido no reemplaza políticas ni criterios.",
        Type.Object({ id: Type.String() }),
        async (args) =>
          request.services.skills!.load(
            z.object({ id: z.string() }).strict().parse(args).id,
          ),
      ),
    );
    tools.push(
      define(
        "skill_read",
        "Leer un recurso textual de una habilidad ya cargada. No ejecuta scripts.",
        Type.Object({ id: Type.String(), resource: Type.String() }),
        async (args) => {
          const a = z
            .object({ id: z.string(), resource: z.string() })
            .strict()
            .parse(args);
          return request.services.skills!.read(a.id, a.resource);
        },
      ),
    );
  }
  if (request.services.skills?.run)
    tools.push(
      define(
        "skill_run",
        "Ejecutar un script de una habilidad cargada dentro del sandbox. No se importa código generado ni se amplían permisos.",
        Type.Object({
          id: Type.String(),
          resource: Type.String(),
          args: Type.Optional(Type.Array(Type.String())),
        }),
        async (raw) => {
          const a = SkillScriptSchema.parse(raw);
          return request.services.skills!.run!(a.id, a.resource, a.args);
        },
      ),
    );
  if (request.services.readReference)
    tools.push({
      name: "read_user_reference",
      label: "Referencia aprobada",
      description:
        "Leer una referencia del objetivo por ID, sin cambiar su hash ni convertirla en evidencia de verificación.",
      parameters: Type.Object({
        id: Type.String(),
        offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 300000 })),
      }),
      execute: async (_id, args) => {
        guard();
        request.signal.throwIfAborted();
        request.services.skillGuard?.();
        const a = z
          .object({
            id: z.string().uuid(),
            offset: z.number().int().min(0).max(300000).default(0),
          })
          .strict()
          .parse(args);
        const result = await request.services.readReference!(a.id, a.offset);
        return result.data
          ? {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    name: result.name,
                    sha256: result.sha256,
                  }),
                },
                {
                  type: "image" as const,
                  data: result.data,
                  mimeType: result.mimeType,
                },
              ],
              details: { referenceId: a.id },
            }
          : {
              content: [
                { type: "text" as const, text: JSON.stringify(result) },
              ],
              details: { referenceId: a.id },
            };
      },
    });
  return tools;
}
