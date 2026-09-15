import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, lstat, realpath, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { extractFile, listPackage } from '@electron/asar';
import { getCurrentFuseWire, FuseVersion, FuseV1Options, FuseState } from '@electron/fuses';

const [packagePath, expectedSha, reportPath] = process.argv.slice(2);
if (!packagePath || !/^[a-f0-9]{40}$/.test(expectedSha ?? '')) throw Error('Expected package path and exact source SHA');
const root = await realpath(resolve(packagePath));
const identity = JSON.parse(await readFile(join(root, 'build-manifest.json'), 'utf8'));
const inventory = JSON.parse(await readFile(join(root, 'package-integrity.json'), 'utf8'));
assert.equal(identity.sourceCommit, expectedSha);
assert.equal(identity.version, '0.5.0');
assert.equal(inventory.sourceCommit, expectedSha);
assert.equal(inventory.version, identity.version);
assert.ok(Array.isArray(inventory.files) && inventory.files.length > 50);
const seen = new Set();
async function hashFile(path) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return digest.digest('hex');
}
for (const item of inventory.files) {
  assert.equal(typeof item.path, 'string');
  assert.ok(!seen.has(item.path), 'Repeated integrity entry'); seen.add(item.path);
  assert.match(item.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(item.bytes) && item.bytes >= 0);
  const path = resolve(root, item.path), rel = relative(root, path);
  assert.ok(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'), 'Integrity path escaped package');
  const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal((await realpath(path)).toLowerCase(), path.toLowerCase(), 'Package entry traverses a reparse point');
  assert.equal(stat.size, item.bytes, item.path + ': length changed');
  assert.equal(await hashFile(path), item.sha256, item.path + ': bytes changed');
}
const archive = join(root, 'resources', 'app.asar');
const paths = listPackage(archive).map(p => p.replaceAll('\\', '/'));
assert.ok(!paths.some(p => p.endsWith('/engine-dev.json')), 'Development runtime path leaked into packaged app');
const desktop = JSON.parse(extractFile(archive, 'build-info.json').toString('utf8'));
const engine = JSON.parse(await readFile(join(root, 'resources', 'engine', 'dist', 'build-info.json'), 'utf8'));
assert.equal(desktop.sourceCommit, expectedSha);assert.equal(engine.sourceCommit, expectedSha);
assert.equal(desktop.version, identity.version);assert.equal(engine.version, identity.version);
assert.equal(JSON.parse(extractFile(archive, 'package.json').toString('utf8')).main, 'main.cjs');
const marker = JSON.parse(await readFile(join(root, 'resources', 'engine', 'desktop-launch.json'), 'utf8'));
assert.deepEqual(marker, { schemaVersion: 1, relativeExecutable: '../../Perfect.exe' });
const wire = await getCurrentFuseWire(join(root, 'Perfect.exe'));
assert.equal(wire.version, FuseVersion.V1);
const desired = {
  RunAsNode: false, EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true, OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: true, GrantFileProtocolExtraPrivileges: false,
  WasmTrapHandlers: true,
};
for (const [name, enabled] of Object.entries(desired))
  assert.equal(wire[FuseV1Options[name]], enabled ? FuseState.ENABLE : FuseState.DISABLE, 'Unexpected production fuse ' + name);
assert.equal(Object.keys(wire).filter(k => /^\d+$/.test(k)).length, Object.keys(desired).length, 'Unreviewed new Electron fuse');
const cli = await readFile(join(root, 'bin', 'perfect.cmd'), 'utf8');
assert.ok(cli.includes('\r\n') && !cli.includes('`r`n'), 'CLI has literal rather than actual line breaks');
assert.ok(cli.includes('resources\\engine\\runtime\\node.exe') && cli.includes('dist\\cli\\index.js'));
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED'])
  assert.ok(cli.includes(`set "${key}="`), 'CLI must remove inherited startup injection: ' + key);
const result = {
  passed: true, version: identity.version, sourceCommit: expectedSha,
  filesVerified: inventory.files.length, executableSha256: await hashFile(join(root, 'Perfect.exe')),
  archiveSha256: await hashFile(archive), fuses: desired, wire,
  scope: 'Read-only byte/ASAR/provenance/fuse validation; not a substitute for native execution or visual review',
};
if (reportPath) { await mkdir(dirname(resolve(reportPath)), { recursive: true }); await writeFile(reportPath, JSON.stringify(result, null, 2)); }
console.log(JSON.stringify(result, null, 2));
