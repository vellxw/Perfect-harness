import { studioRows, studioScreens } from "./studio-view.js";
import {
  commandName,
  fold,
  reasoningLabel,
  roleLabel,
  stateLabel,
  usdLabel,
  valueLabel,
} from "../../i18n/es.js";
import type {
  Screen,
  UiSnapshot,
  UiTask,
} from "../../presentation/protocol.js";
import { text } from "../../presentation/protocol.js";
import { integrationRows } from "./integration-view.js";
export interface Row {
  id: string;
  title: string;
  detail: string;
  status: string;
  body: string;
}
export interface PaletteItem {
  name: string;
  description: string;
  args?: string;
}
export const commands: PaletteItem[] = [
  {
    name: "unity",
    description: "Conectar el Editor al MCP local con proyecto autorizado",
  },
  {
    name: "capacidades",
    description: "Comprobar Blender, PostgreSQL y requisitos de editores",
  },
  {
    name: "skills",
    description: "Activar, desactivar y asignar habilidades por equipo",
  },
  { name: "teams", description: "Equipos y pertenencia de perfiles" },
  {
    name: "profiles",
    description: "Elegir modelo, cuenta y conocimientos de cada perfil",
  },
  { name: "modes", description: "Aplicaciones, Motion Studio y Game Creator" },
  { name: "juegos", description: "Seleccionar Game Creator" },
  { name: "motion", description: "Seleccionar Motion Studio" },
  {
    name: "crear-skill",
    description: "Crear un borrador de habilidad y sus pruebas",
    args: "descripción y equipo",
  },
  {
    name: "equipo",
    description: "Crear o renombrar equipo",
    args: "id Nombre del equipo",
  },
  {
    name: "adoptar-perfiles",
    description: "Reiniciar una goal en pausa con ajustes actuales",
  },
  {
    name: "integrations",
    description: "Conexiones MCP, permisos y ventanas autorizadas",
  },
  {
    name: "github",
    description: "Conectar el servidor oficial a un repositorio",
    args: "propietario/repositorio",
  },
  {
    name: "browser",
    description: "Navegador interactivo de la aplicación aislada",
  },
  { name: "desktop", description: "Elegir una ventana de Windows" },
  {
    name: "detener-escritorio",
    description: "Revocar el control del escritorio",
  },
  {
    name: "mcp-importar",
    description: "Importar una conexión MCP revisada",
    args: "archivo.json",
  },
  {
    name: "clave",
    description: "Ingresar la credencial local sin mostrarla",
    args: "id",
  },
  {
    name: "goal",
    description: "Iniciar un objetivo sin tocar la carpeta original",
    args: "Describí qué construir",
  },
  {
    name: "agents",
    description: "Inspeccionar los agentes, modelos y proveedores reales",
  },
  {
    name: "plan",
    description: "Revisar la arquitectura, los criterios y las dependencias",
  },
  {
    name: "tasks",
    description: "Ver todas las tareas, los intentos y las áreas asignadas",
  },
  {
    name: "verify",
    description: "Ver comprobaciones y evidencia de la versión actual",
  },
  {
    name: "artifacts",
    description: "Capturas, renderizados, trazas e informes",
  },
  { name: "diff", description: "Revisar los cambios de la versión candidata" },
  {
    name: "routing",
    description: "Identidad del modelo solicitada, enviada e informada",
  },
  {
    name: "cost",
    description: "Uso observado, solicitudes inciertas y facturación",
  },
  {
    name: "logs",
    description: "Actividad reciente; Enter muestra los detalles",
  },
  { name: "pause", description: "Pausar nuevas tareas y conservar el trabajo" },
  { name: "resume", description: "Recuperar y reanudar el objetivo actual" },
  {
    name: "approve",
    description: "Aprobar exactamente el plan que se muestra",
  },
  {
    name: "retry",
    description: "Reintentar una tarea fallida sin reiniciar los límites",
    args: "task-id",
  },
  {
    name: "abort",
    description: "Cancelar el objetivo con confirmación explícita",
  },
  {
    name: "apply",
    description: "Aplicar una versión completada y verificada tras confirmar",
  },
  {
    name: "reverify",
    description: "Repetir las comprobaciones de un objetivo en pausa",
  },
  {
    name: "doctor",
    description: "Revisar este equipo sin enviar inferencias",
  },
  { name: "settings", description: "Animaciones, contraste y privacidad" },
  { name: "projects", description: "Objetivos recientes de esta carpeta" },
  {
    name: "workspace",
    description: "Elegir una carpeta local de trabajo",
    args: "path",
  },
  {
    name: "login",
    description: "Conectar un proveedor de forma local",
    args: "xai | openai-codex | opencode",
  },
  {
    name: "contributor",
    description: "Revisar el consentimiento de Muse Contributor",
  },
  {
    name: "public",
    description: "Declarar público el próximo objetivo",
  },
  {
    name: "private",
    description: "Mantener privado el próximo objetivo (predeterminado)",
  },
  {
    name: "prepare",
    description: "Autorizar paquetes públicos de npm para un objetivo en pausa",
  },
  { name: "help", description: "Atajos de teclado y controles de seguridad" },
  {
    name: "exit",
    description: "Pausar el trabajo de forma segura y cerrar Perfect",
  },
];
export function filterCommands(query: string): PaletteItem[] {
  const q = fold(query.replace(/^\//, "").split(/\s/)[0]!);
  return commands.filter(
    (c) =>
      fold(c.name).includes(q) ||
      fold(commandName(c.name)).includes(q) ||
      fold(c.description).includes(q),
  );
}
export function orderedTasks(
  tasks: UiTask[],
): { task: UiTask; depth: number }[] {
  const byId = new Map(tasks.map((t) => [t.id, t])),
    depths = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    if (depths.has(id)) return depths.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d =
      1 +
      Math.max(
        -1,
        ...(byId.get(id)?.dependencies ?? [])
          .filter((d) => byId.has(d))
          .map((d) => depth(d, new Set(seen))),
      );
    depths.set(id, d);
    return d;
  };
  return tasks
    .map((task) => ({ task, depth: depth(task.id, new Set()) }))
    .sort((a, b) => a.depth - b.depth || a.task.id.localeCompare(b.task.id));
}
export function viewRows(s: UiSnapshot, screen: Screen, subject = ""): Row[] {
  if ((studioScreens as readonly string[]).includes(screen))
    return studioRows(s, screen, subject);
  switch (screen) {
    case "integrations":
      return integrationRows(s);
    case "agents":
    case "routing":
      return s.agents.map((a) => ({
        id: a.id,
        title: `${roleLabel(a.role)} · ${stateLabel(a.status)}`,
        detail: `${a.provider}/${a.model} · ${reasoningLabel(a.selected)}`,
        status: a.status,
        body: [
          `ROL         ${roleLabel(a.role)}`,
          `PROVEEDOR   ${a.provider}`,
          `CUENTA      ${a.account}`,
          `MODELO      ${a.model}`,
          `INFORMADO   ${a.modelReported ?? "desconocido (el proveedor no lo expone)"}`,
          `SOLICITADO  ${reasoningLabel(a.requested)}`,
          `SELECCIONADO ${reasoningLabel(a.selected)}`,
          `ENVIADO     ${a.sent ?? "no observado"}`,
          `INFORMADO   ${a.reported ?? "desconocido (el proveedor no lo expone)"}`,
          `TAREA       ${a.task ?? "ninguno"}`,
          `SOLICITUDES ${a.requests}`,
          `TOKENS      ${a.tokens?.toLocaleString("es-AR") ?? "desconocido"}`,
          `LATENCIA    ${a.latencyMs === undefined ? "desconocido" : `${a.latencyMs} ms`}`,
          `PROCEDENCIA ${a.provenance}`,
          "",
          "Un modelo configurado no demuestra que se haya ejecutado una inferencia.",
        ].join("\n"),
      }));
    case "plan":
    case "tasks":
      return orderedTasks(s.tasks).map(({ task: t, depth }) => ({
        id: t.id,
        title: `${"  ".repeat(Math.min(depth, 6))}${depth ? "↳ " : ""}${t.title}`,
        detail: `${roleLabel(t.role)} · intento ${t.attempt}/${t.maxAttempts}${t.dependencies.length ? ` · después de ${t.dependencies.join(", ")}` : ""}`,
        status: t.status,
        body: [
          t.description,
          "",
          `Dependencias: ${t.dependencies.join(", ") || "ninguno"}`,
          `Área asignada: ${t.surfaces.join(", ") || "solo lectura"}`,
          `Estado: ${stateLabel(t.status)}`,
          `Intento ${t.attempt}/${t.maxAttempts}`,
        ].join("\n"),
      }));
    case "verify":
      return s.checks.map((c) => ({
        id: c.id,
        title: c.title,
        detail: `${valueLabel(c.kind)} · ${stateLabel(c.status)}`,
        status: c.status,
        body: `${c.summary}\n\nVersión candidata: ${c.revision}\nEvidencia: ${c.evidenceIds.join(", ") || "no generada"}\n\nUsá /archivos para inspeccionar la evidencia original.`,
      }));
    case "artifacts":
      return s.artifacts.map((a) => ({
        id: a.id,
        title: a.name,
        detail: `${valueLabel(a.kind)} · ${a.current ? "versión actual" : "versión anterior"}`,
        status: a.current ? "completed" : "waiting",
        body: `Tipo: ${valueLabel(a.kind)}\nVersión candidata: ${a.revision}\nSHA256: ${a.hash}\n\nEnter inspecciona texto verificado. O abre imágenes o videos verificados. C copia la ruta verificada. Otros formatos requieren inspección externa explícita.`,
      }));
    case "cost":
      return s.accounts.map((a) => ({
        id: a.account,
        title: a.account,
        detail: `${a.tokens.toLocaleString("es-AR")} tokens informados · ${a.uncertain} solicitudes inciertas`,
        status: "info",
        body: `Tokens informados: ${a.tokens.toLocaleString("es-AR")}\nSolicitudes con uso desconocido: ${a.uncertain}\nCargo observado: ${a.charge === undefined ? "no informado" : usdLabel(a.charge)}\nCargo por consumo estimado: ${a.estimate === undefined ? "no corresponde / desconocido" : usdLabel(a.estimate)}\n\nLa cuota de una suscripción no es una factura por token. Desconocido no significa cero.`,
      }));
    case "doctor":
      return s.diagnostics.map((d) => ({
        id: d.name,
        title: d.name,
        detail: stateLabel(d.status),
        status:
          d.status === "PASS"
            ? "passed"
            : d.status === "BLOCKED"
              ? "blocked"
              : "waiting",
        body: d.detail,
      }));
    case "projects":
      return s.recentGoals.map((g) => ({
        id: g.id,
        title: g.request,
        detail: stateLabel(g.state),
        status: g.state,
        body: `${g.id}\n${stateLabel(g.state)}`,
      }));
    case "settings":
      return [
        {
          id: "motion",
          title: "Animaciones",
          detail: valueLabel(s.preferences.ui.motion),
          status: "info",
          body: "El modo automático reduce las animaciones en conexiones remotas, CI y terminales limitadas. Se detienen al quedar inactivo.",
        },
        {
          id: "contrast",
          title: "Alto contraste",
          detail: valueLabel(s.preferences.ui.contrast),
          status: "info",
          body: "Aumenta el contraste del texto secundario. Los estados siempre incluyen etiquetas y símbolos.",
        },
        {
          id: "transparent",
          title: "Fondo de la terminal",
          detail: s.preferences.ui.transparent ? "transparente" : "sólido",
          status: "info",
          body: "El desenfoque depende de Acrylic de Windows Terminal, no de las celdas de texto.",
        },
        {
          id: "login-xai",
          title: "Conectar xAI",
          detail: "OAuth de la suscripción",
          status: "info",
          body: "Autenticación local: ningún token se guarda en el repositorio.",
        },
        {
          id: "login-openai-codex",
          title: "Conectar ChatGPT / Codex",
          detail: "OAuth de la suscripción",
          status: "info",
          body: "Autenticación local mediante el proveedor de Pi configurado.",
        },
        {
          id: "login-opencode",
          title: "Conectar OpenCode",
          detail: "Clave API de Muse Contributor",
          status: "info",
          body: "El contenido de Contributor puede usarse para entrenamiento. El consentimiento de la carpeta es independiente.",
        },
        {
          id: "contributor",
          title: "Privacidad de Contributor",
          detail: "Consentimiento por carpeta, nunca automático",
          status: "waiting",
          body: "Solo los objetivos públicos pueden usar Contributor. Nunca compartas secretos ni código confidencial.",
        },
        {
          id: "doctor",
          title: "Revisar este equipo",
          detail: "No se envían inferencias",
          status: "info",
          body: "Revisar el entorno, Git, Docker, las imágenes del navegador y los proveedores configurados.",
        },
      ];
    case "home":
    case "logs":
      return s.activity.map((a) => ({
        id: a.id,
        title: `${roleLabel(a.role)} · ${a.title}`,
        detail: a.detail,
        status: a.status,
        body: `${a.title}\n${a.detail}\n\n${a.time}\nEvento original ${a.sequence}: ${a.rawType}`,
      }));
    default:
      return [];
  }
}
export function wrapLines(value: string, width: number): string[] {
  const result: string[] = [];
  const n = Math.max(12, width);
  for (const line of text(value, 1000000).split("\n")) {
    if (!line) {
      result.push("");
      continue;
    }
    let rest = line;
    while (rest.length > n) {
      let cut = rest.lastIndexOf(" ", n);
      if (cut < n / 3) cut = n;
      result.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    result.push(rest);
  }
  return result;
}
export function viewportRows<T>(
  rows: T[],
  selected: number,
  height: number,
): { rows: T[]; offset: number } {
  const n = Math.max(1, height),
    offset = Math.max(
      0,
      Math.min(rows.length - n, selected - Math.floor(n / 2)),
    );
  return { rows: rows.slice(offset, offset + n), offset };
}
