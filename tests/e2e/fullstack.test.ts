import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../../src/config/schema.js";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { DockerRunner } from "../../src/adapters/sandbox/docker.js";
import { createGoal } from "../../src/application/goals.js";
import { Orchestrator } from "../../src/application/orchestrator.js";
import {
  ReservationDemoRuntime,
  reservationGoal,
  seedReservationSource,
} from "../../src/examples/reservations.js";

const enabled = process.env.PERFECT_TEST_DOCKER === "1";
test(
  "Docker fullstack: real SQLite, real browser, mobile failure, repair, independent roles and DONE",
  { skip: !enabled, timeout: 300000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "perfect-fullstack-")),
      source = join(root, "source"),
      home = join(root, "home"),
      config = defaultConfig();
    await seedReservationSource(source);
    const store = new SqliteStore(join(home, "state.sqlite"));
    const runtime = new ReservationDemoRuntime(),
      runner = new DockerRunner(config, store, join(home, "sandbox"));
    let goalId: string | undefined;
    try {
      assert.equal(
        await runner.available(),
        true,
        "Docker is mandatory in this CI job",
      );
      const goal = await createGoal(
        {
          request: reservationGoal,
          source,
          home,
          config,
          privacy: "public",
          mode: "mock",
        },
        store,
      );
      goalId = goal.id;
      const finished = await new Orchestrator(store, runtime, runner).run(
        goal.id,
        { acceptPlan: true },
      );
      if (finished.state !== "DONE")
        console.error(
          JSON.stringify(
            {
              goal: finished.state,
              reason: finished.pauseReason ?? finished.terminalReason,
              failures: store.list("failures", goal.id),
              checks: store.list("verifications", goal.id),
              tasks: store.list("tasks", goal.id).map((t) => ({
                id: t.id,
                status: t.status,
                error: t.failureReason,
              })),
            },
            null,
            2,
          ),
        );
      assert.equal(
        finished.state,
        "DONE",
        finished.pauseReason ?? finished.terminalReason,
      );
      assert.ok(
        runtime.maximumParallelWriters >= 2,
        "Frontend and backend must run concurrently",
      );
      for (const role of [
        "planner",
        "general",
        "frontend",
        "backend",
        "oracle",
        "visual",
      ])
        assert.ok(runtime.roles.includes(role), `Missing role ${role}`);
      const failures = store
        .list("verifications", goal.id)
        .filter((v) => v.status === "failed");
      assert.ok(
        failures.some(
          (v) => v.specId === "browser" && v.summary.includes("overflow"),
        ),
      );
      assert.ok(store.events(goal.id).some((e) => e.type === "repair.created"));
      const firstVisualFailure = failures.find((v) => v.specId === "browser")!;
      assert.ok(
        store
          .list("verifications", goal.id)
          .some(
            (v) =>
              v.specId === "frontend-build" &&
              v.revision === firstVisualFailure.revision &&
              v.status === "passed",
          ),
        "A syntax-green frontend still must fail the visual gate",
      );
      assert.equal(
        store.list("intents", goal.id).filter((i) => i.status !== "completed")
          .length,
        0,
      );
    } finally {
      if (goalId && process.env.PERFECT_ARTIFACT_DIR) {
        const out = resolve(process.env.PERFECT_ARTIFACT_DIR);
        await mkdir(out, { recursive: true });
        const goal = store.get("goals", goalId)!;
        for (const e of store
          .list("evidence", goalId)
          .filter((e) => ["screenshot", "report", "trace"].includes(e.kind))) {
          const name =
            e.revision === goal.candidateRevision
              ? basename(e.artifactRef)
              : `${e.id}-${basename(e.artifactRef)}`;
          await copyFile(e.artifactRef, join(out, name)).catch(() => {});
        }
        await writeFile(
          join(out, "fullstack-summary.json"),
          JSON.stringify(
            {
              state: goal.state,
              mode: goal.mode,
              reason: goal.pauseReason ?? goal.terminalReason,
              roles: runtime.roles,
              maximumParallelWriters: runtime.maximumParallelWriters,
              iterations: goal.iteration,
              verifications: store.list("verifications", goalId),
              failures: store.list("failures", goalId),
              events: store
                .events(goalId)
                .map((e) => ({ type: e.type, at: e.occurredAt })),
            },
            null,
            2,
          ),
        );
      }
      if (goalId) await runner.recover(goalId);
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
