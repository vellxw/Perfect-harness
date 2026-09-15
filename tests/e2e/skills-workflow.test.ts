import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { createGoal } from "../../src/application/goals.js";
import { Orchestrator } from "../../src/application/orchestrator.js";
import { PreparedDockerRunner } from "../../src/adapters/sandbox/prepared-runner.js";
import { collectDraft } from "../../src/skills/creator.js";
import {
  inspectReceipt,
  userDecision,
  selectManual,
  selectionClosure,
  control,
} from "../../src/skills/control.js";
import { SkillsRegistry } from "../../src/skills/registry.js";
import {
  proposeTrial,
  authorizeTrial,
  runTrial,
} from "../../src/skills/experiments.js";
import { proposal } from "../fixtures/domain.js";
import { piFixture } from "../fake-provider/pi-service.js";
const skillText =
  "---\nname: calcular-doble\ndescription: Implementar funciones numéricas simples con contrato claro.\nlicense: MIT\n---\nMARCADOR_CREADOR_31415\nPara calcular el doble de x, devolver x * 2. Evitar infraestructura adicional.\n";

test(
  "E2E V4: Pi crea skill, Judge verifica, cuarentena, A/B de código Docker y aprobación explícita",
  { skip: process.env.PERFECT_TEST_DOCKER !== "1", timeout: 180000 },
  async () => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), "perfect-author-e2e-")),
      ),
      home = join(root, "home"),
      workspace = join(root, "source");
    await mkdir(home);
    await mkdir(join(workspace, "tests"), { recursive: true });
    await writeFile(
      join(workspace, "tests", "draft.test.mjs"),
      `import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';test('borrador completo',async()=>{const t=await readFile('calcular-doble/SKILL.md','utf8');assert.match(t,/name: calcular-doble/);assert.match(t,/MARCADOR_CREADOR_31415/);});`,
    );
    const config = defaultConfig();
    config.reviewPolicy.finalFeatureReview = false;
    const plan = proposal();
    plan.tasks[0]!.profileId = "skill-author";
    plan.tasks[0]!.ownedSurfaces = [];
    plan.tasks[0]!.ownedFiles = ["calcular-doble"];
    plan.verification[0]!.command!.args = ["--test", "tests/draft.test.mjs"];
    const fake = await piFixture(home, config, (request, step) => {
      if (request.run.agentDefinitionId === "planner")
        return step === 0 ? { result: plan } : undefined;
      const evaluation = Boolean(request.toolAllowlist);
      if (step === 0)
        return {
          tool: "write_file",
          args: {
            path: evaluation ? "solution.mjs" : "calcular-doble/SKILL.md",
            content: evaluation
              ? JSON.stringify(request.context).includes(
                  "MARCADOR_CREADOR_31415",
                )
                ? "export const calculate=x=>x*2;"
                : "export const calculate=x=>x+2;"
              : skillText,
          },
        };
      if (step === 1)
        return {
          result: evaluation
            ? { summary: "Fixture completado" }
            : {
                summary: "Fixture completado",
                outputs: ["calcular-doble/SKILL.md"],
              },
        };
      return undefined;
    });
    const store = new SqliteStore(join(home, "state.sqlite")),
      runner = new PreparedDockerRunner(config, store, join(home, "sandbox")),
      registry = new SkillsRegistry(store);
    try {
      const goal = await createGoal(
        {
          request: "Crear habilidad calcular-doble con prueba existente",
          source: workspace,
          home,
          config,
          privacy: "public",
          mode: "mock",
          workMode: "skill-studio",
        },
        store,
      );
      const done = await new Orchestrator(store, fake.runtime, runner).run(
        goal.id,
        { acceptPlan: true },
      );
      assert.equal(done.state, "DONE", done.pauseReason ?? done.terminalReason);
      const result = await collectDraft({
        store,
        base: config,
        workspace,
        goalId: goal.id,
        folder: "calcular-doble",
        setIds: ["general"],
        license: "MIT",
        triggers: ["doble"],
      });
      assert.equal(result.status, "quarantine");
      const release = store.get("skillReleases", result.releaseId)!;
      assert.equal(
        store.list("skillSelections").some((s) => s.releaseId === release.id),
        false,
      );
      const inspect = inspectReceipt(store, workspace, release),
        trial = proposeTrial(store, workspace, config, {
          releaseId: release.id,
          profileId: "general",
          partition: "holdout",
          publicData: true,
          maxTokens: 250000,
          cases: [
            {
              id: "dev",
              kind: "code",
              prompt: "Exportar calculate(x) con el doble de x",
              partition: "development",
              exportName: "calculate",
              examples: [{ args: [2], expected: 4 }],
            },
            {
              id: "hold",
              kind: "code",
              prompt: "Exportar calculate(x) con el doble de x",
              partition: "holdout",
              exportName: "calculate",
              examples: [
                { args: [7], expected: 14 },
                { args: [-4], expected: -8 },
              ],
            },
          ],
        });
      authorizeTrial(
        store,
        trial.id,
        trial.specHash,
        workspace,
        [inspect.id],
        "EVALUAR",
      );
      const report = await runTrial({
        store,
        home,
        base: config,
        runtime: fake.runtime,
        runner,
        trialId: trial.id,
        signal: AbortSignal.timeout(60000),
        mode: "mock",
      });
      assert.equal(report.pairs[0]!.verdict, "improvement");
      assert.equal(report.qualityPassed, true);
      const decision = userDecision(
        store,
        workspace,
        release,
        "approve",
        inspect.id,
      );
      registry.approve(workspace, release.id, release.hash, decision.id);
      selectManual(
        store,
        workspace,
        config,
        release.id,
        release.hash,
        true,
        control(store, workspace).epoch,
        selectionClosure(store, workspace, release.id),
      );
      assert.ok(
        control(store, workspace).manual.some((p) => p.hash === release.hash),
      );
      assert.ok(
        store.list("verifications", goal.id).some((v) => v.status === "passed"),
      );
      assert.ok(
        fake.contexts
          .filter((c) => c.toolAllowlist)
          .every((c) => !c.toolAllowlist!.includes("mcp_call")),
      );
    } finally {
      await fake.close();
      for (const g of store.list("goals")) await runner.recover(g.id);
      store.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    }
  },
);
