import type { UiSnapshot, UiAction } from "../../presentation/protocol.js";
import type { FormSpec } from "./form.js";
import { DraftBriefSchema } from "../../skills/creator.js";
import { TrialSpecSchema } from "../../skills/experiments.js";
import { Key } from "../../skills/model.js";
export type SkillWizard =
  | "create"
  | "collect"
  | "evaluate-response"
  | "evaluate-code";
export function skillWizard(
  kind: SkillWizard,
  s: UiSnapshot,
  subject: string,
  done: (action: UiAction, title: string, body: string, phrase: string) => void,
): FormSpec {
  const studio = s.studio;
  if (!studio) throw Error("Abrí /habilidades para cargar la carpeta primero");
  const teams = studio.config.sets
    .filter((t) => t.enabled)
    .map((t) => ({ value: t.id, label: t.name }));
  const release = studio.skills.find((r) => r.releaseId === subject);
  if (kind === "create")
    return {
      title: "Crear habilidad · definir el procedimiento",
      fields: [
        { key: "name", label: "Identificador", initial: "mi-habilidad" },
        { key: "team", label: "Equipo destinatario", choices: teams },
        { key: "problem", label: "Problema que resuelve" },
        { key: "when", label: "Cuándo usarla" },
        { key: "avoid", label: "Cuándo NO usarla" },
        { key: "inputs", label: "Entradas necesarias" },
        { key: "output", label: "Resultado esperado" },
        { key: "checks", label: "Cómo comprobar el resultado" },
        {
          key: "license",
          label: "Licencia de contenido propio",
          choices: [
            { value: "MIT", label: "MIT (solo contenido que puedo licenciar)" },
            { value: "Proprietary-local", label: "Solo uso local privado" },
          ],
        },
      ],
      submit: (v) => {
        const brief = DraftBriefSchema.parse(v);
        done(
          { type: "create-skill-brief", brief, confirmation: "CREAR" },
          "Crear un borrador privado",
          `${brief.name}\nEquipo: ${brief.team}\n${brief.problem}\n\nInicia una goal con el perfil autor. No publica, instala ni aprueba la habilidad. Consume la cuota del agente configurado.`,
          "CREAR",
        );
      },
    };
  if (kind === "collect") {
    if (!s.goal || s.goal.state !== "DONE")
      throw Error("Seleccioná una goal de creación completada por el Judge");
    return {
      title: "Recopilar borrador verificado",
      fields: [
        {
          key: "folder",
          label: "Carpeta dentro del candidato",
          initial: "mi-habilidad",
        },
        { key: "team", label: "Equipo", choices: teams },
        { key: "triggers", label: "Activadores separados por coma" },
        {
          key: "license",
          label: "Licencia de contenido propio",
          choices: [
            { value: "MIT", label: "MIT" },
            { value: "Proprietary-local", label: "Solo uso local" },
          ],
        },
      ],
      submit: (v) => {
        Key.parse(v.team);
        done(
          {
            type: "studio",
            action: {
              command: "collect-draft",
              goalId: s.goal!.id,
              folder: v.folder!,
              setIds: [v.team!],
              license: v.license!,
              triggers: v
                .triggers!.split(",")
                .map((x) => x.trim())
                .filter(Boolean),
              confirmation: "RECOPILAR",
            },
          },
          "Recopilar sin activar",
          `Goal ${s.goal!.id}\nCarpeta ${v.folder}\nEquipo ${v.team}\n\nSe comprobará la autoría y la revisión exacta. Entra en cuarentena.`,
          "RECOPILAR",
        );
      },
    };
  }
  if (!release)
    throw Error(
      "Seleccioná una versión de habilidad antes de proponer una evaluación",
    );
  const profiles = studio.config.profiles
    .filter(
      (p) =>
        p.enabled &&
        studio.config.modes
          .find((m) => m.id === studio.config.activeMode)!
          .profiles.includes(p.id) &&
        (kind !== "evaluate-code" || !p.readOnly),
    )
    .map((p) => ({ value: p.id, label: `${p.name} · ${p.binding.model}` }));
  const common = [
    { key: "profile", label: "Perfil y modelo a evaluar", choices: profiles },
    {
      key: "partition",
      label: "Partición que se ejecutará",
      choices: [
        { value: "development", label: "Desarrollo: ajustar el borrador" },
        { value: "holdout", label: "Reservada: no usar para optimizar" },
      ],
    },
    {
      key: "public",
      label: "Privacidad de casos y skill",
      choices: [
        { value: "false", label: "Privados: Contributor no permitido" },
        { value: "true", label: "Públicos: autorizo compartir estos datos" },
      ],
    },
  ];
  const cases =
    kind === "evaluate-code"
      ? [
          {
            key: "exportName",
            label: "Función exportada",
            initial: "calculate",
          },
          { key: "devPrompt", label: "Caso de desarrollo: contrato" },
          {
            key: "devArgs",
            label: "Entradas numéricas del caso",
            hint: "Ejemplo: 2, 3. Los valores esperados no se envían al agente.",
          },
          { key: "devExpected", label: "Resultado numérico esperado" },
          { key: "holdPrompt", label: "Caso reservado: contrato" },
          { key: "holdArgs", label: "Entradas numéricas reservadas" },
          { key: "holdExpected", label: "Resultado reservado esperado" },
        ]
      : [
          { key: "devPrompt", label: "Caso de desarrollo: solicitud" },
          { key: "devExpected", label: "Texto que debe aparecer (desarrollo)" },
          { key: "holdPrompt", label: "Caso reservado: solicitud" },
          { key: "holdExpected", label: "Texto que debe aparecer (reservado)" },
        ];
  return {
    title:
      kind === "evaluate-code"
        ? "Evaluar código · pruebas aisladas"
        : "Evaluar respuestas · comparación A/B",
    fields: [
      ...common,
      ...cases,
      {
        key: "repetitions",
        label: "Repeticiones por condición",
        choices: [
          { value: "1", label: "1 · exploración, no certeza estadística" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
        ],
      },
    ],
    submit: (v) => {
      const numeric = (value: string) => {
        if (!value.trim()) throw Error("Falta un resultado numérico");
        const n = Number(value);
        if (!Number.isFinite(n)) throw Error("Usá números finitos");
        return n;
      };
      const evalCases = ["dev", "hold"].map((prefix) =>
        kind === "evaluate-code"
          ? {
              id: prefix,
              kind: "code",
              prompt: v[prefix === "dev" ? "devPrompt" : "holdPrompt"],
              partition: prefix === "dev" ? "development" : "holdout",
              exportName: v.exportName,
              examples: [
                {
                  args: v[prefix + "Args"]!.split(",").map((n) => numeric(n)),
                  expected: numeric(v[prefix + "Expected"]!),
                },
              ],
            }
          : {
              id: prefix,
              kind: "response",
              prompt: v[prefix === "dev" ? "devPrompt" : "holdPrompt"],
              partition: prefix === "dev" ? "development" : "holdout",
              contains: [v[prefix + "Expected"]!],
            },
      );
      const spec = TrialSpecSchema.parse({
        releaseId: release.releaseId,
        profileId: v.profile,
        cases: evalCases,
        partition: v.partition,
        repetitions: Number(v.repetitions),
        publicData: v.public === "true",
        maxRequests: 16,
        maxTokens: 96000,
        timeoutMs: 600000,
      });
      done(
        { type: "studio", action: { command: "trial-propose", spec } },
        "Guardar contrato de evaluación",
        `${release.name}\nVersión ${release.hash}\nPerfil ${v.profile}\nPartición ${v.partition}\nMáximo 16 solicitudes y 96000 tokens reservados en total.\n\nGuardar no ejecuta inferencias. Después hay que inspeccionar, autorizar y ejecutar.`,
        "GUARDAR",
      );
    },
  };
}
