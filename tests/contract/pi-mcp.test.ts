import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PiRuntime } from "../../src/adapters/pi/runtime.js";
import { IntegrationRegistry } from "../../src/integrations/registry.js";
import { probeIntegration } from "../../src/integrations/agent-session.js";
import { defaultConfig } from "../../src/config/schema.js";
import { integrationRequest } from "../integrations/request.js";

test("Pi AgentSession real descubre MCP, ejecuta una herramienta stdio y conserva su observación", { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "perfect-pi-mcp-")), workspace = await realpath(root), home = join(root, "state"); await mkdir(home);
  const registry = new IntegrationRegistry(home), signal = AbortSignal.timeout(20000), requests: Record<string, unknown>[] = [], observations: unknown[] = [];
  registry.save(workspace, { id: "test", title: "MCP de contrato", kind: "mcp", roles: ["general"], enabled: true, tools: { echo: "read" }, transport: { type: "stdio", command: process.execPath, args: [resolve("tests/fixtures/mcp-server.mjs")], envRefs: {}, trustLocalProcess: true } });
  const discovered = await probeIntegration(home, workspace, "test", signal); registry.authorizeCatalog(workspace, "test", discovered.catalog!.hash);
  const sequence = [
    { name: "mcp_list", arguments: { server: "test" } },
    { name: "mcp_call", arguments: { server: "test", tool: "echo", argumentsJson: JSON.stringify({ text: "Pi y MCP integrados: ñ" }) } },
    { name: "submit_result", arguments: { json: JSON.stringify({ summary: "Contrato cumplido", outputs: [] }) } },
  ];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += String(chunk);
    requests.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (type: string, value: Record<string, unknown>) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    const response = { id: `response-${requests.length}`, object: "response", status: "in_progress", model: "contract-model", reasoning: { effort: "xhigh" } };
    emit("response.created", { response });
    const instruction = sequence[requests.length - 1];
    const item = instruction ? { type: "function_call", id: `function-${requests.length}`, call_id: `call-${requests.length}`, name: instruction.name, arguments: JSON.stringify(instruction.arguments), status: "completed" } : { type: "message", id: "message-final", role: "assistant", content: [{ type: "output_text", text: "Finalizado", annotations: [] }], status: "completed" };
    emit("response.output_item.added", { output_index: 0, item: instruction ? { ...item, arguments: "" } : { ...item, content: [] } });
    if (instruction) emit("response.function_call_arguments.delta", { item_id: item.id, output_index: 0, delta: item.arguments });
    else {
      emit("response.content_part.added", { item_id: item.id, output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
      emit("response.output_text.delta", { item_id: item.id, output_index: 0, content_index: 0, delta: "Finalizado" });
    }
    emit("response.output_item.done", { output_index: 0, item });
    emit("response.completed", { response: { ...response, status: "completed", output: [item], usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 } } }); res.end();
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    await writeFile(join(home, "models.json"), JSON.stringify({ providers: { "perfect-contract": { baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-responses", apiKey: "synthetic-test-only", models: [{ id: "contract-model", name: "Servicio sintético", reasoning: true, thinkingLevelMap: { xhigh: "xhigh", max: null }, input: ["text"], contextWindow: 32000, maxTokens: 12000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
    const runtime = new PiRuntime(home, defaultConfig(), () => ModelRuntime.create({ authPath: join(home, "auth.json"), modelsPath: join(home, "models.json"), allowModelNetwork: false }));
    const request = integrationRequest(home, workspace, "general", "private", signal);
    request.run.routeBinding = await runtime.resolve({ id: "general", provider: "perfect-contract", model: "contract-model", accountRef: "test", reasoning: "xhigh", readOnly: false, capabilities: ["text", "tools"], auth: "mock", billingMode: "mock" }, "private", false, signal);
    request.observeIntegration = async value => { observations.push(value); };
    const result = await runtime.run(request);
    assert.equal((result.result as { summary: string }).summary, "Contrato cumplido");
    assert.equal(requests.length, 4);
    assert.equal(observations.length, 1);
    assert.match(JSON.stringify(observations[0]), /Pi y MCP integrados: ñ/);
    assert.match(JSON.stringify(requests[2]), /Pi y MCP integrados: ñ/);
    assert.ok(registry.operations(workspace).some(o => o.tool === "echo" && o.state === "completed"));
  } finally { registry.close(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); }
});
