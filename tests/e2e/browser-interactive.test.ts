import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../../src/config/schema.js";
import { IntegrationRegistry } from "../../src/integrations/registry.js";
import { AgentIntegrations } from "../../src/integrations/agent-session.js";
import { integrationRequest } from "../integrations/request.js";
import type { IntegrationResponse } from "../../src/ports/integrations.js";

test(
  "navegador MCP aislado: observar, escribir, pulsar, volver a observar y capturar sin perfiles personales",
  { skip: process.env.PERFECT_TEST_DOCKER !== "1", timeout: 180000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "perfect-browser-mcp-")),
      workspace = join(root, "workspace"),
      home = join(root, "state");
    await mkdir(workspace);
    await mkdir(home);
    const html =
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba interactiva de Perfect</title><style>body{font:20px system-ui;margin:40px;background:#0b0c10;color:white}input,button{font:inherit;padding:12px}</style></head><body><h1>Aplicación aislada</h1><input aria-label="Mensaje" id="message"><button id="apply">Aplicar</button><p id="result">Pendiente</p><script>document.getElementById("apply").onclick=()=>{document.getElementById("result").textContent="Recibido: "+document.getElementById("message").value;console.log("Interacción verificada")}</script></body></html>';
    await writeFile(
      join(workspace, "server.mjs"),
      `import http from 'node:http';http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(${JSON.stringify(html)});}).listen(Number(process.env.PORT||3000),'0.0.0.0');`,
    );
    const original = await readFile(join(workspace, "server.mjs"), "utf8");
    const source = await realpath(workspace),
      registry = new IntegrationRegistry(home);
    registry.save(source, {
      id: "navegador",
      title: "Navegador de prueba",
      kind: "browser",
      roles: ["general"],
      enabled: true,
      maxActions: 20,
    });
    const request = integrationRequest(home, source),
      observations: unknown[] = [];
    request.observeIntegration = async (value) => {
      observations.push(value);
    };
    const manager = await AgentIntegrations.create(
      home,
      defaultConfig(),
      request,
    );
    assert.ok(manager);
    const content = (result: IntegrationResponse) => {
      const block = result.content.find(
        (c) => c.type === "text" && c.text.startsWith("{"),
      );
      assert.ok(block && block.type === "text");
      return JSON.parse(block.text) as {
        snapshot: string;
        accessibility: string;
        elements: { ref: string; tag: string; label: string }[];
      };
    };
    try {
      let state = content(
        await manager.call("navegador", "browser_open", {
          server: {
            executable: "node",
            args: ["server.mjs"],
            cwd: ".",
            timeoutMs: 60000,
          },
          port: 3000,
          path: "/",
          width: 1000,
          height: 700,
        }),
      );
      assert.match(state.accessibility, /Aplicación aislada/);
      const field = state.elements.find((e) => e.tag === "input");
      assert.ok(field);
      const oldSnapshot = state.snapshot;
      state = content(
        await manager.call("navegador", "browser_fill", {
          snapshot: state.snapshot,
          ref: field.ref,
          value: "Español y ñ",
        }),
      );
      const stale = await manager.call("navegador", "browser_click", {
        snapshot: oldSnapshot,
        ref: field.ref,
      });
      assert.equal(stale.isError, true);
      assert.match(JSON.stringify(stale), /STALE_SNAPSHOT/);
      const button = state.elements.find((e) => e.tag === "button");
      assert.ok(button);
      state = content(
        await manager.call("navegador", "browser_click", {
          snapshot: state.snapshot,
          ref: button.ref,
        }),
      );
      assert.match(state.accessibility, /Recibido: Español y ñ/);
      const navigation = await manager.call("navegador", "browser_navigate", {
        path: "https://example.com/",
      });
      assert.equal(navigation.isError, true);
      assert.match(JSON.stringify(navigation), /BROWSER_ORIGIN/);
      const pixels = await manager.call("navegador", "browser_screenshot", {}),
        image = pixels.content.find((c) => c.type === "image");
      assert.ok(image && image.type === "image");
      assert.equal(image.mimeType, "image/png");
      assert.ok(Buffer.from(image.data, "base64").length > 5000);
      assert.match(
        JSON.stringify(await manager.call("navegador", "browser_console", {})),
        /Interacción verificada/,
      );
      assert.equal(
        await readFile(join(workspace, "server.mjs"), "utf8"),
        original,
      );
      assert.ok(observations.length >= 7);
      assert.equal(
        registry.operations(source).some((o) => o.state === "pending"),
        false,
      );
      if (process.env.PERFECT_ARTIFACT_DIR) {
        const out = resolve(
          process.env.PERFECT_ARTIFACT_DIR,
          "interactive-browser",
        );
        await mkdir(out, { recursive: true });
        await writeFile(
          join(out, "application.png"),
          Buffer.from(image.data, "base64"),
        );
        await writeFile(
          join(out, "report.json"),
          JSON.stringify(
            {
              mode: "Actual Pi tool broker and MCP/Playwright/Docker; synthetic test application, no LLM inference",
              snapshot: state,
              observations: observations.length,
              sourceUnchanged: true,
              scope: "isolated application only",
            },
            null,
            2,
          ),
        );
      }
      await manager.call("navegador", "browser_close", {});
      assert.equal(registry.resources().length, 0);
    } finally {
      await manager.close();
      registry.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
