import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { MediaBroker } from "../../src/desktop/main/media.js";
test("reproducción por rango conserva bytes verificados y bloquea modificaciones", async () => {
  const root = await mkdtemp(join(tmpdir(), "perfect-media-"));
  const bytes = Buffer.alloc(4096, 7);
  bytes.write("ftyp", 4);
  const path = join(root, "test.mp4");
  await writeFile(path, bytes);
  const media = new MediaBroker(root);
  try {
    const entry = await media.add({
      path,
      size: bytes.length,
      extension: ".mp4",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    const response = await media.respond(
      new Request(entry.url, { headers: { range: "bytes=1024-2047" } }),
    );
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 1024);
    assert.equal(
      (await media.respond(new Request("perfect://media/unknown"))).status,
      403,
    );
    await writeFile(path, Buffer.from("changed"));
    assert.equal((await media.respond(new Request(entry.url))).status, 416);
  } finally {
    await media.clear();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
