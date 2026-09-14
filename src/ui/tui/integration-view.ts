import type { IntegrationAction } from "../../integrations/actions.js";
import { IntegrationSchema } from "../../integrations/types.js";
import type { UiAction, UiSnapshot } from "../../presentation/protocol.js";
import type { Row } from "./views.js";

export interface IntegrationIntent {
  title?: string;
  body?: string;
  phrase?: string;
  action?: UiAction;
  notice?: string;
  composer?: string;
}
const dispatch = (action: IntegrationAction): UiAction => ({
  type: "integration",
  action,
});
export const INTEGRATION_HELP =
  "INTEGRACIONES\n\n/github propietario/repositorio\n  Conectar el servidor MCP oficial en modo lectura.\n/github propietario/repositorio escritura\n  Permitir propuestas de escritura bajo perfect/, cada una confirmada.\n/navegador\n  Habilitar navegación interactiva de la aplicación aislada de esta carpeta.\n/escritorio\n  Enumerar ventanas locales para autorizar una aplicación.\n/detener-escritorio\n  Revocar inmediatamente el control. Ctrl+Alt+F10 es la parada global mientras está activo.\n/mcp-importar ruta.json\n  Importar un servidor MCP stdio/HTTP con permisos explícitos.\n/clave github\n  Guardar la credencial mediante entrada enmascarada.\n\nEn /integraciones elegí Probar conexión, revisá el catálogo exacto y luego autorizalo. Las escrituras aparecen como permisos pendientes con los argumentos completos. Un resultado incierto nunca se repite automáticamente.\n\nUn servidor MCP local es un programa que autorizás: limpiar su entorno no lo convierte en un sandbox. No conectes ejecutables no confiables. No se heredan tokens de otras cuentas. GitHub comienza limitado al repositorio indicado. El escritorio excluye terminales, herramientas administrativas y procesos elevados. No se comparte con Muse Contributor. El navegador integrado no usa tu perfil personal ni navega por Internet.";

export function integrationRows(s: UiSnapshot): Row[] {
  const panel = s.integrations ?? { connections: [], pending: [], windows: [] };
  const rows: Row[] = [];
  for (const op of panel.pending)
    rows.push({
      id: `permission:${op.id}`,
      title: `${op.state === "unknown" ? "Resultado incierto" : "Permiso pendiente"} · ${op.serverId}/${op.tool}`,
      status: op.state === "unknown" ? "failed" : "blocked",
      detail: `${op.role} · ${op.runId} · ${op.effect}`,
      body: `OPERACIÓN ${op.id}\n\n${op.arguments}\n\nHuella ${op.digest}\nVence ${op.expiresAt}\n\nUna aprobación solo autoriza esta operación exacta. Si el resultado es incierto, revisá el servicio antes de decidir; no se repetirá automáticamente.`,
    });
  for (const c of panel.connections) {
    rows.push({
      id: `connection:${c.id}`,
      title: c.title,
      status: !c.enabled
        ? "idle"
        : c.authorized || c.kind === "browser" || c.kind === "desktop"
          ? "completed"
          : "blocked",
      detail: `${c.kind} · ${c.status} · ${c.roles.join(", ")}`,
      body: JSON.stringify(c, null, 2),
    });
    if (c.kind === "mcp" || c.kind === "github") {
      rows.push({
        id: `probe:${c.id}`,
        title: `Probar conexión y revisar · ${c.id}`,
        status: "idle",
        detail:
          "Lee el catálogo real; no envía inferencias ni ejecuta herramientas",
        body: "Se ejecutará el transporte configurado y se consultará su catálogo.",
      });
      rows.push({
        id: `key:${c.id}`,
        title: `Credencial local · ${c.id}`,
        status: "idle",
        detail: "Entrada enmascarada; nunca se guarda en el repositorio",
        body: "El valor solo viaja al almacén local mediante IPC privado.",
      });
      if (c.catalogHash && !c.authorized)
        rows.push({
          id: `authorize:${c.id}`,
          title: `Autorizar catálogo revisado · ${c.id}`,
          status: "blocked",
          detail: `${c.tools} herramientas anunciadas · ${c.catalogHash.slice(0, 12)}`,
          body: "Autorizar no amplía los permisos por herramienta ni permite omitir las confirmaciones.",
        });
    }
    if (c.enabled)
      rows.push({
        id: `disable:${c.id}`,
        title: `Desactivar · ${c.id}`,
        status: "idle",
        detail: "Revoca la conexión y sus aprobaciones pendientes",
        body: "Las llamadas activas reciben la revocación; resultados externos inciertos se conservan.",
      });
  }
  for (const w of panel.windows)
    rows.push({
      id: `window:${w.handle}`,
      title: w.title,
      status: "idle",
      detail: `Ventana ${w.handle} · proceso ${w.pid}`,
      body: `${w.executable}\n\nNo se autoriza todo el escritorio. Solo esta ventana, durante diez minutos y con un máximo de cincuenta interacciones confirmadas.\n\nCtrl+Alt+F10 detiene el control.`,
    });
  rows.push(
    {
      id: "setup:github",
      title: "Conectar GitHub oficial",
      status: "idle",
      detail: "Indicá el repositorio; comienza en solo lectura",
      body: INTEGRATION_HELP,
    },
    {
      id: "setup:browser",
      title: "Habilitar navegador interactivo",
      status: "idle",
      detail: "Aplicación de prueba aislada · sin perfil personal",
      body: INTEGRATION_HELP,
    },
    {
      id: "setup:desktop",
      title: "Elegir ventana de Windows",
      status: "idle",
      detail: "Permiso temporal por ventana · nunca como administrador",
      body: INTEGRATION_HELP,
    },
    {
      id: "stop:desktop",
      title: "Detener control de Windows",
      status: "idle",
      detail: "Revocación inmediata de los permisos de esta carpeta",
      body: "No borra archivos ni puntos de recuperación.",
    },
    {
      id: "help:integrations",
      title: "Ayuda de conexiones MCP",
      status: "idle",
      detail: "Configuración, permisos, claves y recuperación",
      body: INTEGRATION_HELP,
    },
  );
  return rows;
}
export function integrationCommand(
  name: string,
  rest: string,
  s: UiSnapshot,
): IntegrationIntent | undefined {
  if (["github"].includes(name)) {
    const [repository, mode, extra] = rest.trim().split(/\s+/);
    if (!repository)
      return {
        composer: "/github ",
        notice:
          "Escribí propietario/repositorio. No se solicita ninguna clave en este campo.",
      };
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      extra ||
      (mode && mode !== "escritura")
    )
      return { notice: "Uso: /github propietario/repositorio [escritura]" };
    const config = IntegrationSchema.parse({
      id: "github",
      title: "GitHub oficial",
      kind: "github",
      roles: ["planner", "general", "backend", "integrator", "oracle"],
      repositories: [repository],
      enabled: true,
      writeMode: mode ? "confirm" : "deny",
      dataClass: "private",
    });
    return {
      title: "Conectar GitHub oficial",
      phrase: "CONFIAR",
      body: `Repositorio autorizado: ${repository}\n\n${mode ? "Las escrituras requieren aprobación individual y solo se publican en ramas perfect/. No se permite fusionar, desplegar ni borrar." : "Solo lectura. Las escrituras están bloqueadas."}\n\nDespués, ingresá la credencial en el panel enmascarado y revisá el catálogo real. Los datos se consideran privados; no se envían a Contributor.\n\nCarpeta: ${s.workspace}`,
      action: dispatch({
        command: "configure",
        config,
        confirmation: "CONFIAR",
      }),
    };
  }
  if (name === "browser" || name === "navegador") {
    const config = IntegrationSchema.parse({
      id: "navegador",
      title: "Navegador interactivo",
      kind: "browser",
      roles: ["frontend", "backend", "general"],
      enabled: true,
    });
    return {
      title: "Habilitar navegador aislado",
      phrase: "CONFIAR",
      body: "Los agentes podrán iniciar y explorar la aplicación de esta tarea en contenedores separados: navegar, completar formularios, pulsar controles y capturar imágenes. No se usa tu perfil personal, no se permite Internet ni se importan escrituras del navegador. Las capturas son observaciones, no pruebas aprobadas por sí mismas.",
      action: dispatch({
        command: "configure",
        config,
        confirmation: "CONFIAR",
      }),
    };
  }
  if (name === "desktop" || name === "escritorio")
    return { action: dispatch({ command: "windows" }) };
  if (name === "detener-escritorio")
    return { action: dispatch({ command: "stop-desktop" }) };
  if (name === "mcp-importar") {
    if (!rest.trim())
      return {
        composer: "/mcp-importar ",
        notice:
          "Indicá un archivo JSON sin secretos, con transportes y herramientas permitidas explícitos.",
      };
    return {
      title: "Importar conexión local",
      phrase: "CONFIAR",
      body: `Archivo: ${rest}\n\nUn servidor stdio es un ejecutable local con tus permisos. Perfect no instala ni autoriza automáticamente paquetes desconocidos. Revisá ese archivo y su ejecutable antes de confiar. No pongas tokens en el JSON.`,
      action: dispatch({
        command: "import",
        path: rest.replace(/^"(.*)"$/, "$1"),
        confirmation: "CONFIAR",
      }),
    };
  }
  if (name === "clave")
    return /^[a-z][a-z0-9_-]{0,47}$/.test(rest.trim())
      ? { action: dispatch({ command: "login", id: rest.trim() }) }
      : {
          notice:
            "Uso: /clave identificador. La clave se pedirá después, en un campo enmascarado.",
        };
  return undefined;
}
export function integrationRowIntent(
  id: string,
  s: UiSnapshot,
): IntegrationIntent | undefined {
  const [kind, value] = id.split(":", 2);
  if (!kind || !value) return undefined;
  if (kind === "setup")
    return value === "github"
      ? { composer: "/github ", notice: "Indicá propietario/repositorio" }
      : integrationCommand(value, "", s);
  if (kind === "stop") return integrationCommand("detener-escritorio", "", s);
  if (kind === "probe")
    return { action: dispatch({ command: "probe", id: value }) };
  if (kind === "key")
    return { action: dispatch({ command: "login", id: value }) };
  if (kind === "disable")
    return { action: dispatch({ command: "disable", id: value }) };
  if (kind === "authorize") {
    const c = s.integrations?.connections.find((c) => c.id === value);
    if (!c?.catalogHash)
      return {
        notice: "Primero probá la conexión y revisá su catálogo completo.",
      };
    return {
      title: `Autorizar catálogo · ${c.title}`,
      phrase: "CONECTAR",
      body: `Autorizás el catálogo que acabás de revisar mediante Probar conexión.\n\nHuella exacta: ${c.catalogHash}\nHerramientas anunciadas: ${c.tools}\nAgentes: ${c.roles.join(", ")}\n\nLa lista configurada sigue limitando las herramientas expuestas. Cambiar el catálogo exige una autorización nueva. No autoriza escrituras sin confirmar.`,
      action: dispatch({
        command: "authorize",
        id: value,
        hash: c.catalogHash,
        confirmation: "CONECTAR",
      }),
    };
  }
  if (kind === "window") {
    const w = s.integrations?.windows.find((w) => w.handle === value);
    if (!w) return { notice: "Volvé a enumerar las ventanas." };
    return {
      title: "Autorizar una ventana de Windows",
      phrase: "CONTROLAR",
      body: `${w.title}\n${w.executable}\nVentana ${w.handle} · proceso ${w.pid}\n\nSe pueden leer los controles y capturar esta ventana. Cada escritura o clic requiere aprobación. No se controla todo el escritorio ni se usan privilegios elevados. Evitá ventanas con datos sensibles.\n\nDuración: 10 minutos · máximo: 50 acciones\nParada: Ctrl+Alt+F10 mientras está activo, o /detener-escritorio.\n\nSolo objetivos privados; nunca Muse Contributor.`,
      action: dispatch({
        command: "window",
        handle: w.handle,
        hash: w.hash,
        minutes: 10,
        confirmation: "CONTROLAR",
      }),
    };
  }
  if (kind === "permission") {
    const op = s.integrations?.pending.find((p) => p.id === value);
    if (!op || op.state === "unknown") return undefined;
    return {
      title: `Autorizar ${op.serverId}/${op.tool}`,
      phrase: "AUTORIZAR",
      body: `Agente: ${op.role}\nEjecución: ${op.runId}\nVencimiento: ${op.expiresAt}\n\nARGUMENTOS COMPLETOS\n${op.arguments}\n\nHuella: ${op.digest}\n\nSolo esta llamada. Esc no autoriza nada. Rechazá solicitudes que no correspondan al objetivo.`,
      action: dispatch({
        command: "approve",
        id: op.id,
        digest: op.digest,
        confirmation: "AUTORIZAR",
      }),
    };
  }
  return undefined;
}
