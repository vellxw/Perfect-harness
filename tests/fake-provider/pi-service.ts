import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PiRuntime } from "../../src/adapters/pi/runtime.js";
import type { PerfectConfig } from "../../src/config/schema.js";
import type {
  AgentRequest,
  AgentRuntime,
} from "../../src/ports/agent-runtime.js";
import type { RouteBinding } from "../../src/domain/model.js";
export type FixtureAction =
  | { tool: string; args: Record<string, unknown> }
  | { result: unknown }
  | undefined;
/** This is only the transport fixture. Pi sessions, tools, store and verification are real. */
export async function piFixture(
  home: string,
  config: PerfectConfig,
  handler: (
    request: AgentRequest,
    step: number,
    payload: Record<string, unknown>,
  ) => FixtureAction | Promise<FixtureAction>,
) {
  let current: AgentRequest | undefined,
    step = 0;
  const requests: { runId: string; payload: Record<string, unknown> }[] = [],
    contexts: AgentRequest[] = [];
  for (const def of Object.values(config.agents))
    Object.assign(def, {
      provider: "perfect-fixture",
      model: "fixture-model",
      reasoning: "off",
      auth: "mock",
      billingMode: "mock",
      accountRef: "fixture-account",
    });
  config.parallelism.perAccount["fixture-account"] = 1;
  const server = createServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += String(chunk);
      const body = JSON.parse(raw);
      if (!current) throw Error("No active fixture run");
      requests.push({ runId: current.run.id, payload: body });
      const action = await handler(current, step++, body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const emit = (type: string, fields: Record<string, unknown>) =>
        res.write(
          `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`,
        );
      const response = {
        id: "fixture-response-" + requests.length,
        object: "response",
        status: "in_progress",
        model: "fixture-model",
      };
      emit("response.created", { response });
      const item = action
        ? {
            type: "function_call",
            id: "fc-" + requests.length,
            call_id: "call-" + requests.length,
            name: "tool" in action ? action.tool : "submit_result",
            arguments: JSON.stringify(
              "tool" in action
                ? action.args
                : { json: JSON.stringify(action.result) },
            ),
            status: "completed",
          }
        : {
            type: "message",
            id: "msg-" + requests.length,
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "Resultado del fixture",
                annotations: [],
              },
            ],
            status: "completed",
          };
      emit("response.output_item.added", {
        output_index: 0,
        item: action ? { ...item, arguments: "" } : { ...item, content: [] },
      });
      if (action)
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
          delta: "Resultado del fixture",
        });
      }
      emit("response.output_item.done", { output_index: 0, item });
      emit("response.completed", {
        response: {
          ...response,
          status: "completed",
          output: [item],
          usage: {
            input_tokens: 20,
            output_tokens: 8,
            total_tokens: 28,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        },
      });
      res.end();
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Fixture address");
  await writeFile(
    join(home, "models.json"),
    JSON.stringify({
      providers: {
        "perfect-fixture": {
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          api: "openai-responses",
          apiKey: "synthetic-only",
          models: [
            {
              id: "fixture-model",
              name: "Synthetic service",
              reasoning: false,
              input: ["text", "image"],
              contextWindow: 64000,
              maxTokens: 12000,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    }),
  );
  const real = new PiRuntime(home, config, () =>
    ModelRuntime.create({
      authPath: join(home, "auth.json"),
      modelsPath: join(home, "models.json"),
      allowModelNetwork: false,
    }),
  );
  const runtime: AgentRuntime = {
    resolve: async (...args) =>
      ({
        ...(await real.resolve(...args)),
        provenance: "mock",
      }) as RouteBinding,
    run: async (request) => {
      if (current) throw Error("Fixture supports one run at a time");
      current = request;
      step = 0;
      contexts.push(request);
      try {
        return await real.run(request);
      } finally {
        current = undefined;
      }
    },
  };
  return {
    runtime,
    contexts,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
