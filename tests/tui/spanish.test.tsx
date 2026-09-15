import assert from "node:assert/strict";
import test from "node:test";
import { screenLabel } from "../../src/i18n/es.js";
import type { Screen } from "../../src/presentation/protocol.js";
import { mount } from "./helpers.js";

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
  test(`pantalla ${screen}: textos propios en español y sin etiquetas inglesas heredadas`, async () => {
    const app = await mount("running", screen);
    try {
      const frame = app.captureCharFrame();
      assert.ok(frame.includes(screenLabel(screen)), screenLabel(screen));
      assert.doesNotMatch(
        frame,
        /CURRENT GOAL|YOUR NEXT IDEA|Quick actions|Unknown command|not observed|unknown \(not exposed\)|Connect your provider|High contrast|Terminal background|Select a goal|Subscription OAuth|reported tokens|uncertain requests/,
      );
      assert.match(frame, /Esc cerrar|Esc volver/);
      assert.match(frame, /DEMO/);
    } finally {
      await app.dispose();
    }
  });
}
for (const name of ["agentes", "agents"]) {
  test(`/${name} abre el mismo panel real sin crear objetivos`, async () => {
    const app = await mount("idle");
    try {
      await app.mockInput.typeText(`/${name}`);
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
}
test("objetivo con eñes y tildes cruza la interfaz sin alterar el texto ni la privacidad", async () => {
  const app = await mount("idle");
  try {
    const request = "Diseñá una página para niños con información útil";
    await app.mockInput.typeText(`/objetivo ${request}`);
    app.mockInput.pressKey("RETURN");
    await app.flush();
    const goals = app.actions.filter((a) => a.type === "goal");
    assert.equal(goals.length, 1);
    assert.equal(goals[0]!.description, request);
    assert.equal(goals[0]!.public, false);
  } finally {
    await app.dispose();
  }
});
test("la confirmación española de cancelación mantiene el permiso interno exacto", async () => {
  const app = await mount();
  try {
    await app.mockInput.typeText("/cancelar");
    app.mockInput.pressKey("RETURN");
    await app.flush();
    assert.match(app.captureCharFrame(), /Escribí CANCELAR/);
    app.mockInput.pressKey("RETURN");
    await app.flush();
    assert.equal(app.actions.filter((a) => a.type === "abort").length, 0);
    await app.mockInput.typeText("CANCELAR");
    app.mockInput.pressKey("RETURN");
    await app.flush();
    const aborts = app.actions.filter((a) => a.type === "abort");
    assert.equal(aborts.length, 1);
    assert.equal(aborts[0]!.confirmation, "ABORT");
  } finally {
    await app.dispose();
  }
});

test("/estado vuelve al objetivo sin despachar operaciones nuevas", async () => {
  const app = await mount("running", "agents");
  try {
    app.mockInput.pressKey("ESCAPE");
    await app.flush();
    await app.mockInput.typeText("/estado");
    app.mockInput.pressKey("RETURN");
    await app.flush();
    assert.match(app.captureCharFrame(), /OBJETIVO ACTUAL/);
    assert.doesNotMatch(app.captureCharFrame(), /Comando desconocido/);
    assert.equal(app.actions.length, 0);
  } finally {
    await app.dispose();
  }
});
