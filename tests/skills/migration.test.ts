import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { SkillsRegistry } from "../../src/skills/registry.js";
import { control } from "../../src/skills/control.js";

test("migración conserva snapshots y produce backup SQLite válido con selección manual vacía", async () => {
  const dir = await mkdtemp(join(tmpdir(), "perfect-migrate-")),
    path = join(dir, "state.sqlite"),
    source = "/fixture/migrate",
    base = defaultConfig();
  try {
    let store = new SqliteStore(path),
      registry = new SkillsRegistry(store);
    const record = registry.get(source, base),
      before = JSON.stringify(record);
    store.close();
    const old = new DatabaseSync(path);
    old.prepare("DELETE FROM migrations WHERE version=3").run();
    old.close();
    store = new SqliteStore(path);
    registry = new SkillsRegistry(store);
    assert.equal(JSON.stringify(registry.get(source, base)), before);
    assert.deepEqual(control(store, source).manual, []);
    store.close();
    const bytes = await readFile(path + ".before-v4-complete.sqlite");
    assert.equal(bytes.toString("ascii", 0, 15), "SQLite format 3");
    const backup = new DatabaseSync(path + ".before-v4-complete.sqlite", {
      readOnly: true,
    });
    assert.equal(
      (
        backup.prepare("PRAGMA integrity_check").get() as {
          integrity_check: string;
        }
      ).integrity_check,
      "ok",
    );
    assert.equal(
      (
        backup.prepare("SELECT max(version) AS v FROM migrations").get() as {
          v: number;
        }
      ).v,
      2,
    );
    backup.close();
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
