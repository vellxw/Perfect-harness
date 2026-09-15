import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSmallMessage,
  sameAppOrigin,
  collectorPaths,
} from "../../src/desktop/contracts/limits.js";
test("IPC distingue recursos de disco de rutas lógicas remotas y rechaza mensajes excesivos", () => {
  assert.deepEqual(
    collectorPaths({
      type: "studio",
      action: { command: "import-github", input: { path: "skills/example" } },
    }),
    [],
  );
  assert.deepEqual(
    collectorPaths({
      type: "integration",
      action: {
        command: "configure",
        config: { transport: { type: "stdio", command: "C:\\Tools\\mcp.exe" } },
      },
    }),
    ["C:\\Tools\\mcp.exe"],
  );
  assert.throws(() => assertSmallMessage({ text: "x".repeat(1000001) }));
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(() => assertSmallMessage(circular));
  assert.equal(sameAppOrigin("perfect://app/index.html"), true);
  for (const value of [
    "perfect://app.evil/index.html",
    "https://app/index.html",
    "perfect://user@app/index.html",
    "file:///tmp/index.html",
  ])
    assert.equal(sameAppOrigin(value), false);
});
