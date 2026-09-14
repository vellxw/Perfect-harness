import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "../../src/cli/main.js";
import { splitArguments } from "../../src/cli/shell.js";
import { loadConfig } from "../../src/config/load.js";

test("interactive quoting does not execute shell substitutions", () => {
  assert.deepEqual(splitArguments('goal "build a thing" --public'), [
    "goal",
    "build a thing",
    "--public",
  ]);
  assert.deepEqual(splitArguments("goal '$(touch /tmp/no)'"), [
    "goal",
    "$(touch /tmp/no)",
  ]);
  assert.throws(() => splitArguments('goal "unfinished'), /Unclosed/);
});
test("CLI help, init, privacy consent and error exits", async () => {
  const root = await mkdtemp(join(tmpdir(), "perfect-cli-")),
    home = join(root, "home"),
    workspace = join(root, "source");
  await mkdir(workspace);
  try {
    assert.equal(await main(["--help"]), 0);
    assert.equal(await main(["--version"]), 0);
    const args = ["--home", home, "--workspace", workspace, "--json"];
    assert.equal(await main([...args, "init"]), 0);
    assert.equal(
      (await loadConfig(workspace, home)).agents.frontend.reasoning,
      "xhigh",
    );
    assert.equal(await main([...args, "status"]), 2);
    assert.equal(await main([...args, "consent-contributor"]), 2);
    assert.equal(await main([...args, "consent-contributor", "--yes"]), 0);
    const policy = JSON.parse(
      await readFile(join(home, "policy.json"), "utf8"),
    ) as { contributorWorkspaces: string[] };
    assert.deepEqual(policy.contributorWorkspaces, [await realpath(workspace)]);
    assert.equal(await main([...args, "consent-contributor", "--revoke"]), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
