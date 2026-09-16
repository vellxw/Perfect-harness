import test from "node:test";
import assert from "node:assert/strict";
import { ComposerDrafts } from "../../src/desktop/renderer/draft-state.js";

test("startup drafts survive a UI remount, remain workspace-scoped and never submit work", () => {
  const drafts = new ComposerDrafts(2, 20);
  let changes = 0; const dispose = drafts.subscribe(() => changes++);
  drafts.set("workspace-a", "Landing ñ");
  assert.equal(drafts.read("workspace-a"), "Landing ñ");
  assert.equal(drafts.read("workspace-b"), "");
  assert.equal(drafts.read(undefined), "");
  drafts.set("workspace-b", "Juego");
  assert.equal(drafts.read("workspace-a"), "Landing ñ");
  drafts.set("workspace-a", "");
  assert.equal(drafts.read("workspace-a"), "");
  assert.equal(drafts.read("workspace-b"), "Juego");
  assert.equal(changes, 3); dispose();
  assert.throws(() => drafts.set(undefined, "x"), /carpeta autorizada/);
  assert.throws(() => drafts.set("../secret", "x"), /carpeta autorizada/);
  assert.throws(() => drafts.set("workspace-b", "x".repeat(21)), /límite/);
  drafts.set("workspace-c", "Otro"); drafts.set("workspace-d", "Más");
  assert.equal(drafts.read("workspace-b"), "");
  drafts.clear(); assert.equal(drafts.read("workspace-d"), "");
});
