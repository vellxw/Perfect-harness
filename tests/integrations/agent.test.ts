import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { defaultConfig } from "../../src/config/schema.js";
import {
  AgentIntegrations,
  probeIntegration,
} from "../../src/integrations/agent-session.js";
import { integrationTools } from "../../src/integrations/pi-tools.js";
import { IntegrationRegistry } from "../../src/integrations/registry.js";
import { integrationRequest } from "./request.js";

test("agente usa MCP real, espera aprobación exacta y no repite la escritura", async () => {
  const temp = await mkdtemp(join(tmpdir(), "perfect-agent-mcp-")),
    workspace = await realpath(temp),
    home = join(workspace, "state"),
    ledger = join(workspace, "ledger.txt");
  await mkdir(home);
  const registry = new IntegrationRegistry(home);
  const original = process.env.PERFECT_TEST_LEDGER;
  process.env.PERFECT_TEST_LEDGER = ledger;
  let manager: AgentIntegrations | undefined;
  try {
    registry.save(workspace, {
      id: "test",
      title: "Servidor de prueba",
      kind: "mcp",
      roles: ["general", "oracle"],
      enabled: true,
      dataClass: "private",
      tools: { echo: "read", write_once: "write", wait: "read" },
      resourcePrefixes: ["test://docs/public/"],
      transport: {
        type: "stdio",
        command: process.execPath,
        args: [resolve("tests/fixtures/mcp-server.mjs")],
        envRefs: { TEST_LEDGER: "PERFECT_TEST_LEDGER" },
        trustLocalProcess: true,
      },
    });
    const record = await probeIntegration(
      home,
      workspace,
      "test",
      new AbortController().signal,
    );
    registry.authorizeCatalog(workspace, "test", record.catalog!.hash);
    const request = integrationRequest(home, workspace),
      observations: unknown[] = [];
    request.observeIntegration = async (o) => {
      observations.push(o);
    };
    manager = await AgentIntegrations.create(home, defaultConfig(), request);
    assert.ok(manager);
    assert.match(JSON.stringify(await manager.list()), /write_once/);
    const echo = await manager.call("test", "echo", { text: "hola ñ" });
    assert.match(JSON.stringify(echo), /hola ñ/);
    const pending = manager.call("test", "write_once", {
      text: "solo una vez",
    });
    let op = registry.operations(workspace).find((o) => o.state === "pending");
    for (let n = 0; n < 100 && !op; n++) {
      await delay(20);
      op = registry.operations(workspace).find((o) => o.state === "pending");
    }
    assert.ok(op);
    await assert.rejects(readFile(ledger), { code: "ENOENT" });
    registry.decide(workspace, op.id, op.digest, true);
    assert.match(JSON.stringify(await pending), /Escritura ejecutada/);
    assert.equal(await readFile(ledger, "utf8"), "solo una vez\n");
    const replay = await manager.call("test", "write_once", {
      text: "solo una vez",
    });
    assert.equal(replay.replayed, true);
    assert.equal(await readFile(ledger, "utf8"), "solo una vez\n");
    assert.equal(observations.length, 2);
    const piTools = integrationTools(
      manager,
      () => {},
      () => {},
    );
    assert.equal(piTools.length, 4);
    const tool = piTools.find((t) => t.name === "mcp_call")!;
    const toolResult = await tool.execute(
      "synthetic-call",
      {
        server: "test",
        tool: "echo",
        argumentsJson: JSON.stringify({ text: "herramienta de Pi real" }),
      },
      undefined,
      undefined,
      undefined as never,
    );
    assert.match(JSON.stringify(toolResult), /herramienta de Pi real/);
    await manager.close();
    manager = await AgentIntegrations.create(
      home,
      defaultConfig(),
      integrationRequest(home, workspace, "oracle"),
    );
    assert.ok(manager);
    await assert.rejects(
      manager.call("test", "write_once", { text: "no permitido" }),
      /MCP_READ_ONLY/,
    );
    registry.setEnabled(workspace, "test", false);
    await assert.rejects(manager.call("test", "echo", { text: "revocado" }));
  } finally {
    await manager?.close();
    registry.close();
    if (original === undefined) delete process.env.PERFECT_TEST_LEDGER;
    else process.env.PERFECT_TEST_LEDGER = original;
    await rm(temp, { recursive: true, force: true });
  }
});
test("datos MCP privados no llegan a objetivos públicos ni a Contributor", async () => {
  const temp = await mkdtemp(join(tmpdir(), "perfect-mcp-privacy-")),
    workspace = await realpath(temp),
    home = join(workspace, "state"),
    registry = new IntegrationRegistry(home);
  let manager: AgentIntegrations | undefined;
  try {
    registry.save(workspace, {
      id: "private",
      title: "Privado",
      kind: "github",
      roles: ["general", "frontend"],
      enabled: true,
      repositories: ["vellxw/Perfect-harness"],
    });
    manager = await AgentIntegrations.create(
      home,
      defaultConfig(),
      integrationRequest(home, workspace, "general", "public"),
    );
    assert.ok(manager);
    await assert.rejects(
      manager.call("private", "get_file_contents", {
        owner: "vellxw",
        repo: "Perfect-harness",
        path: "README.md",
      }),
      /MCP_PRIVACY_REQUIRED/,
    );
    await manager.close();
    manager = undefined;
    const request = integrationRequest(home, workspace, "frontend", "public");
    request.run.routeBinding.model = "muse-spark-1.3-contributor-free";
    assert.equal(
      await AgentIntegrations.create(home, defaultConfig(), request),
      undefined,
    );
  } finally {
    await manager?.close();
    registry.close();
    await rm(temp, { recursive: true, force: true });
  }
});
