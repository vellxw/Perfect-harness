import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEvidence, imageMime } from "../../src/tools/evidence.js";
import { hash } from "../../src/domain/util.js";
import { makeGoal } from "../fixtures/domain.js";
import type { Evidence } from "../../src/domain/model.js";
import { publicAddress } from "../../src/tools/research.js";

test("artifact reads reject changed bytes, cross-goal evidence, paths and symlink parents", async () => {
  const root = await mkdtemp(join(tmpdir(), "perfect-artifact-")),
    goal = { ...makeGoal(), root };
  await mkdir(join(root, "artifacts", "run"), { recursive: true });
  const path = join(root, "artifacts", "run", "report.json");
  await writeFile(path, '{"code":0}');
  const evidence: Evidence = {
    id: "e1",
    goalId: goal.id,
    kind: "report",
    artifactRef: path,
    contentHash: hash(Buffer.from('{"code":0}').toString("base64")),
    producer: "runner",
    revision: "revision",
    environmentHash: "env",
    criteriaIds: ["works"],
    capturedAt: new Date().toISOString(),
    validity: "valid",
  };
  try {
    assert.equal(
      (await readEvidence(goal, evidence, 1000)).toString(),
      '{"code":0}',
    );
    await assert.rejects(
      readEvidence(goal, { ...evidence, goalId: "other" }, 1000),
      /EVIDENCE_SCOPE/,
    );
    await assert.rejects(
      readEvidence(goal, { ...evidence, artifactRef: "/etc/passwd" }, 1000),
      /PATH_DENIED/,
    );
    await symlink(
      join(root, "artifacts", "run"),
      join(root, "artifacts", "link"),
    );
    await assert.rejects(
      readEvidence(
        goal,
        {
          ...evidence,
          artifactRef: join(root, "artifacts", "link", "report.json"),
        },
        1000,
      ),
      /LINK_DENIED/,
    );
    await writeFile(path, '{"code":1}');
    await assert.rejects(
      readEvidence(goal, evidence, 1000),
      /EVIDENCE_CHANGED/,
    );
    await assert.rejects(readEvidence(goal, evidence, 1), /EVIDENCE_SIZE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("images require actual recognizable bytes, not a filename claim", () => {
  assert.equal(
    imageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.throws(
    () => imageMime(Buffer.from("this is not an image")),
    /IMAGE_FORMAT/,
  );
});

test("documentation rejects private, link-local, mapped and reserved IP addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "192.0.2.1",
    "::1",
    "::ffff:8.8.8.8",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "not-an-address",
  ])
    assert.equal(publicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(publicAddress(address), true, address);
});
