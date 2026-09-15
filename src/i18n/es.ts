/** Español de la aplicación. Los identificadores de protocolo y proveedor nunca se traducen. */
export const locale = "es-AR";
export const commandNames: Readonly<Record<string, string>> = {
  integrations: "integraciones",
  browser: "navegador",
  desktop: "escritorio",
  goal: "objetivo",
  status: "estado",
  agents: "agentes",
  plan: "plan",
  tasks: "tareas",
  verify: "verificar",
  artifacts: "archivos",
  diff: "cambios",
  routing: "modelos",
  cost: "consumo",
  logs: "registros",
  pause: "pausar",
  resume: "reanudar",
  approve: "aprobar",
  "approve-plan": "aprobar-plan",
  retry: "reintentar",
  abort: "cancelar",
  apply: "aplicar",
  reverify: "reverificar",
  doctor: "diagnostico",
  settings: "ajustes",
  projects: "proyectos",
  workspace: "carpeta",
  login: "conectar",
  contributor: "contribuir",
  "consent-contributor": "consentimiento",
  public: "publico",
  private: "privado",
  prepare: "preparar",
  help: "ayuda",
  exit: "salir",
  home: "inicio",
  init: "iniciar",
  smoke: "prueba",
  shell: "consola",
  "trust-config": "confiar-config",
  "config-schema": "esquema-config",
};
export const fold = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function commandName(name: string): string {
  return commandNames[name] ?? name;
}
export function canonicalCommand(name: string): string {
  const normalized = fold(name);
  return (
    Object.entries(commandNames).find(
      ([key, value]) => key === normalized || value === normalized,
    )?.[0] ?? name
  );
}
const states: Readonly<Record<string, string>> = {
  RECEIVED: "recibido",
  UNDERSTAND: "comprendiendo",
  DISCOVER: "explorando",
  PLAN: "planificando",
  DECOMPOSE: "desglosando",
  ASSIGN: "asignando",
  EXECUTE: "ejecutando",
  VERIFY: "verificando",
  REVIEW: "revisando",
  JUDGE: "evaluando",
  REPAIR: "reparando",
  REPLAN: "replanificando",
  PAUSED: "en pausa",
  DONE: "completado",
  FAILED: "fallido",
  ABORTED: "cancelado",
  idle: "inactivo",
  running: "en curso",
  completed: "completado",
  waiting: "en espera",
  blocked: "bloqueado",
  failed: "fallido",
  passed: "aprobado",
  pending: "pendiente",
  accepted: "aceptado",
  rejected: "rechazado",
  interrupted: "interrumpido",
  cancelled: "cancelado",
  superseded: "sustituido",
  skipped: "omitido",
  error: "error",
  info: "información",
  disconnected: "sin conexión",
  uncertain: "incierto",
  approve: "aprobado",
  request_changes: "cambios solicitados",
  PASS: "APROBADO",
  WARN: "ADVERTENCIA",
  BLOCKED: "BLOQUEADO",
  UNCONFIGURED: "SIN CONFIGURAR",
  NOT_TESTED: "NO PROBADO",
  FAIL: "FALLIDO",
  SKIP: "OMITIDO",
};
export function stateLabel(value: string): string {
  return states[value] ?? value;
}
const roleNames: Readonly<Record<string, string>> = {
  planner: "Planificador",
  frontend: "Interfaz",
  backend: "Servidor",
  oracle: "Revisor experto",
  general: "Asistente",
  integrator: "Integrador",
  visual: "Revisión visual",
  judge: "Evaluador",
  controller: "Controlador",
  user: "Usuario",
  harness: "Perfect",
  system: "Sistema",
  verifier: "Verificador",
  reviewer: "Revisor",
};
export function roleLabel(value: string): string {
  return roleNames[value] ?? value;
}
const screenNames: Readonly<Record<string, string>> = {
  integrations: "Integraciones",
  home: "Inicio",
  agents: "Agentes",
  plan: "Plan",
  tasks: "Tareas",
  verify: "Verificación",
  artifacts: "Archivos y evidencia",
  diff: "Cambios",
  routing: "Modelos y proveedores",
  cost: "Consumo",
  logs: "Registros",
  doctor: "Diagnóstico",
  settings: "Ajustes",
  projects: "Proyectos",
  login: "Conexión",
};
export function screenLabel(value: string): string {
  return screenNames[value] ?? value;
}
const values: Readonly<Record<string, string>> = {
  public: "público",
  private: "privado",
  confidential: "confidencial",
  restricted: "restringido",
  auto: "automáticas",
  full: "completas",
  reduced: "reducidas",
  off: "desactivadas",
  normal: "normal",
  high: "alto",
  transparent: "transparente",
  solid: "sólido",
  real: "real",
  mock: "simulado",
  unknown: "desconocido",
  none: "ninguno",
  command: "comando",
  build: "compilación",
  typecheck: "tipos",
  lint: "estilo de código",
  unit: "pruebas unitarias",
  integration: "integración",
  browser: "navegador",
  visual: "visual",
  screenshot: "captura",
  image: "imagen",
  video: "video",
  text: "texto",
  trace: "traza",
  report: "informe",
  frame: "fotograma",
  log: "registro",
  test: "prueba",
  api: "API",
  security: "seguridad",
  subscription: "suscripción",
  free: "gratuito",
  metered: "por consumo",
  "read-only": "solo lectura",
  valid: "válido",
  stale: "desactualizado",
  invalid: "inválido",
  inconclusive: "no concluyente",
};
export function valueLabel(value: string): string {
  return values[value] ?? stateLabel(value);
}
/** El nivel literal solicitado se conserva para que nunca parezca una variante distinta. */
export function reasoningLabel(value: string | undefined): string {
  if (value === undefined) return "no observado";
  const names: Record<string, string> = {
    off: "desactivado",
    minimal: "mínimo",
    low: "bajo",
    medium: "medio",
    high: "alto",
    xhigh: "extraalto",
    max: "máximo",
  };
  return names[value] ? `${names[value]} (${value})` : value;
}
export const numberLabel = (value: number): string =>
  new Intl.NumberFormat(locale).format(value);
export const usdLabel = (value: number): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "code",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
const optionNames: Readonly<Record<string, string>> = {
  "--carpeta": "--workspace",
  "--datos": "--home",
  "--sin-interfaz": "--no-ui",
  "--ayuda": "--help",
  "--version": "--version",
  "--publico": "--public",
  "--aceptar-plan": "--accept-plan",
  "--observar": "--watch",
  "--seguir": "--follow",
  "--si": "--yes",
  "--revocar": "--revoke",
  "--en-linea": "--online",
  "--cuenta": "--account",
  "--clave-env": "--key-env",
  "--rol": "--role",
  "--integral": "--fullstack",
  "--simulado": "--mock",
  "--permitir-contributor": "--allow-contributor",
  "--permitir-red": "--allow-network",
  "--tarea": "--task",
  "--objetivo": "--goal",
  "--pantalla": "--screen",
  "--animaciones": "--motion",
};
const valuedOptions = new Set([
  "--workspace",
  "--home",
  "--account",
  "--key-env",
  "--role",
  "--task",
  "--goal",
  "--screen",
  "--motion",
  "--demo",
]);
/** Solo normaliza sintaxis: nunca nombres de archivo, secretos, texto del objetivo ni argumentos tras --. */
export function normalizeArgs(args: readonly string[]): string[] {
  let literal = false,
    expectsValue = false,
    commandSeen = false,
    helpTarget = false;
  return args.map((arg) => {
    if (literal) return arg;
    if (expectsValue) {
      expectsValue = false;
      return arg;
    }
    if (arg === "--") {
      literal = true;
      return arg;
    }
    if (arg.startsWith("--")) {
      const at = arg.indexOf("="),
        flag = at < 0 ? arg : arg.slice(0, at);
      const canonical = optionNames[fold(flag)] ?? flag;
      expectsValue = at < 0 && valuedOptions.has(canonical);
      return canonical + (at < 0 ? "" : arg.slice(at));
    }
    if (!commandSeen && !arg.startsWith("-")) {
      commandSeen = true;
      const canonical = canonicalCommand(arg);
      helpTarget = canonical === "help";
      return canonical;
    }
    if (helpTarget) {
      helpTarget = false;
      return canonicalCommand(arg);
    }
    return arg;
  });
}
