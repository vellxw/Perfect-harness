import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentExecutor } from "../../src/application/agent-executor.js";
import { createGoal } from "../../src/application/goals.js";
import { defaultConfig } from "../../src/config/schema.js";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { GitWorkspace } from "../../src/adapters/git/workspace.js";
import { ScriptedRuntime } from "../fake-provider/scripted.js";
import { NodeFixtureRunner } from "../fixtures/node-runner.js";

for (const external of [false, true]) {
  test(
    external
      ? "revoked Contributor consent blocks before provider inference"
      : "explicit mock frontend requires no real Contributor consent",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "perfect-consent-"));
      const source = join(root, "source"),
        home = join(root, "home"),
        config = defaultConfig();
      await mkdir(source);
      const store = new SqliteStore(join(home, "state.sqlite"));
      let handlerCalls = 0,
        consent = external;
      const runtime = new ScriptedRuntime(async () => {
        handlerCalls++;
        return { summary: "synthetic response" };
      });
      if (external) {
        const original = runtime.resolve.bind(runtime);
        runtime.resolve = async (...args) => {
          const route = await original(...args);
          consent = false;
          // Test-only metadata to exercise the external-route guard; no network adapter is involved.
          return {
            ...route,
            ...args[0],
            endpoint: "https://synthetic.invalid",
            provenance: "catalog",
          };
        };
      }
      try {
        const goal = await createGoal(
          {
            request: "Test consent boundaries",
            source,
            home,
            config,
            privacy: "public",
            mode: "mock",
          },
          store,
        );
        const executor = new AgentExecutor(
          store,
          runtime,
          new NodeFixtureRunner(),
          config,
          async () => consent,
        );
        const run = executor.invoke(
          {
            goal,
            role: "frontend",
            workspace: new GitWorkspace(goal.root, config).repo,
            instruction: "Return a synthetic summary",
            schema: { type: "object" },
            parse: (value) => value,
          },
          new AbortController().signal,
        );
        if (external) {
          await assert.rejects(run, /CONTRIBUTOR_CONSENT/);
          assert.equal(handlerCalls, 0);
        } else {
          const result = await run;
          assert.equal(result.run.status, "completed");
          assert.equal(result.run.routeBinding.provenance, "mock");
          assert.equal(handlerCalls, 1);
        }
      } finally {
        store.close();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
}
