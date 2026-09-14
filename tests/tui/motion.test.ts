import test from "node:test";
import assert from "node:assert/strict";
import { interpolateColor } from "../../src/ui/tui/motion.js";

test("motion interpolates actual color levels and clamps invalid progress", () => {
  assert.equal(interpolateColor("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(interpolateColor("#123456", "#abcdef", -1), "#123456");
  assert.equal(interpolateColor("#123456", "#abcdef", 2), "#abcdef");
  assert.equal(interpolateColor("#123456", "#abcdef", Number.NaN), "#123456");
  assert.throws(
    () => interpolateColor("invalid", "#abcdef", 0),
    /color tokens/,
  );
});
