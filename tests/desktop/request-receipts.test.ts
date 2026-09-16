import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { RequestReceipts } from "../../src/desktop/engine/request-receipts.js";

test("receipts survive engine recreation and reject concurrent replay without retaining payloads", async () => {
  const home = await mkdtemp(join(tmpdir(), "perfect-receipts-")), session = randomUUID(), request = randomUUID();
  try {
    const first = new RequestReceipts(home, session, "engine");
    const results = await Promise.allSettled([first.claim(request), first.claim(request)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    await first.close();
    const replacement = new RequestReceipts(home, session, "engine");
    await assert.rejects(() => replacement.claim(request), /duplicada/);
    const shell = new RequestReceipts(home, session, "desktop");
    await shell.claim(request); // Distinct trust boundaries both check the same ID.
    await replacement.close(); await shell.close();
    await RequestReceipts.removeSession(home, session);
    assert.deepEqual(await readdir(join(home, "desktop-request-receipts")), []);
  } finally { await rm(home, { recursive: true, force: true, maxRetries: 5 }); }
});

test("more than ten thousand requests do not force a desktop restart and old IDs remain consumed", { timeout: 90000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "perfect-receipts-long-")), session = randomUUID();
  const journal = new RequestReceipts(home, session, "desktop"), first = randomUUID();
  try {
    await journal.claim(first);
    for (let batch = 0; batch < 101; batch++) {
      await Promise.all(Array.from({ length: 100 }, () => journal.claim(randomUUID())));
    }
    await assert.rejects(() => journal.claim(first), /duplicada/);
    await assert.rejects(() => journal.claim("../../credentials"), /no válido/);
    await journal.close();
    await assert.rejects(() => journal.claim(randomUUID()), /cerrada/);
  } finally {
    await journal.close(); await RequestReceipts.removeSession(home, session);
    await rm(home, { recursive: true, force: true, maxRetries: 5 });
  }
});
