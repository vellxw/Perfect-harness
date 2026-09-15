import test from "node:test";
import assert from "node:assert/strict";
import { missingEditorChecks } from "../../src/validation/center.js";

test("editores sin adaptador nunca se presentan como falta de credenciales", () => {
  for (const c of missingEditorChecks()) {
    assert.equal(c.implemented, false);
    assert.equal(c.detected, "NOT_APPLICABLE");
    assert.equal(c.invoked, "NOT_TESTED");
    assert.match(c.detail, /no implementado/);
    assert.notEqual(c.verified, "PASS");
  }
});
