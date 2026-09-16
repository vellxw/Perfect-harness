import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const { rollupValues } = await import(
  pathToFileURL(resolve("scripts/desktop/process-memory.mjs")).href
) as {
  rollupValues(text: string): {
    pssBytes: number;
    privateBytes: number;
    mappedRssBytes: number;
    swapPssBytes: number;
  };
};

test("memory diagnostics preserve raw RSS and account proportional sharing plus swap", () => {
  const source = "Rss: 200 kB\nPss: 150 kB\nPrivate_Clean: 40 kB\nPrivate_Dirty: 60 kB\nSwapPss: 20 kB\n";
  const first = rollupValues(source), second = rollupValues(source);
  assert.equal(first.mappedRssBytes + second.mappedRssBytes, 400 * 1024);
  assert.equal(first.pssBytes + second.pssBytes, 300 * 1024);
  assert.equal(first.privateBytes, 100 * 1024);
  assert.equal(first.pssBytes + first.swapPssBytes, 170 * 1024);
});

test("missing or inconsistent kernel data is not silently reported as zero memory", () => {
  assert.throws(() => rollupValues("Rss: 200 kB\n"), /Missing smaps/);
  assert.throws(() => rollupValues("Rss: 10 kB\nPss: 50 kB\nPrivate_Clean: 0 kB\nPrivate_Dirty: 0 kB\nSwapPss: 0 kB\n"), /Invalid proportional/);
});
