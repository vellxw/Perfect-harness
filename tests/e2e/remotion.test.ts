import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  copyFile,
} from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../../src/config/schema.js";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { createGoal } from "../../src/application/goals.js";
import { prepareDependencies } from "../../src/adapters/sandbox/dependencies.js";
import { PreparedDockerRunner } from "../../src/adapters/sandbox/prepared-runner.js";
import { VerificationSpecSchema } from "../../src/domain/model.js";
import { VerificationService } from "../../src/adapters/verification/service.js";
import { GitWorkspace } from "../../src/adapters/git/workspace.js";

test(
  "Remotion: approved dependency image, offline real frames/video and metadata verification",
  { skip: process.env.PERFECT_TEST_DOCKER !== "1", timeout: 600000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "perfect-render-")),
      source = join(root, "source"),
      home = join(root, "home"),
      config = defaultConfig();
    await mkdir(source);
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name: "perfect-render-fixture",
        version: "1.0.0",
        private: true,
        dependencies: {
          "@remotion/bundler": "4.0.524",
          "@remotion/renderer": "4.0.524",
          remotion: "4.0.524",
          react: "19.1.1",
          "react-dom": "19.1.1",
        },
      }),
    );
    await writeFile(
      join(source, "index.jsx"),
      `import React from 'react'; import {registerRoot, Composition, AbsoluteFill, useCurrentFrame} from 'remotion';
const Scene=()=>{const frame=useCurrentFrame();return <AbsoluteFill style={{background:'#161624'}}><div style={{position:'absolute',left:frame*3,top:70,width:60,height:60,background:'#89ffbd'}}/></AbsoluteFill>};
registerRoot(()=> <Composition id="Motion" component={Scene} width={320} height={240} fps={30} durationInFrames={60}/>);`,
    );
    const store = new SqliteStore(join(home, "state.sqlite")),
      runner = new PreparedDockerRunner(config, store, join(home, "sandbox"));
    let goalId: string | undefined;
    try {
      const goal = await createGoal(
        {
          request:
            "Render a 2-second moving square with three different frames",
          source,
          home,
          config,
          privacy: "public",
          mode: "mock",
        },
        store,
      );
      goalId = goal.id;
      const prepared = await prepareDependencies({
        goal,
        config,
        store,
        home,
        allowNetwork: true,
        render: true,
        signal: AbortSignal.timeout(300000),
      });
      assert.match(prepared.imageId, /^sha256:/);
      const current = store.get("goals", goal.id)!,
        workspace = new GitWorkspace(goal.root, config);
      const spec = VerificationSpecSchema.parse({
        id: "render",
        title: "Render actual animation",
        kind: "remotion",
        criteriaIds: ["motion"],
        remotion: {
          entry: "index.jsx",
          composition: "Motion",
          frames: [0, 30, 59],
          width: 320,
          height: 240,
          fps: 30,
          durationFrames: 60,
        },
      });
      const result = await new VerificationService(store, runner).run(
        current,
        workspace.repo,
        spec,
        AbortSignal.timeout(240000),
      );
      assert.equal(result.status, "passed", result.summary);
      const evidence = store.list("evidence", goal.id);
      const frames = evidence.filter((e) => e.kind === "frame");
      assert.equal(frames.length, 3);
      assert.equal(new Set(frames.map((e) => e.contentHash)).size, 3);
      const video = evidence.find((e) => e.artifactRef.endsWith("video.mp4"));
      assert.ok(video);
      assert.ok((await readFile(video.artifactRef)).length > 1000);
      const lock = await readFile(
        join(workspace.repo, "package-lock.json"),
        "utf8",
      );
      assert.ok(JSON.parse(lock).lockfileVersion);
    } finally {
      if (goalId) {
        if (process.env.PERFECT_ARTIFACT_DIR) {
          const out = resolve(process.env.PERFECT_ARTIFACT_DIR, "remotion");
          await mkdir(out, { recursive: true });
          for (const e of store.list("evidence", goalId))
            await copyFile(
              e.artifactRef,
              join(out, basename(e.artifactRef)),
            ).catch(() => {});
        }
        await runner.recover(goalId);
      }
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
