import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { act } from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalDialog } from "../../src/ui/tui/approval.js";

test("long plan approval can be read completely at 80x24 before typed confirmation", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const t = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
  const root = createRoot(t.renderer);
  let approved = false;
  const body = Array.from({ length: 60 }, (_, i) => `Criterio ${i + 1}: conservar esta condición de aceptación.`).join("\n");
  const render = async () => {
    await act(async () => { await t.renderOnce(); });
  };
  try {
    // Flush React's commit and effects, not a guessed 60ms wall-clock delay.
    // The keyboard subscription must exist before emitting its one input.
    await act(async () => {
      root.render(<ApprovalDialog confirmation={{ title: "Plan exacto", body, phrase: "APROBAR" }} width={80} height={24} motion="off" onCancel={() => {}} onConfirm={() => { approved = true; }} />);
    });
    await render();
    assert.match(t.captureCharFrame(), /Criterio 1:/);
    await act(async () => { t.mockInput.pressKey("END", { ctrl: true }); });
    await render();
    assert.match(t.captureCharFrame(), /Criterio 60:/);
    await act(async () => { t.mockInput.pressKey("RETURN"); });
    await render();
    assert.equal(approved, false);
    await act(async () => { await t.mockInput.typeText("APROBAR"); });
    await act(async () => { t.mockInput.pressKey("RETURN"); });
    await render();
    assert.equal(approved, true);
  } finally {
    await act(async () => { root.unmount(); });
    t.renderer.destroy();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
