import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalDialog } from "../../src/ui/tui/approval.js";
test("long plan approval can be read completely at 80x24 before typed confirmation", async () => {
  const t = await createTestRenderer({
      width: 80,
      height: 24,
      kittyKeyboard: true,
    }),
    root = createRoot(t.renderer);
  let approved = false;
  const body = Array.from(
    { length: 60 },
    (_, i) => `Criterio ${i + 1}: conservar esta condición de aceptación.`,
  ).join("\n");
  root.render(
    <ApprovalDialog
      confirmation={{ title: "Plan exacto", body, phrase: "APROBAR" }}
      width={80}
      height={24}
      motion="off"
      onCancel={() => {}}
      onConfirm={() => {
        approved = true;
      }}
    />,
  );
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 60));
    await t.renderOnce();
  };
  try {
    await flush();
    assert.match(t.captureCharFrame(), /Criterio 1:/);
    t.mockInput.pressKey("END", { ctrl: true });
    await flush();
    assert.match(t.captureCharFrame(), /Criterio 60:/);
    t.mockInput.pressKey("RETURN");
    await flush();
    assert.equal(approved, false);
    await t.mockInput.typeText("APROBAR");
    t.mockInput.pressKey("RETURN");
    await flush();
    assert.equal(approved, true);
  } finally {
    root.unmount();
    t.renderer.destroy();
  }
});
