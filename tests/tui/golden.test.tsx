import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mount } from "./helpers.js";
import type { Screen } from "../../src/presentation/protocol.js";

const cases: [string, string, Screen, number, number][] = [
  ["running", "running", "home", 160, 45],
  ["compact", "repair", "home", 80, 24],
  ["agents", "running", "agents", 120, 36],
  ["done", "done", "home", 120, 36],
];
for (const [name, scene, screen, cols, rows] of cases) {
  test(`native terminal layout matches reviewed ${name} golden frame`, async () => {
    const expected = await readFile(
      new URL(`../../docs/screenshots/${name}.txt`, import.meta.url),
      "utf8",
    );
    const ui = await mount(scene, screen, cols, rows);
    try {
      assert.equal(
        ui.captureCharFrame().replaceAll("\r\n", "\n"),
        expected.replaceAll("\r\n", "\n"),
      );
    } finally {
      await ui.dispose();
    }
  });
}
