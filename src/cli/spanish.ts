import { Command, Help } from "commander";
import { commandName, roleLabel, stateLabel, valueLabel } from "../i18n/es.js";
import { humanMessage } from "../i18n/messages.js";

/** Traduce la ayuda producida por Commander, nunca los argumentos recibidos del usuario. */
export function configureSpanishHelp(program: Command): void {
  const defaults = new Help();
  program.addHelpCommand("help [command]", "Mostrar la ayuda de un comando");
  const configure = (command: Command) => {
    const spanish = commandName(command.name());
    if (spanish !== command.name() && !command.aliases().includes(spanish))
      command.alias(spanish);
    command.helpOption("-h, --help", "Mostrar la ayuda (también --ayuda)");
    for (const option of command.options) {
      if (option.long === "--version")
        option.description = "Mostrar la versión";
    }
    command.configureHelp({
      formatHelp: (cmd, helper) =>
        defaults
          .formatHelp(cmd, helper)
          .replace(/^Usage:/m, "Uso:")
          .replace(/^Arguments:/m, "Argumentos:")
          .replace(/^Options:/m, "Opciones:")
          .replace(/^Global Options:/m, "Opciones generales:")
          .replace(/^Commands:/m, "Comandos:")
          .replaceAll("[options]", "[opciones]")
          .replaceAll("[command]", "[comando]")
          .replaceAll("(default:", "(predeterminado:")
          .replaceAll("(choices:", "(opciones:")
          .replaceAll("output the version number", "Mostrar la versión")
          .replaceAll(
            "display help for command",
            "Mostrar la ayuda del comando",
          )
          .replaceAll("<description...>", "<descripción...>")
          .replaceAll("<directory>", "<carpeta>")
          .replaceAll("[goalId]", "[id-objetivo]")
          .replaceAll("<goalId>", "<id-objetivo>")
          .replaceAll("<taskId>", "<id-tarea>")
          .replaceAll("<criterionId>", "<id-criterio>")
          .replaceAll("<provider>", "<proveedor>")
          .replaceAll("<reference>", "<referencia>")
          .replaceAll("<role>", "<rol>"),
      subcommandTerm: (cmd) => {
        const term = defaults.subcommandTerm(cmd);
        const name = commandName(cmd.name());
        return cmd.name() === "help"
          ? term.replace(/^help\b/, "ayuda|help")
          : name === cmd.name()
            ? term
            : term.replace(`${cmd.name()}|${name}`, `${name}|${cmd.name()}`);
      },
    });
    command.configureOutput({
      outputError: (message, write) => write(commanderMessage(message)),
    });
    command.commands.forEach(configure);
  };
  configure(program);
  program.addHelpText(
    "after",
    "\nTambién se admiten los comandos originales en inglés.\nOpciones españolas: --carpeta, --datos, --sin-interfaz, --ayuda, --si,\n--publico, --aceptar-plan, --en-linea, --cuenta, --clave-env, --rol,\n--integral, --simulado, --permitir-contributor, --permitir-red.\nLos modelos, rutas, claves JSON y datos originales no se traducen.\n",
  );
}
export function commanderMessage(message: string): string {
  return message
    .replace(/^error: unknown command (.+)$/gm, "Error: comando desconocido $1")
    .replace(/^error: unknown option (.+)$/gm, "Error: opción desconocida $1")
    .replace(
      /^error: missing required argument (.+)$/gm,
      "Error: falta el argumento obligatorio $1",
    )
    .replace(
      /^error: option (.+) argument missing$/gm,
      "Error: falta el valor de la opción $1",
    )
    .replace(
      /^error: required option (.+) not specified$/gm,
      "Error: no se indicó la opción obligatoria $1",
    )
    .replace(
      /^error: too many arguments(.+)$/gm,
      "Error: demasiados argumentos$1",
    )
    .replace(/\(Did you mean (.+)\?\)/g, "(¿Quisiste escribir $1?)")
    .replace(/^error:/gm, "Error:");
}
const keys: Readonly<Record<string, string>> = {
  id: "Identificador",
  goalId: "Objetivo",
  planId: "Plan",
  taskId: "Tarea",
  runId: "Ejecución",
  state: "Estado",
  status: "Estado",
  mode: "Modo",
  version: "Versión",
  protocol: "Protocolo",
  plan: "Plan",
  tasks: "Tareas",
  agents: "Agentes",
  runs: "Ejecuciones",
  checks: "Comprobaciones",
  verification: "Verificación",
  evidence: "Evidencia",
  approvals: "Aprobaciones",
  accounts: "Cuentas",
  usage: "Consumo",
  reservations: "Reservas de presupuesto",
  configured: "Configurado",
  observed: "Observado",
  originalRequest: "Solicitud original",
  request: "Solicitud",
  title: "Título",
  description: "Descripción",
  summary: "Resumen",
  detail: "Detalle",
  message: "Mensaje",
  architecture: "Arquitectura",
  risks: "Riesgos",
  criteria: "Criterios",
  acceptanceCriteria: "Criterios de aceptación",
  dependencies: "Dependencias",
  role: "Rol",
  assignedAgent: "Agente asignado",
  agentDefinitionId: "Agente",
  binding: "Vinculación",
  routeBinding: "Ruta del modelo",
  resolvedRouteBinding: "Ruta resuelta",
  provider: "Proveedor",
  model: "Modelo",
  account: "Cuenta",
  accountRef: "Referencia de cuenta",
  auth: "Autenticación",
  endpoint: "Destino",
  reasoning: "Razonamiento",
  requestedReasoning: "Razonamiento solicitado",
  selectedReasoning: "Razonamiento seleccionado",
  reasoningSent: "Razonamiento enviado",
  reasoningReported: "Razonamiento informado",
  reasoningRequested: "Razonamiento solicitado",
  modelRequested: "Modelo solicitado",
  modelSerialized: "Modelo serializado",
  modelReported: "Modelo informado",
  providerReported: "Proveedor informado",
  provenance: "Procedencia",
  requests: "Solicitudes",
  requestIds: "Solicitudes",
  tokens: "Tokens",
  totalTokens: "Tokens totales",
  inputTokens: "Tokens de entrada",
  outputTokens: "Tokens de salida",
  reasoningTokens: "Tokens de razonamiento",
  cacheReadTokens: "Tokens leídos de caché",
  cacheWriteTokens: "Tokens escritos en caché",
  reportedTokens: "Tokens informados",
  unknownRequests: "Solicitudes inciertas",
  reportedChargesUsd: "Cargos informados en USD",
  estimatedCost: "Costo estimado",
  reportedCharge: "Cargo informado",
  billingMode: "Modalidad de cobro",
  latencyMs: "Latencia en ms",
  durationMs: "Duración en ms",
  elapsed: "Tiempo transcurrido",
  retries: "Reintentos",
  attempt: "Intento",
  maxAttempts: "Intentos máximos",
  priority: "Prioridad",
  riskLevel: "Nivel de riesgo",
  privacyClass: "Privacidad",
  privacy: "Privacidad",
  ownedFiles: "Archivos asignados",
  ownedSurfaces: "Áreas asignadas",
  baseRevision: "Revisión base",
  candidateRevision: "Revisión candidata",
  revision: "Revisión",
  resultRevision: "Revisión resultante",
  source: "Origen",
  root: "Carpeta administrada",
  workspace: "Carpeta de trabajo",
  home: "Carpeta de datos",
  artifactRef: "Archivo de evidencia",
  artifact: "Archivo",
  artifactId: "Archivo",
  contentHash: "Hash del contenido",
  specId: "Verificación",
  evidenceIds: "Referencias de evidencia",
  kind: "Tipo",
  producer: "Productor",
  producerId: "Productor",
  validity: "Validez",
  timestamps: "Fechas",
  createdAt: "Creación",
  updatedAt: "Actualización",
  startedAt: "Inicio",
  finishedAt: "Finalización",
  completedAt: "Finalización",
  endedAt: "Finalización",
  occurredAt: "Fecha",
  iteration: "Iteración",
  maxIterations: "Iteraciones máximas",
  activeMs: "Tiempo activo en ms",
  passed: "Aprobadas",
  total: "Total",
  failures: "Fallos",
  error: "Error",
  code: "Código",
  failureReason: "Motivo del fallo",
  pauseReason: "Motivo de pausa",
  terminalReason: "Motivo de finalización",
  reason: "Motivo",
  approved: "Aprobado",
  applied: "Aplicado",
  created: "Creado",
  consent: "Consentimiento",
  requested: "Solicitado",
  valid: "Válido",
  controlRequest: "Solicitud de control",
  exitCode: "Código de salida",
  command: "Comando",
  args: "Argumentos",
  findings: "Hallazgos",
  severity: "Gravedad",
  criterionId: "Criterio",
  recommendation: "Recomendación",
  limitations: "Limitaciones",
  notes: "Notas",
  name: "Nombre",
  result: "Resultado",
  outputs: "Resultados",
};
/** Vista humana: nombres internos desconocidos se muestran literalmente, sin fingir un esquema nuevo. */
export function humanData(value: unknown): string {
  const lines: string[] = [];
  const visit = (item: unknown, depth: number, key = "") => {
    const pad = "  ".repeat(Math.min(depth, 12));
    if (Array.isArray(item)) {
      if (!item.length) lines.push(`${pad}(sin elementos)`);
      item.forEach((entry, index) => {
        lines.push(`${pad}— ${index + 1}`);
        visit(entry, depth + 1);
      });
    } else if (item !== null && typeof item === "object") {
      for (const [field, entry] of Object.entries(item)) {
        lines.push(`${pad}${keys[field] ?? field}:`);
        visit(entry, depth + 1, field);
      }
    } else {
      let text =
        item === undefined || item === null
          ? "no informado"
          : item === true
            ? "sí"
            : item === false
              ? "no"
              : String(item);
      if (["state", "status"].includes(key)) text = stateLabel(text);
      else if (["role", "assignedAgent", "agentDefinitionId"].includes(key))
        text = roleLabel(text);
      else if (
        [
          "mode",
          "privacy",
          "privacyClass",
          "kind",
          "validity",
          "billingMode",
        ].includes(key)
      )
        text = valueLabel(text);
      else if (
        [
          "reason",
          "pauseReason",
          "terminalReason",
          "detail",
          "message",
          "error",
          "failureReason",
          "summary",
          "provenance",
        ].includes(key)
      )
        text = humanMessage(text);
      lines.push(...text.split("\n").map((line) => pad + line));
    }
  };
  visit(value, 0);
  return lines
    .join("\n")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}
