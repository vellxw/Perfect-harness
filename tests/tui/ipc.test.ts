import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineClient } from "../../src/presentation/client.js";
import type { UiMessage } from "../../src/presentation/protocol.js";
test(
  "actual engine child connects over private IPC, persists UI preferences and closes without a provider call",
  { timeout: 20000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "perfect-ipc-")),
      workspace = join(root, "source"),
      home = join(root, "state");
    await mkdir(workspace);
    const client = new EngineClient({ home, workspace });
    const faults: string[] = [];
    const off = client.onMessage((m: UiMessage) => {
      if (m.type === "fault" || (m.type === "result" && !m.ok))
        faults.push(m.message);
    });
    try {
      await new Promise<void>((resolveWait, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Engine connection timeout: ${faults.join("; ")}`));
        }, 12000);
        const unsubscribe = client.subscribe(() => {
          if (client.getSnapshot().connected) {
            clearTimeout(timeout);
            unsubscribe();
            resolveWait();
          }
        });
      });
      assert.equal(client.getSnapshot().demo, false);
      assert.equal(client.getSnapshot().goal, undefined);
      const preferences = structuredClone(client.getSnapshot().preferences);
      preferences.ui.motion = "off";
      preferences.ui.onboarded = true;
      await new Promise<void>((resolveWait, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(
            new Error(
              `Preferences did not cross IPC: ${JSON.stringify({ faults, snapshot: client.getSnapshot().preferences })}`,
            ),
          );
        }, 5000);
        const unsubscribe = client.subscribe(() => {
          if (client.getSnapshot().preferences.ui.motion === "off") {
            clearTimeout(timeout);
            unsubscribe();
            resolveWait();
          }
        });
        client.dispatch({ type: "preferences", preferences });
      });
      assert.equal(
        JSON.parse(await readFile(join(home, "ui.json"), "utf8")).ui.motion,
        "off",
      );
      assert.deepEqual(faults, []);
    } finally {
      off();
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
