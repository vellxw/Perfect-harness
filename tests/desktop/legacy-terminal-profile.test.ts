import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, link, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeLegacyTerminalProfile } from "../../src/desktop/platform/legacy-terminal-profile.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "perfect-legacy-profile-"));
  const local = join(root, "local-app-data");
  const directory = join(local, "Microsoft", "Windows Terminal", "Fragments", "PerfectHarness");
  const executable = join(root, "Instalación ñ con espacios", "Perfect.exe");
  const profile = { guid: "{35455046-4543-4454-a822-5f92b3030200}", name: "Perfect Harness", commandline: `"${executable}" --tui-child` };
  await mkdir(directory, { recursive: true });
  return { root, local, directory, executable, profile, path: join(directory, "PerfectHarness.json") };
}

test("V4 cleanup removes only the current installation fragment and is idempotent", async () => {
  const f = await fixture();
  try {
    const settings = join(f.local, "Microsoft", "Windows Terminal", "settings.json");
    await writeFile(settings, '{"personal":true}');
    await writeFile(f.path, JSON.stringify({ profiles: [f.profile] }));
    assert.equal(await removeLegacyTerminalProfile(f.local, f.executable), "removed");
    assert.equal(await removeLegacyTerminalProfile(f.local, f.executable), "absent");
    assert.equal(await readFile(settings, "utf8"), '{"personal":true}');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("legacy cleanup cannot remove a foreign installation, mixed fragment or damaged data", async () => {
  const f = await fixture();
  try {
    for (const content of [
      JSON.stringify({ profiles: [{ ...f.profile, commandline: '"C:\\Another\\Perfect.exe" --tui-child' }] }),
      JSON.stringify({ profiles: [f.profile, { name: "Personal" }] }),
      JSON.stringify({ profiles: [{ ...f.profile, guid: "not-the-perfect-guid" }] }),
      "not JSON",
    ]) {
      await writeFile(f.path, content);
      assert.equal(await removeLegacyTerminalProfile(f.local, f.executable), "not-owned");
      assert.equal(await readFile(f.path, "utf8"), content);
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("legacy cleanup refuses hardlinks and directory escapes", async () => {
  const f = await fixture();
  try {
    const protectedFile = join(f.root, "protected.json");
    const content = JSON.stringify({ profiles: [f.profile] });
    await writeFile(protectedFile, content);
    await link(protectedFile, f.path);
    assert.equal(await removeLegacyTerminalProfile(f.local, f.executable), "unsafe");
    assert.equal(await readFile(protectedFile, "utf8"), content);
    await rm(f.path);
    await rm(f.directory, { recursive: true });
    const outside = join(f.root, "foreign");
    await mkdir(outside); await writeFile(join(outside, "PerfectHarness.json"), content);
    await symlink(outside, f.directory, process.platform === "win32" ? "junction" : "dir");
    assert.equal(await removeLegacyTerminalProfile(f.local, f.executable), "unsafe");
    assert.equal(await readFile(join(outside, "PerfectHarness.json"), "utf8"), content);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
