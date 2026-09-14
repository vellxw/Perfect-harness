import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "./helpers.js";
import { integrationCommand, integrationRowIntent, integrationRows } from "../../src/ui/tui/integration-view.js";
import { demoSnapshot } from "../../src/ui/tui/demo.js";

for (const columns of [80, 120, 160]) {
  test(`panel de integraciones real en ${columns} columnas conserva español y navegación`, async () => {
    const ui = await mount("idle", "integrations", columns, columns === 80 ? 24 : 36);
    try {
      const frame = ui.captureCharFrame();
      assert.match(frame, /Integraciones/);
      assert.match(frame, /GitHub oficial/);
      assert.match(frame, /navegador interactivo/);
      ui.mockInput.pressKey("ESCAPE"); await ui.flush();
      assert.match(ui.captureCharFrame(), /Pedile a Perfect/);
      assert.equal(ui.actions.length, 0);
    } finally { await ui.dispose(); }
  });
}
test("conectar GitHub propone un permiso explícito y no lo concede automáticamente", () => {
  const snapshot = demoSnapshot("idle"), result = integrationCommand("github", "vellxw/Perfect-harness", snapshot);
  assert.equal(result?.phrase, "CONFIAR");
  assert.equal(result?.action?.type, "integration");
  const action = result!.action!;
  if (action.type !== "integration" || action.action.command !== "configure") throw Error("Unexpected action");
  assert.equal(action.action.config.kind, "github");
  if (action.action.config.kind !== "github") throw Error("Unexpected kind");
  assert.equal(action.action.config.writeMode, "deny");
  assert.deepEqual(action.action.config.repositories, ["vellxw/Perfect-harness"]);
  assert.equal(action.action.config.roles.includes("frontend"), false);
});
test("la aprobación muestra argumentos y conserva el digest, mientras un resultado incierto no se aprueba", () => {
  const s = demoSnapshot();
  s.integrations = { connections: [], windows: [], pending: [{ id: "op-1", serverId: "github", tool: "create_pull_request", digest: "exact-digest", state: "pending", effect: "write", role: "general", runId: "run-1", expiresAt: "2026-09-14T00:00:00Z", arguments: '{"owner":"vellxw","repo":"Perfect-harness","head":"perfect/fix"}' }] };
  const row = integrationRows(s)[0]!; assert.match(row.body, /perfect\/fix/);
  const intent = integrationRowIntent(row.id, s); assert.equal(intent?.phrase, "AUTORIZAR"); assert.match(intent!.body!, /ARGUMENTOS COMPLETOS/);
  assert.deepEqual(intent?.action, { type: "integration", action: { command: "approve", id: "op-1", digest: "exact-digest", confirmation: "AUTORIZAR" } });
  s.integrations.pending[0]!.state = "unknown";
  assert.equal(integrationRowIntent(row.id, s), undefined);
});
