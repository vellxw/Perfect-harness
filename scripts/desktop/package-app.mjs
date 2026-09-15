import { packager } from '@electron/packager';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Package on Windows x64');
if (!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies.electron)) throw Error('Electron must be pinned exactly');
const paths = await packager({
  dir: resolve('desktop'), name: 'Perfect', platform: 'win32', arch: 'x64',
  electronVersion: pkg.devDependencies.electron, appVersion: pkg.version,
  out: resolve('release/electron-staging'), overwrite: true, asar: true,
  icon: resolve('assets/brand/perfect.ico'),
  ignore: [/[/\\]engine-dev\.json$/],
  win32metadata: { CompanyName: 'Perfect Harness', ProductName: 'Perfect Harness', FileDescription: 'Perfect Harness Desktop' },
});
if (paths.length !== 1) throw Error('Expected exactly one Windows package');
console.log('Packaged Electron:', paths[0]);
