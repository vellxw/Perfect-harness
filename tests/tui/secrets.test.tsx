import test from "node:test";
import assert from "node:assert/strict";
import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { SecretEntry } from "../../src/ui/tui/components.js";

test("native secret input masks typing and bracketed paste without leaking into a rendered frame", async () => {
  const test = await createTestRenderer({
      width: 100,
      height: 10,
      kittyKeyboard: true,
    }),
    root = createRoot(test.renderer);
  let submitted = "",
    cancelled = false;
  root.render(
    <SecretEntry
      onSubmit={(value) => {
        submitted = value;
      }}
      onCancel={() => {
        cancelled = true;
      }}
    />,
  );
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 50));
    await test.renderOnce();
  };
  try {
    await flush();
    await test.mockInput.typeText("synthetic-");
    await test.mockInput.pasteBracketedText("credential-not-real");
    await flush();
    const frame = test.captureCharFrame();
    assert.doesNotMatch(frame, /synthetic|credential-not-real/);
    assert.match(frame, /•/);
    test.mockInput.pressKey("RETURN");
    await flush();
    assert.equal(submitted, "synthetic-credential-not-real");
    assert.equal(cancelled, false);
  } finally {
    root.unmount();
    test.renderer.destroy();
  }
});
