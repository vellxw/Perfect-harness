import { flipFuses, FuseVersion, FuseV1Options, getCurrentFuseWire, FuseState } from '@electron/fuses';
import { readFile, writeFile, copyFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';

const executable = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw Error('Usage: node scripts/desktop/harden-electron.mjs <Perfect.exe> [report]');
const directory = dirname(executable);
// This existing fuse selects a DIFFERENT filename. Electron does not generate
// that file when fuses are flipped. Ship an exact, same-release stock snapshot
// at the browser-specific path; do not disable a production fuse to make tests pass.
// No custom startup optimization or additional isolation is claimed for equal bytes.
// Contract: https://www.electronjs.org/docs/latest/tutorial/fuses
const stockPath = join(directory, 'v8_context_snapshot.bin');
const browserPath = join(directory, 'browser_v8_context_snapshot.bin');
const stockStat = await lstat(stockPath);
if (!stockStat.isFile() || stockStat.isSymbolicLink() || stockStat.size < 64 || stockStat.size > 32_000_000)
  throw Error('The packaged Electron release has no valid stock V8 context snapshot');
const stock = await readFile(stockPath);
try { await copyFile(stockPath, browserPath, constants.COPYFILE_EXCL); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const browserStat = await lstat(browserPath);
if (!browserStat.isFile() || browserStat.isSymbolicLink() || !(await readFile(browserPath)).equals(stock))
  throw Error('Browser snapshot is not the audited stock snapshot of this packaged Electron release');
const desired = {
  RunAsNode: false, EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true, OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: true, GrantFileProtocolExtraPrivileges: false,
  WasmTrapHandlers: true,
};
await flipFuses(executable, {
  version: FuseVersion.V1, strictlyRequireAllFuses: true,
  ...Object.fromEntries(Object.entries(desired).map(([name, enabled]) => [FuseV1Options[name], enabled])),
});
const wire = await getCurrentFuseWire(executable);
if (wire.version !== FuseVersion.V1) throw Error('Unexpected fuse wire version');
for (const [name, enabled] of Object.entries(desired))
  if (wire[FuseV1Options[name]] !== (enabled ? FuseState.ENABLE : FuseState.DISABLE)) throw Error('Fuse write did not persist: ' + name);
const report = {
  executable, version: wire.version, expected: desired, wire,
  browserSnapshot: { filename: 'browser_v8_context_snapshot.bin', source: 'v8_context_snapshot.bin from the exact packaged Electron runtime', sha256: createHash('sha256').update(stock).digest('hex'), bytes: stock.length, customOptimization: false },
};
await writeFile(process.argv[3] ?? 'release/electron-fuses.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
