import test from "node:test";
import assert from "node:assert/strict";
import {
  EnvelopeSchema,
  parseRange,
  approvedNavigation,
  validSnapshot,
} from "../../src/desktop/contracts/protocol.js";
test("bridge rechaza operaciones arbitrarias, campos extra y sesiones inválidas", () => {
  const request = {
    protocol: 1,
    sessionId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "project",
    requestId: "00000000-0000-4000-8000-000000000002",
    operation: "action",
    payload: { type: "refresh" },
  };
  assert.ok(EnvelopeSchema.safeParse(request).success);
  assert.equal(
    EnvelopeSchema.safeParse({ ...request, operation: "exec" }).success,
    false,
  );
  assert.equal(
    EnvelopeSchema.safeParse({ ...request, shell: true }).success,
    false,
  );
  assert.equal(
    EnvelopeSchema.safeParse({ ...request, sessionId: "bad" }).success,
    false,
  );
});
test("rangos de video respetan límites y no habilitan origen externo", () => {
  assert.deepEqual(parseRange("bytes=3-8", 10), {
    start: 3,
    end: 8,
    partial: true,
  });
  assert.deepEqual(parseRange("bytes=-3", 10), {
    start: 7,
    end: 9,
    partial: true,
  });
  assert.throws(() => parseRange("bytes=999-", 10));
  assert.throws(() => parseRange("bytes=1-2,5-6", 10));
  assert.equal(
    approvedNavigation("http://127.0.0.1:3000/path", "http://127.0.0.1:3000"),
    true,
  );
  assert.equal(
    approvedNavigation("http://127.0.0.1:3001", "http://127.0.0.1:3000"),
    false,
  );
  assert.equal(
    approvedNavigation("file:///etc/passwd", "http://127.0.0.1:3000"),
    false,
  );
  assert.equal(
    validSnapshot({ protocol: 1, workspace: "x", connected: true }),
    false,
  );
});
