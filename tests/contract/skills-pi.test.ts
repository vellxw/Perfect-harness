import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { SkillsRegistry } from "../../src/skills/registry.js";
import { releaseFromFiles } from "../../src/skills/importer.js";
import {
  inspectReceipt,
  userDecision,
  selectManual,
  selectionClosure,
  control,
} from "../../src/skills/control.js";
import {
  proposeTrial,
  authorizeTrial,
  runTrial,
  verifiedTrialReport,
} from "../../src/skills/experiments.js";
import { NodeFixtureRunner } from "../fixtures/node-runner.js";
import { piFixture } from "../fake-provider/pi-service.js";
import { createGoal } from "../../src/application/goals.js";
import { AgentExecutor } from "../../src/application/agent-executor.js";
import { GitWorkspace } from "../../src/adapters/git/workspace.js";
const marker = "PROCEDIMIENTO_PRIVADO_DE_PRUEBA_982";

test(
  "Pi real: A/B independiente, borrador no activo, manual por versión y otro equipo sin contenido",
  { timeout: 90000 },
  async () => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), "perfect-eval-sdk-")),
      ),
      home = join(root, "home"),
      workspace = join(root, "source");
    await mkdir(home);
    await mkdir(workspace);
    const config = defaultConfig();
    const fake = await piFixture(home, config, (request, step) =>
      step === 0
        ? {
            result: {
              answer: JSON.stringify(request.context).includes(marker)
                ? "correcto"
                : "sin procedimiento",
            },
          }
        : undefined,
    );
    const store = new SqliteStore(join(home, "state.sqlite")),
      registry = new SkillsRegistry(store);
    try {
      registry.get(workspace, config);
      const skill = releaseFromFiles({
        files: {
          "SKILL.md": Buffer.from(
            `---\nname: prueba-aislada\ndescription: Protocolo de prueba aislado.\nlicense: MIT\n---\n${marker}\n`,
          ),
        },
        defaultSets: ["backend"],
        privacy: "public",
        triggers: ["protocolo"],
        provenance: {
          kind: "draft",
          source: "test:authored",
          license: "MIT",
          redistribution: "allowed",
        },
        creatorRunId: "author",
      });
      registry.quarantine(skill, workspace);
      const inspection = inspectReceipt(store, workspace, skill);
      const trial = proposeTrial(store, workspace, config, {
        releaseId: skill.id,
        profileId: "backend",
        partition: "holdout",
        cases: [
          {
            id: "dev",
            kind: "response",
            prompt: "Describir protocolo de prueba",
            partition: "development",
            contains: ["correcto"],
          },
          {
            id: "holdout",
            kind: "response",
            prompt: "Aplicar protocolo de prueba",
            partition: "holdout",
            exact: "correcto",
          },
        ],
        maxTokens: 200000,
      });
      authorizeTrial(
        store,
        trial.id,
        trial.specHash,
        workspace,
        [inspection.id],
        "EVALUAR",
      );
      const result = await runTrial({
        store,
        home,
        base: config,
        runtime: fake.runtime,
        runner: new NodeFixtureRunner(),
        trialId: trial.id,
        signal: AbortSignal.timeout(45000),
        mode: "mock",
      });
      assert.equal(result.complete, true);
      assert.equal(result.pairs[0]!.verdict, "improvement");
      assert.equal(result.mode, "mock-or-unexecuted");
      assert.equal(
        store.list("skillSelections").some((s) => s.releaseId === skill.id),
        false,
      );
      assert.equal(fake.contexts.length, 2);
      assert.notEqual(fake.contexts[0]!.cwd, fake.contexts[1]!.cwd);
      assert.equal(
        JSON.stringify(fake.contexts[0]!.context).includes(marker),
        false,
      );
      assert.equal(
        JSON.stringify(fake.contexts[1]!.context).includes(marker),
        true,
      );
      for (const r of fake.requests)
        assert.deepEqual(
          (r.payload.tools as { name: string }[]).map((t) => t.name),
          ["submit_result"],
        );
      await verifiedTrialReport(store, workspace, trial.id);
      const decision = userDecision(
        store,
        workspace,
        skill,
        "approve",
        inspection.id,
      );
      registry.approve(workspace, skill.id, skill.hash, decision.id);
      const existing = registry.get(workspace, config),
        manual = structuredClone(existing.config);
      manual.skills.mode = "manual";
      registry.update(workspace, config, existing.hash, manual);
      selectManual(
        store,
        workspace,
        config,
        skill.id,
        skill.hash,
        true,
        control(store, workspace).epoch,
        selectionClosure(store, workspace, skill.id),
      );
      const executor = new AgentExecutor(
        store,
        fake.runtime,
        new NodeFixtureRunner(),
        config,
        false,
      );
      const invoke = async (role: "backend" | "frontend") => {
        const goal = await createGoal(
          {
            request: "Evaluar aislamiento por equipo",
            source: workspace,
            home,
            config,
            privacy: "public",
            mode: "mock",
          },
          store,
        );
        return executor.invoke(
          {
            goal,
            role,
            workspace: new GitWorkspace(goal.root, config).repo,
            instruction: "Devolver answer",
            schema: { type: "object" },
            parse: (v) => v,
          },
          AbortSignal.timeout(15000),
        );
      };
      await invoke("backend");
      assert.equal(
        JSON.stringify(fake.contexts.at(-1)!.context).includes(marker),
        true,
      );
      await invoke("frontend");
      assert.equal(
        JSON.stringify(fake.contexts.at(-1)!.context).includes(marker),
        false,
      );
      registry.setMaster(false);
      await invoke("backend");
      assert.equal(
        JSON.stringify(fake.contexts.at(-1)!.context).includes(marker),
        false,
      );
    } finally {
      await fake.close();
      store.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    }
  },
);
