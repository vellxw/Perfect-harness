import type { UiClient } from "../../presentation/client.js";
import { emptySnapshot } from "../../presentation/client.js";
import type {
  UiAction,
  UiMessage,
  UiSnapshot,
} from "../../presentation/protocol.js";
export function demoSnapshot(scene = "running"): UiSnapshot {
  const s = emptySnapshot("C:/Projects/ShopFront");
  Object.assign(s, {
    connected: true,
    demo: true,
    workspaceName: "ShopFront",
    sequence: 23,
  });
  s.preferences.ui.onboarded = true;
  s.preferences.ui.motion = "off";
  if (scene === "idle") return s;
  s.goal = {
    id: "demo-checkout",
    request: "Construí la pantalla de pago y verificala visualmente",
    state:
      scene === "done"
        ? "DONE"
        : scene === "paused"
          ? "PAUSED"
          : scene === "failed"
            ? "FAILED"
            : scene === "planning"
              ? "PLAN"
              : scene === "repair"
                ? "REPAIR"
                : "EXECUTE",
    mode: "mock",
    iteration: scene === "planning" ? 1 : 4,
    maxIterations: 10,
    revision: "f14a86d20fbb54e22f170a80cb10a744ae206c15",
    privacy: "public",
    activeMs: 143000,
    reason:
      scene === "paused"
        ? "Docker no está disponible. Tu trabajo está guardado; iniciá Docker y reanudá."
        : scene === "failed"
          ? "Fallo de contrato repetido. Revisá la evidencia antes de iniciar una continuación."
          : scene === "done"
            ? "Todos los criterios obligatorios están respaldados por evidencia actual."
            : undefined,
  };
  s.agents = [
    {
      id: "demo-planner",
      role: "planner",
      model: "grok-4.6",
      provider: "xai",
      account: "xai-subscription",
      status: scene === "planning" ? "running" : "completed",
      requested: "xhigh",
      selected: "xhigh",
      sent: "xhigh",
      requests: 2,
      provenance: "mock",
    },
    {
      id: "demo-muse",
      role: "frontend",
      model: "muse-spark-1.3-contributor-free",
      provider: "opencode",
      account: "opencode-contributor",
      status:
        scene === "done"
          ? "completed"
          : scene === "paused"
            ? "interrupted"
            : "running",
      requested: "xhigh",
      selected: "xhigh",
      sent: "xhigh",
      task: "frontend-checkout",
      requests: 5,
      provenance: "mock",
    },
    {
      id: "demo-astra",
      role: "backend",
      model: "gpt-6-astra",
      provider: "openai-codex",
      account: "chatgpt-pro",
      status: scene === "concurrent" ? "running" : "completed",
      requested: "high",
      selected: "high",
      sent: "high",
      task: "backend-api",
      requests: 4,
      provenance: "mock",
    },
    {
      id: "demo-worker",
      role: "general",
      model: "grok-4.6",
      provider: "xai",
      account: "xai-subscription",
      status: scene === "concurrent" ? "running" : "completed",
      requested: "medium",
      selected: "medium",
      sent: "medium",
      requests: 3,
      provenance: "mock",
    },
    {
      id: "demo-oracle",
      role: "oracle",
      model: "gpt-6-astra",
      provider: "openai-codex",
      account: "chatgpt-pro",
      status: scene === "done" ? "completed" : "idle",
      requested: "xhigh",
      selected: "xhigh",
      requests: scene === "done" ? 1 : 0,
      provenance: "mock",
    },
  ];
  const events: [string, string, string, string][] = [
    [
      "planner",
      "Plan de implementación listo",
      "8 tareas · 3 grupos paralelos · contrato de aceptación aprobado",
      "completed",
    ],
    [
      "general",
      "Contratos de API documentados",
      "Los contratos compartidos están listos para ambos especialistas",
      "completed",
    ],
    [
      "backend",
      "Implementación del servidor completada",
      "42 pruebas aprobadas · idempotencia de webhooks cubierta",
      "completed",
    ],
    [
      "frontend",
      "Construyendo una pantalla de pago adaptable",
      "src/app/checkout.tsx · copia de trabajo aislada",
      "running",
    ],
    [
      "visual",
      "Desborde detectado en móvil",
      "390 × 844 · captura adjunta a la reparación",
      "failed",
    ],
    [
      "frontend",
      "Reparando el diseño adaptable",
      "La versión actual sigue sin verificar hasta aprobar las comprobaciones",
      "running",
    ],
  ];
  if (scene === "done")
    events.push(
      [
        "controller",
        "Nueva verificación aprobada",
        "Compilación · API · navegador · revisión visual",
        "completed",
      ],
      [
        "oracle",
        "Revisión independiente aprobada",
        "Sin hallazgos bloqueantes en la versión final",
        "completed",
      ],
      [
        "controller",
        "Evaluador de evidencia: COMPLETADO",
        "Versión verificada lista para inspeccionar y aplicar",
        "completed",
      ],
    );
  s.activity = events.map((e, i) => ({
    id: `demo-event-${i}`,
    sequence: i + 1,
    time: `2026-09-14T10:${String(14 + i).padStart(2, "0")}:00Z`,
    role: e[0],
    title: e[1],
    detail: e[2],
    status: e[3] as "running" | "completed" | "failed",
    rawType: "demo.fixture",
  }));
  if (scene === "planning") s.activity = s.activity.slice(0, 1);
  s.plan = {
    id: "demo-plan",
    hash: "demo-hash",
    version: 2,
    summary:
      "Pantalla de pago con contratos previos, implementación paralela y verificación independiente.",
    architecture: [
      "Contrato compartido antes de implementar la interfaz y el servidor",
      "Pagos idempotentes con pruebas aisladas",
      "Interfaz adaptable verificada en escritorio y móvil",
    ],
    risks: [
      "Las credenciales de pago nunca ingresan en los datos de prueba",
      "El contenido de Contributor debe ser público",
    ],
    criteria: [
      {
        id: "responsive",
        description:
          "La pantalla de pago funciona sin desborde a 390 y 1280 píxeles.",
        kind: "visual",
      },
      {
        id: "api",
        description: "La API rechaza eventos de pago duplicados.",
        kind: "functional",
      },
    ],
    approved: true,
  };
  s.tasks = [
    {
      id: "discover",
      title: "Explorar el proyecto original",
      status: "accepted",
      role: "general",
      dependencies: [],
      attempt: 1,
      maxAttempts: 3,
      description: "Inspeccionar el proyecto y las comprobaciones iniciales",
      surfaces: [],
    },
    {
      id: "contracts",
      title: "Definir los contratos de la API",
      status: "accepted",
      role: "general",
      dependencies: ["discover"],
      attempt: 1,
      maxAttempts: 3,
      description: "Definir contratos estables antes de trabajar en paralelo",
      surfaces: ["src/contracts"],
    },
    {
      id: "backend-api",
      title: "Implementar el servicio de pagos",
      status: "accepted",
      role: "backend",
      dependencies: ["contracts"],
      attempt: 1,
      maxAttempts: 3,
      description: "API de pagos idempotente y pruebas",
      surfaces: ["src/api"],
    },
    {
      id: "frontend-checkout",
      title: "Construir la pantalla de pago adaptable",
      status: scene === "done" ? "accepted" : "running",
      role: "frontend",
      dependencies: ["contracts"],
      attempt: 2,
      maxAttempts: 3,
      description: "Reparar el desborde móvil utilizando las capturas",
      surfaces: ["src/app/checkout.tsx"],
    },
    {
      id: "integrate",
      title: "Integrar la versión candidata",
      status: scene === "done" ? "accepted" : "pending",
      role: "integrator",
      dependencies: ["backend-api", "frontend-checkout"],
      attempt: 1,
      maxAttempts: 3,
      description:
        "Integrar resultados compatibles y repetir las comprobaciones obligatorias",
      surfaces: [],
    },
  ];
  s.checks = [
    "Compilación",
    "TypeScript",
    "Integración de API",
    "Navegador de escritorio",
    "Aspecto en móvil",
  ].map((title, i) => ({
    id: `check-${i}`,
    title,
    kind: i > 2 ? "browser" : "command",
    status: i === 4 && scene !== "done" ? "failed" : "passed",
    summary:
      i === 4 && scene !== "done"
        ? "Desborde horizontal: ventana de 390, contenido de 1200 píxeles"
        : "Todas las comprobaciones de esta demostración están aprobadas",
    evidenceIds: ["demo-evidence"],
    revision: s.goal!.revision,
  }));
  s.verification = { passed: scene === "done" ? 5 : 4, total: 5 };
  s.artifacts = [
    {
      id: "demo-evidence",
      name: "checkout-mobile-390x844.png",
      kind: "screenshot",
      revision: s.goal.revision,
      current: true,
      hash: "datos sintéticos; no hay una captura real vinculada",
    },
  ];
  s.accounts = [
    { account: "xai-subscription", tokens: 18450, uncertain: 1 },
    { account: "chatgpt-pro", tokens: 27400, uncertain: 0 },
    { account: "opencode-contributor", tokens: 31200, uncertain: 1 },
  ];
  s.diagnostics = [
    {
      name: "Node 26.4.0",
      status: "PASS",
      detail: "Fila de diagnóstico sintética, no es una medición del equipo",
    },
    { name: "Pi 0.85.1", status: "PASS", detail: "Datos sintéticos" },
    {
      name: "Docker",
      status: "BLOCKED",
      detail: "Demostración en pausa; sin ejecución alternativa en el equipo",
    },
    {
      name: "Prueba de proveedores reales",
      status: "NOT_TESTED",
      detail: "La demostración no usa credenciales personales",
    },
  ];
  s.recentGoals = [
    { id: s.goal.id, request: s.goal.request, state: s.goal.state },
  ];
  return s;
}
export class DemoClient implements UiClient {
  private state: UiSnapshot;
  private listeners = new Set<() => void>();
  private messages = new Set<(m: UiMessage) => void>();
  constructor(scene = "running") {
    this.state = demoSnapshot(scene);
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  onMessage = (listener: (m: UiMessage) => void) => {
    this.messages.add(listener);
    return () => {
      this.messages.delete(listener);
    };
  };
  dispatch = (action: UiAction) => {
    if (action.type === "preferences") {
      this.state = { ...this.state, preferences: action.preferences };
      for (const l of this.listeners) l();
      return;
    }
    for (const l of this.messages)
      l({
        type: "result",
        requestId: "demo",
        ok: false,
        message:
          "Solo es una demostración visual. Abrí Perfect sin --demo para realizar acciones reales.",
      });
  };
  close = async () => {};
  replace(snapshot: UiSnapshot) {
    this.state = snapshot;
    for (const l of this.listeners) l();
  }
}
