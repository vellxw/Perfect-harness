import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PiRuntime } from "../../src/adapters/pi/runtime.js";
import { defaultConfig } from "../../src/config/schema.js";
import type {
  AgentDefinition,
  AgentRun,
  Usage,
  ContextPackage,
} from "../../src/domain/model.js";

type Variant = "match" | "model-mismatch" | "reasoning-mismatch" | "missing";
for (const variant of [
  "match",
  "model-mismatch",
  "reasoning-mismatch",
  "missing",
] as Variant[]) {
  test(`actual Pi Responses API: ${variant} audit, tools and usage`, async () => {
    const home = await mkdtemp(join(tmpdir(), "perfect-responses-"));
    const requests: Record<string, unknown>[] = [],
      usage: Usage[] = [];
    let mutationCount = 0;
    const server = createServer(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += String(chunk);
      const body = JSON.parse(text) as Record<string, unknown>;
      requests.push(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const emit = (type: string, fields: Record<string, unknown>) =>
        res.write(
          `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`,
        );
      const metadata =
        variant === "missing"
          ? {}
          : {
              model:
                variant === "model-mismatch" ? "wrong-model" : "contract-model",
              reasoning: {
                effort: variant === "reasoning-mismatch" ? "high" : "xhigh",
              },
            };
      const response = {
        id: `resp-${requests.length}`,
        object: "response",
        status: "in_progress",
        ...metadata,
      };
      emit("response.created", { response });
      const first = requests.length === 1;
      const item = first
        ? {
            type: "function_call",
            id: "fc_submit",
            call_id: "call_submit",
            name: "submit_result",
            arguments: JSON.stringify({
              json: JSON.stringify({
                summary: "verified contract result",
                outputs: [],
              }),
            }),
            status: "completed",
          }
        : {
            type: "message",
            id: "msg-final",
            role: "assistant",
            content: [
              { type: "output_text", text: "finished", annotations: [] },
            ],
            status: "completed",
          };
      emit("response.output_item.added", {
        output_index: 0,
        item: first ? { ...item, arguments: "" } : { ...item, content: [] },
      });
      if (first)
        emit("response.function_call_arguments.delta", {
          item_id: item.id,
          output_index: 0,
          delta: item.arguments,
        });
      else {
        emit("response.content_part.added", {
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        });
        emit("response.output_text.delta", {
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          delta: "finished",
        });
      }
      emit("response.output_item.done", { output_index: 0, item });
      emit("response.completed", {
        response: {
          ...response,
          status: "completed",
          output: [item],
          ...(variant === "missing"
            ? {}
            : {
                usage: {
                  input_tokens: 20,
                  output_tokens: 8,
                  total_tokens: 28,
                  input_tokens_details: { cached_tokens: 4 },
                  output_tokens_details: { reasoning_tokens: 3 },
                },
              }),
        },
      });
      res.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await writeFile(
      join(home, "models.json"),
      JSON.stringify({
        providers: {
          "perfect-contract": {
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
            api: "openai-responses",
            apiKey: "test-only-not-a-secret",
            models: [
              {
                id: "contract-model",
                name: "Contract fake service",
                reasoning: true,
                thinkingLevelMap: { high: "high", xhigh: "xhigh", max: null },
                input: ["text"],
                contextWindow: 32000,
                maxTokens: 12000,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              },
            ],
          },
        },
      }),
    );
    const def: AgentDefinition = {
      id: "general",
      provider: "perfect-contract",
      model: "contract-model",
      reasoning: "xhigh",
      auth: "mock",
      billingMode: "mock",
      accountRef: "contract",
      readOnly: false,
      capabilities: ["text", "tools"],
    };
    const runtime = new PiRuntime(home, defaultConfig(), () =>
      ModelRuntime.create({
        authPath: join(home, "auth.json"),
        modelsPath: join(home, "models.json"),
        allowModelNetwork: false,
      }),
    );
    const signal = AbortSignal.timeout(10000);
    try {
      const route = await runtime.resolve(def, "public", false, signal);
      const run: AgentRun = {
        id: "contract-run",
        goalId: "contract-goal",
        agentDefinitionId: "general",
        attempt: 1,
        status: "running",
        routeBinding: route,
        contextPackageId: "context",
        inputRevision: "base",
        requestIds: [],
        usageIds: [],
        startedAt: new Date().toISOString(),
      };
      const promise = runtime.run({
        run,
        context: {} as ContextPackage,
        cwd: home,
        controlDir: join(home, "control"),
        signal,
        services: {
          listFiles: async () => [],
          readFile: async (path) => ({ path, content: "", hash: "" }),
          writeFile: async () => {
            mutationCount++;
          },
        },
        instruction: "Call submit_result.",
        resultSchema: { type: "object" },
        beforeRequest: () => {},
        usage: (u) => usage.push(u),
        event: () => {},
      });
      if (variant.includes("mismatch")) {
        await assert.rejects(promise, /AUDIT_FAILURE/);
        assert.equal(mutationCount, 0);
      } else {
        const result = await promise;
        assert.ok(result.result);
        assert.equal(requests.length, 2);
        assert.ok(
          requests.every(
            (r) =>
              r.model === "contract-model" &&
              (r.reasoning as { effort: string }).effort === "xhigh",
          ),
        );
        assert.ok(usage.length >= 2);
        const u = usage[0]!;
        assert.equal(
          u.modelReported,
          variant === "match" ? "contract-model" : undefined,
        );
        assert.equal(
          u.reasoningReported,
          variant === "match" ? "xhigh" : undefined,
        );
        assert.equal(
          u.completeness,
          variant === "match" ? "reported" : "unknown",
        );
        assert.equal(u.totalTokens, variant === "match" ? 28 : undefined);
        assert.equal(u.reasoningTokens, variant === "match" ? 3 : undefined);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await rm(home, { recursive: true, force: true });
    }
  });
}
