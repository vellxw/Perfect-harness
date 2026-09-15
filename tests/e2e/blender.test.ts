import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, mkdir, readFile, rm, copyFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../../src/config/schema.js";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { createGoal } from "../../src/application/goals.js";
import { GitWorkspace } from "../../src/adapters/git/workspace.js";
import { PreparedDockerRunner } from "../../src/adapters/sandbox/prepared-runner.js";
import { VerificationService } from "../../src/adapters/verification/service.js";
import { VerificationSpecSchema } from "../../src/domain/model.js";
import { validateGlb } from "../../src/adapters/blender/validation.js";

test(
  "Blender real: fuente reabierta por proceso independiente, GLB en Three.js y render no vacío",
  { skip: process.env.PERFECT_TEST_BLENDER !== "1", timeout: 360000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "perfect-blender-")),
      home = join(root, "home"),
      source = join(root, "source"),
      config = defaultConfig();
    await cp(resolve("examples/blender-asset"), source, { recursive: true });
    const store = new SqliteStore(join(home, "state.sqlite")),
      runner = new PreparedDockerRunner(config, store, join(home, "sandbox"));
    let goalId: string | undefined;
    try {
      const goal = await createGoal(
        {
          request: "Crear asset editable y validarlo en runtime",
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
      const result = await new VerificationService(store, runner).run(
        goal,
        new GitWorkspace(goal.root, config).repo,
        VerificationSpecSchema.parse({
          id: "asset",
          title: "Asset Blender verificado",
          kind: "blender",
          criteriaIds: ["asset"],
          blender: {
            script: "scene.py",
            width: 480,
            height: 320,
            timeoutMs: 240000,
          },
        }),
        AbortSignal.timeout(300000),
      );
      assert.equal(result.status, "passed", result.summary);
      const evidence = store.list("evidence", goal.id),
        glb = evidence.find((e) => e.artifactRef.endsWith("asset.glb"));
      assert.ok(glb);
      assert.equal(validateGlb(await readFile(glb.artifactRef)).meshes, 2);
      const report = evidence.find((e) =>
        e.artifactRef.endsWith("runtime-report.json"),
      );
      assert.ok(report);
      const runtime = JSON.parse(await readFile(report.artifactRef, "utf8"));
      assert.equal(runtime.loader, "Three.js GLTFLoader");
      assert.ok(runtime.nonBackground > 20);
      assert.equal(runtime.preview.width, 480);
      assert.ok(
        store.list("intents", goal.id).every((i) => i.status === "completed"),
      );
      if (process.env.PERFECT_ARTIFACT_DIR) {
        const out = resolve(process.env.PERFECT_ARTIFACT_DIR, "blender");
        await mkdir(out, { recursive: true });
        for (const e of evidence)
          await copyFile(e.artifactRef, join(out, basename(e.artifactRef)));
      }
    } finally {
      if (goalId) await runner.recover(goalId);
      store.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    }
  },
);
