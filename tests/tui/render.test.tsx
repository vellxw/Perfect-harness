import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { screenLabel } from "../../src/i18n/es.js";
import type { Screen } from "../../src/presentation/protocol.js";
import { mount } from "./helpers.js";
for (const [width, height] of [
  [80, 24],
  [100, 30],
  [120, 36],
  [160, 45],
] as const) {
  test(`native TUI remains usable at ${width}x${height}`, async () => {
    const app = await mount("repair", "home", width, height);
    try {
      const frame = app.captureCharFrame();
      assert.match(frame, /Perfect/);
      assert.match(frame, /Iteración/);
      assert.match(frame, /Verificación/);
      assert.match(frame, /Pedile a Perfect|Trabajando/);
      assert.match(frame, /DEMO/);
      assert.match(frame, /Reparando el diseño adaptable/);
      assert.doesNotMatch(frame, /Add agent|CPU|MEM|NET/);
      const lines = frame.split("\n");
      assert.ok(lines.length <= height + 1);
      if (width >= 130) assert.match(frame, /AGENTES/);
      if (process.env.PERFECT_ARTIFACT_DIR) {
        await mkdir(process.env.PERFECT_ARTIFACT_DIR, { recursive: true });
        await writeFile(
          join(
            process.env.PERFECT_ARTIFACT_DIR,
            `native-${width}x${height}.txt`,
          ),
          frame,
        );
      }
    } finally {
      await app.dispose();
    }
  });
}
for (const screen of [
  "agents",
  "plan",
  "tasks",
  "verify",
  "artifacts",
  "routing",
  "cost",
  "logs",
  "doctor",
  "settings",
  "projects",
] as Screen[]) {
  test(`native ${screen} overlay renders and returns home`, async () => {
    const app = await mount("running", screen);
    try {
      assert.match(
        app.captureCharFrame(),
        new RegExp(screenLabel(screen), "i"),
      );
      app.mockInput.pressKey("ESCAPE");
      await app.flush();
      assert.match(app.captureCharFrame(), /OBJETIVO ACTUAL/);
    } finally {
      await app.dispose();
    }
  });
}
for (const scene of [
  "idle",
  "planning",
  "concurrent",
  "paused",
  "failed",
  "repair",
  "done",
])
  test(`native fixture ${scene} is clearly identified`, async () => {
    const app = await mount(scene);
    try {
      const frame = app.captureCharFrame();
      assert.match(frame, /DEMO/);
      if (scene === "idle") assert.match(frame, /Qué querés construir/);
      if (scene === "done") assert.match(frame, /completado/i);
      if (scene === "paused") assert.match(frame, /Docker no está disponible/);
    } finally {
      await app.dispose();
    }
  });
test("palette is keyboard-driven and uses the real selected command", async () => {
  const app = await mount("idle");
  try {
    await app.mockInput.typeText("/agents");
    await app.flush();
    assert.match(app.captureCharFrame(), /Comandos/);
    app.mockInput.pressKey("RETURN");
    await app.flush();
    assert.match(app.captureCharFrame(), /Agentes/);
    assert.equal(app.actions.filter((a) => a.type === "goal").length, 0);
  } finally {
    await app.dispose();
  }
});
test("composer submits one goal, defaults private and keeps newlines", async () => {
  const app = await mount("idle");
  try {
    await app.mockInput.typeText("Build a booking app");
    app.mockInput.pressKey("RETURN", { shift: true });
    await app.mockInput.typeText("with persistent reservations");
    app.mockInput.pressKey("RETURN");
    await app.flush();
    const goals = app.actions.filter((a) => a.type === "goal");
    assert.equal(goals.length, 1);
    assert.equal(goals[0]!.public, false);
    assert.match(goals[0]!.description, /\n/);
  } finally {
    await app.dispose();
  }
});
test("abort is not dispatched by an accidental Enter", async () => {
  const app = await mount();
  try {
    await app.mockInput.typeText("/abort");
    app.mockInput.pressKey("RETURN");
    await app.flush();
    assert.match(app.captureCharFrame(), /Escribí CANCELAR/);
    app.mockInput.pressKey("RETURN");
    await app.flush();
    assert.equal(app.actions.filter((a) => a.type === "abort").length, 0);
    await app.mockInput.typeText("CANCELAR");
    app.mockInput.pressKey("RETURN");
    await app.flush();
    assert.equal(app.actions.filter((a) => a.type === "abort").length, 1);
  } finally {
    await app.dispose();
  }
});
test("resize preserves composer and main navigation", async () => {
  const app = await mount();
  try {
    for (const [w, h] of [
      [160, 45],
      [80, 24],
      [100, 30],
      [120, 36],
    ]) {
      app.resize(w!, h!);
      await app.flush();
      assert.match(app.captureCharFrame(), /Pedile a Perfect/);
      assert.match(app.captureCharFrame(), /Perfect/);
    }
  } finally {
    await app.dispose();
  }
});
