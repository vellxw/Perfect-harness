import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PresentationEngine } from "../../src/presentation/engine.js";
import type { UiMessage, UiSnapshot } from "../../src/presentation/protocol.js";

test(
  "real presentation action enters the core and pauses safely without local provider accounts",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "perfect-ui-goal-"));
    const workspace = join(root, "source");
    await mkdir(workspace);
    let state: UiSnapshot | undefined;
    const messages: UiMessage[] = [];
    const engine = await PresentationEngine.create(
      { home: join(root, "state"), workspace },
      (m) => {
        messages.push(m);
        if (m.type === "snapshot") state = m.snapshot;
      },
    );
    try {
      await engine.dispatch("new-goal", {
        type: "goal",
        description: "Build a small tested local greeting",
        public: false,
      });
      const deadline = Date.now() + 15000;
      while ((!state?.goal || state.busy) && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 25));
      assert.ok(
        messages.some(
          (m) => m.type === "result" && m.requestId === "new-goal" && m.ok,
        ),
      );
      assert.equal(state?.goal?.state, "PAUSED");
      assert.equal(state?.busy, false);
      assert.equal(state?.goal?.privacy, "private");
      const goal = engine.store.get("goals", state!.goal!.id)!;
      assert.equal(goal.providerRequests, 0);
      assert.equal(goal.mode, "real");
      assert.equal(goal.state, "PAUSED");
      assert.ok(goal.pauseReason);
      assert.deepEqual(await readdir(workspace), []);
      assert.equal(engine.store.list("usage", goal.id).length, 0);
    } finally {
      await engine.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);
