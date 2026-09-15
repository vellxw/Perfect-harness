import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  PlanProposalSchema,
  type AgentDefinition,
  type PlanProposal,
  type Privacy,
  type RouteBinding,
} from "../domain/model.js";
import { hash, id, now } from "../domain/util.js";
import type {
  AgentOutput,
  AgentRequest,
  AgentRuntime,
} from "../ports/agent-runtime.js";
import { backendApp, backendStart } from "./reservation-backend.js";
import {
  frontendCss,
  frontendHtml,
  frontendJs,
} from "./reservation-frontend.js";
import { reservationGoal, reservationTests } from "./reservation-tests.js";
export { reservationGoal };
export async function seedReservationSource(source: string): Promise<void> {
  await mkdir(join(source, "tests"), { recursive: true });
  await writeFile(
    join(source, "README.md"),
    `# Reservation smoke scenario\n\n${reservationGoal}\n\nThe existing tests are trusted acceptance fixtures. Do not modify them. Implement backend/app.mjs exporting createApp({database}) => {server,close}. GET /api/slots returns [{id,available}]. POST /api/reservations accepts {slot,name}, returns 201 or 409, rejects invalid input with 400. GET /api/reservations returns persisted entries. The browser form uses #name, #reserve and #status.\n`,
  );
  await writeFile(
    join(source, "tests", "reservations.test.mjs"),
    reservationTests,
  );
}
export function reservationPlan(): PlanProposal {
  return PlanProposalSchema.parse({
    summary:
      "Construir y verificar independientemente una aplicación de reservas adaptable y persistente.",
    architecture: [
      "Servidor HTTP nativo de Node y restricción de horario único en SQLite",
      "Interfaz estática adaptable que consume la API JSON",
      "Pruebas de API inmutables, interacción en navegador e inspección visual",
    ],
    risks: ["Las solicitudes concurrentes nunca deben duplicar una reserva"],
    criteria: [
      {
        id: "api",
        description:
          "La API valida datos, rechaza reservas simultáneas duplicadas y conserva las reservas después de reiniciar",
        kind: "functional",
      },
      {
        id: "responsive",
        description:
          "El formulario de reservas funciona en escritorio y móvil sin desborde horizontal",
        kind: "visual",
      },
    ],
    verification: [
      {
        id: "api-tests",
        title: "Pruebas de validación, concurrencia y persistencia",
        kind: "command",
        criteriaIds: ["api"],
        command: {
          executable: "node",
          args: ["--test", "tests/reservations.test.mjs"],
        },
      },
      {
        id: "frontend-build",
        title: "Compilación de sintaxis JavaScript de la interfaz",
        kind: "command",
        criteriaIds: ["responsive"],
        command: { executable: "node", args: ["--check", "public/app.js"] },
      },
      {
        id: "browser",
        title: "Interacción de reservas adaptable",
        kind: "browser",
        criteriaIds: ["responsive"],
        scenario: {
          server: { executable: "node", args: ["backend/start.mjs"] },
          readyPath: "/api/slots",
          viewports: [
            { width: 1280, height: 800 },
            { width: 390, height: 844 },
          ],
          actions: [
            { type: "fill", selector: "#name", value: "Test Visitor" },
            { type: "click", selector: "#reserve" },
            {
              type: "expectText",
              selector: "#status",
              value: "Reserva confirmada",
            },
          ],
        },
      },
    ],
    tasks: [
      {
        id: "foundation",
        title: "Documentar el contrato de la API",
        description:
          "Crear los metadatos del paquete y documentar el contrato compartido de la API.",
        type: "general",
        assignedAgent: "general",
        ownedFiles: ["package.json", "contract.json"],
        acceptanceCriteria: ["api"],
      },
      {
        id: "backend",
        title: "Implementar la API de reservas",
        description:
          "Implementar el servidor HTTP nativo, validación estricta, persistencia SQLite y una restricción única para la concurrencia.",
        type: "backend",
        assignedAgent: "backend",
        riskLevel: "high",
        dependencies: ["foundation"],
        ownedSurfaces: ["backend"],
        relevantFiles: ["contract.json", "tests/reservations.test.mjs"],
        acceptanceCriteria: ["api"],
      },
      {
        id: "frontend",
        title: "Implementar la interfaz de reservas adaptable",
        description:
          "Implementar un formulario accesible y adaptable en public/ que use la API compartida, con estados claros de carga, error y confirmación.",
        type: "frontend",
        assignedAgent: "frontend",
        dependencies: ["foundation"],
        ownedSurfaces: ["public"],
        relevantFiles: ["contract.json"],
        acceptanceCriteria: ["responsive"],
      },
    ],
  });
}

/** Only selected by the explicitly labelled --mock smoke scenario. No real-model claim. */
export class ReservationDemoRuntime implements AgentRuntime {
  readonly roles: string[] = [];
  private frontendRuns = 0;
  private active = 0;
  maximumParallelWriters = 0;
  async resolve(
    def: AgentDefinition,
    _privacy: Privacy,
    _consent: boolean,
    signal: AbortSignal,
  ): Promise<RouteBinding> {
    signal.throwIfAborted();
    return {
      ...def,
      provider: "perfect-mock",
      model: `mock-${def.id}`,
      auth: "mock",
      billingMode: "mock",
      reasoning: "off",
      requestedReasoning: def.reasoning,
      selectedReasoning: "off",
      runtimeVersion: "reservation-demo-1",
      capabilityHash: hash(def.capabilities),
      endpoint: "mock://reservations",
      resolvedAt: now(),
      provenance: "mock",
    };
  }
  async run(request: AgentRequest): Promise<AgentOutput> {
    const role = request.run.agentDefinitionId;
    this.roles.push(role);
    const requestId = id("mock-request");
    await request.beforeRequest(requestId, 200, 0);
    let result: unknown;
    if (role === "planner") result = reservationPlan();
    else if (role === "oracle" || role === "visual") {
      if (request.services.writeFile)
        throw new Error("Reviewer unexpectedly received a write tool");
      if (role === "visual" && (request.images?.length ?? 0) < 2)
        throw new Error("Visual reviewer did not receive actual captures");
      result = {
        decision: "approve",
        summary:
          "La revisión simulada solo prueba la asignación de rutas; ningún modelo real emitió un juicio.",
        findings: [],
      };
    } else {
      this.active++;
      this.maximumParallelWriters = Math.max(
        this.maximumParallelWriters,
        this.active,
      );
      try {
        await delay(25, undefined, { signal: request.signal });
        const write = request.services.writeFile;
        if (!write) throw new Error("Worker has no broker");
        if (
          request.context.failures.length > 0 &&
          role === "frontend" &&
          (request.images?.length ?? 0) < 2
        )
          throw new Error(
            "Frontend repair did not receive failure screenshots",
          );
        if (role === "general") {
          await write(
            "package.json",
            JSON.stringify(
              {
                name: "reservation-smoke",
                private: true,
                type: "module",
                scripts: {
                  start: "node backend/start.mjs",
                  test: "node --test tests/reservations.test.mjs",
                },
              },
              null,
              2,
            ),
          );
          await write(
            "contract.json",
            JSON.stringify(
              {
                slots: "GET /api/slots -> [{id,available}]",
                reserve:
                  "POST /api/reservations {slot,name} -> 201 | 409 | 400",
                persistence: "GET /api/reservations",
              },
              null,
              2,
            ),
          );
        } else if (role === "backend") {
          await write("backend/app.mjs", backendApp);
          await write("backend/start.mjs", backendStart);
        } else if (role === "frontend") {
          this.frontendRuns++;
          await write("public/index.html", frontendHtml);
          await write("public/style.css", frontendCss(this.frontendRuns === 1));
          await write("public/app.js", frontendJs);
        } else throw new Error(`Unsupported scripted role: ${role}`);
        result = {
          summary: `Scripted ${role} candidate written through the real ownership broker`,
          outputs: [],
        };
      } finally {
        this.active--;
      }
    }
    request.usage({
      id: id("mock-usage"),
      goalId: request.run.goalId,
      runId: request.run.id,
      requestId,
      provider: "perfect-mock",
      accountRef: request.run.routeBinding.accountRef,
      modelRequested: request.run.routeBinding.model,
      modelSerialized: request.run.routeBinding.model,
      modelReported: request.run.routeBinding.model,
      reasoningRequested: "off",
      inputTokens: 80,
      outputTokens: 20,
      totalTokens: 100,
      latencyMs: 1,
      retryCount: 0,
      billingMode: "mock",
      completeness: "reported",
      createdAt: now(),
    });
    return {
      result: request.parseResult ? request.parseResult(result) : result,
      summary: "Prueba simulada (no es una inferencia real)",
    };
  }
}
