import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  importUserReferences,
  resolveUserReferences,
  copyGoalReferences,
  readGoalReference,
} from "../../src/tools/references.js";
import type { Goal } from "../../src/domain/model.js";
test("adjuntos: hash, privacidad, ámbito y copia congelada independiente del original", async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "perfect-ref-"))),
    home = join(temp, "home"),
    workspace = join(temp, "workspace"),
    other = join(temp, "other"),
    file = join(temp, "referencia.md"),
    root = join(temp, "goal");
  await Promise.all([home, workspace, other, root].map((p) => mkdir(p)));
  await writeFile(file, "Referencia original sin instrucciones privilegiadas");
  try {
    const [ref] = await importUserReferences(
      home,
      workspace,
      [file],
      "private",
    );
    assert.ok(ref);
    await assert.rejects(
      () => resolveUserReferences(home, other, [ref.id], "private"),
      /REFERENCE_SCOPE/,
    );
    await assert.rejects(
      () => resolveUserReferences(home, workspace, [ref.id], "public"),
      /REFERENCE_PRIVACY/,
    );
    const refs = await resolveUserReferences(
      home,
      workspace,
      [ref.id],
      "private",
    );
    await copyGoalReferences(home, root, refs);
    await writeFile(file, "Original modificado");
    const item = await readGoalReference(
      { root, references: refs } as Goal,
      ref.id,
    );
    assert.match(item.bytes.toString(), /original/);
    await assert.rejects(
      () => readGoalReference({ root, references: refs } as Goal, "unknown"),
      /REFERENCE_SCOPE/,
    );
    await writeFile(join(root, "references", ref.id), "alterado");
    await assert.rejects(
      () => readGoalReference({ root, references: refs } as Goal, ref.id),
      /REFERENCE_INTEGRITY/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5 });
  }
});
test("adjuntos rechazan .env y HTML ejecutable", async () => {
  const temp = await realpath(
    await mkdtemp(join(tmpdir(), "perfect-ref-deny-")),
  );
  try {
    await mkdir(join(temp, "home"));
    await writeFile(join(temp, ".env"), "secret");
    await writeFile(join(temp, "active.html"), "<script>bad()</script>");
    await assert.rejects(
      () =>
        importUserReferences(
          join(temp, "home"),
          temp,
          [join(temp, ".env")],
          "private",
        ),
      /REFERENCE_PRIVATE_PATH/,
    );
    await assert.rejects(
      () =>
        importUserReferences(
          join(temp, "home"),
          temp,
          [join(temp, "active.html")],
          "private",
        ),
      /REFERENCE_FORMAT/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5 });
  }
});
