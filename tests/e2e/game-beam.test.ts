import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, mkdir, copyFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../../src/config/schema.js";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { createGoal } from "../../src/application/goals.js";
import { GitWorkspace } from "../../src/adapters/git/workspace.js";
import { prepareDependencies } from "../../src/adapters/sandbox/dependencies.js";
import { PreparedDockerRunner } from "../../src/adapters/sandbox/prepared-runner.js";
import { VerificationService } from "../../src/adapters/verification/service.js";
import { VerificationSpecSchema } from "../../src/domain/model.js";
const selector = (name: string) => `[data-testid="${name}"]`;

test(
  "juego web real + Beam MIT: ganar, perder, reiniciar, responsive y reduced-motion",
  { skip: process.env.PERFECT_TEST_DOCKER !== "1", timeout: 600000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "perfect-game-")),
      home = join(root, "state"),
      source = join(root, "source"),
      config = defaultConfig();
    await cp(resolve("examples/game-creator-web"), source, { recursive: true });
    const store = new SqliteStore(join(home, "state.sqlite")),
      runner = new PreparedDockerRunner(config, store, join(home, "sandbox"));
    let goalId: string | undefined;
    try {
      const goal = await createGoal(
        {
          request: "Porción jugable con victoria derrota y reinicio",
          source,
          home,
          config,
          privacy: "public",
          mode: "mock",
          workMode: "game-creator",
        },
        store,
      );
      goalId = goal.id;
      await prepareDependencies({
        goal,
        config,
        store,
        home,
        allowNetwork: true,
        signal: AbortSignal.timeout(240000),
      });
      const current = store.get("goals", goal.id)!,
        workspace = new GitWorkspace(goal.root, config).repo,
        verify = new VerificationService(store, runner);
      const logic = await verify.run(
        current,
        workspace,
        VerificationSpecSchema.parse({
          id: "game-logic",
          title: "Estados y reglas",
          kind: "command",
          criteriaIds: ["gameplay"],
          command: {
            executable: "npm",
            args: ["test"],
            cwd: ".",
            timeoutMs: 30000,
          },
        }),
        AbortSignal.timeout(60000),
      );
      assert.equal(logic.status, "passed", logic.summary);
      for (const reduced of [false, true]) {
        const actions = [
          {
            type: "expectText",
            selector: selector("status"),
            value: "En juego",
          },
          ...["right", "right", "down", "down"].map((x) => ({
            type: "click",
            selector: selector(x),
          })),
          {
            type: "expectText",
            selector: selector("status"),
            value: "Victoria",
          },
          { type: "click", selector: selector("reset") },
          { type: "click", selector: selector("down") },
          { type: "click", selector: selector("right") },
          {
            type: "expectText",
            selector: selector("status"),
            value: "Derrota",
          },
          { type: "click", selector: selector("reset") },
          {
            type: "expectText",
            selector: selector("status"),
            value: "En juego",
          },
          {
            type: "expectText",
            selector: selector("motion"),
            value: reduced ? "Movimiento reducido" : "Beam público",
          },
        ];
        const result = await verify.run(
          current,
          workspace,
          VerificationSpecSchema.parse({
            id: reduced ? "game-reduced" : "game-browser",
            title: "Partida real",
            kind: "browser",
            criteriaIds: ["gameplay"],
            scenario: {
              server: {
                executable: "node",
                args: ["server.mjs"],
                cwd: ".",
                timeoutMs: 180000,
              },
              port: 3000,
              path: "/",
              viewports: [
                { width: 390, height: 844 },
                { width: 1280, height: 800 },
              ],
              actions,
              reducedMotion: reduced ? "reduce" : "no-preference",
            },
          }),
          AbortSignal.timeout(180000),
        );
        assert.equal(result.status, "passed", result.summary);
      }
      if (process.env.PERFECT_ARTIFACT_DIR) {
        const out = resolve(process.env.PERFECT_ARTIFACT_DIR, "game-beam");
        await mkdir(out, { recursive: true });
        for (const e of store.list("evidence", goal.id))
          await copyFile(
            e.artifactRef,
            join(out, e.id + "-" + basename(e.artifactRef)),
          );
      }
    } finally {
      if (goalId) await runner.recover(goalId);
      store.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    }
  },
);
