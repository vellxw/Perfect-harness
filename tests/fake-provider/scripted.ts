import type {
  AgentDefinition,
  Privacy,
  RouteBinding,
} from "../../src/domain/model.js";
import type {
  AgentRuntime,
  AgentRequest,
  AgentOutput,
} from "../../src/ports/agent-runtime.js";
import { id, now, hash } from "../../src/domain/util.js";

/** A visibly simulated provider. Never claims to be Grok, Muse or Astra. */
export class ScriptedRuntime implements AgentRuntime {
  readonly invocations: AgentRequest[] = [];
  constructor(private handler: (request: AgentRequest) => Promise<unknown>) {}
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
      runtimeVersion: "scripted-test-1",
      capabilityHash: hash(def.capabilities),
      endpoint: "mock://local",
      resolvedAt: now(),
      provenance: "mock",
    };
  }
  async run(request: AgentRequest): Promise<AgentOutput> {
    request.signal.throwIfAborted();
    this.invocations.push(request);
    const requestId = id("mock-request");
    await request.beforeRequest(requestId, 100, 0);
    const result = await this.handler(request);
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
      inputTokens: 40,
      outputTokens: 10,
      totalTokens: 50,
      latencyMs: 1,
      retryCount: 0,
      billingMode: "mock",
      completeness: "reported",
      createdAt: now(),
    });
    return {
      result: request.parseResult ? request.parseResult(result) : result,
      summary: "Scripted provider result (not a real inference)",
    };
  }
}
