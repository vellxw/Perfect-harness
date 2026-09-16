import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prepareDesktopState } from "../../src/desktop/engine/state-upgrade.js";

test("first Desktop backup includes committed WAL rows and leaves the V4 schema unchanged", async () => {
  const home = await mkdtemp(join(tmpdir(), "perfect-upgrade-wal-"));
  const db = new DatabaseSync(join(home, "state.sqlite"));
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE migrations(version INTEGER PRIMARY KEY); INSERT INTO migrations VALUES(3); CREATE TABLE fixture(value TEXT); INSERT INTO fixture VALUES('committed-in-wal');");
    await writeFile(join(home, "ui.json"), '{"ui":{"motion":"off"}}');
    assert.ok((await lstat(join(home, "state.sqlite-wal"))).size > 0);
    const result = await prepareDesktopState(home), backupPath = join(home, result.backupDirectory, "state.sqlite");
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try { assert.equal(backup.prepare("SELECT value FROM fixture").get()?.value, "committed-in-wal"); assert.equal(backup.prepare("SELECT MAX(version) AS v FROM migrations").get()?.v, 3); }
    finally { backup.close(); }
    assert.equal(result.sourceSchemaVersions["state.sqlite"], 3);
    assert.equal(result.files.find(f => f.name === "state.sqlite")?.sha256, createHash("sha256").update(await readFile(backupPath)).digest("hex"));
    assert.equal(db.prepare("SELECT MAX(version) AS v FROM migrations").get()?.v, 3);
    assert.equal(await readFile(join(home, "ui.json"), "utf8"), '{"ui":{"motion":"off"}}');
    assert.deepEqual(await prepareDesktopState(home), result, "Completed startup must be idempotent");
  } finally { db.close(); await rm(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); }
});
test("migration refuses live controller locks without stealing or executing anything", async () => {
  const home = await mkdtemp(join(tmpdir(), "perfect-upgrade-active-")), db = new DatabaseSync(join(home, "state.sqlite"));
  try {
    db.exec("CREATE TABLE process_locks(pid INTEGER);");db.prepare("INSERT INTO process_locks VALUES(?)").run(process.pid);
    await assert.rejects(() => prepareDesktopState(home), /UPGRADE_ACTIVE/);
    assert.equal(db.prepare("SELECT pid FROM process_locks").get()?.pid, process.pid);
    await assert.rejects(readFile(join(home, "desktop-migration-v5.json")), { code: "ENOENT" });
    db.exec("DELETE FROM process_locks");
    assert.equal((await prepareDesktopState(home)).status, "complete");
  } finally { db.close(); await rm(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); }
});
test("an abandoned migration lock is recoverable; a live lock is not", async () => {
  const home = await mkdtemp(join(tmpdir(), "perfect-upgrade-lock-"));
  try {
    const lock = join(home, ".desktop-migration-v5.lock");
    await writeFile(lock, JSON.stringify({ pid: process.pid, nonce: randomUUID() }));
    await assert.rejects(() => prepareDesktopState(home), /UPGRADE_ACTIVE/);
    const exitedPid = Number(execFileSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).trim());
    await writeFile(lock, JSON.stringify({ pid: exitedPid, nonce: randomUUID() }));
    assert.equal((await prepareDesktopState(home)).status, "complete");
    await assert.rejects(lstat(lock), { code: "ENOENT" });
  } finally { await rm(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); }
});
