import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function writeWindowsCli(payload) {
  const bin = join(resolve(payload), 'bin');
  await mkdir(bin, { recursive: true });
  const source = [
    '@echo off', 'setlocal',
    ...['NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ASAR'].map(name => `set "${name}="`),
    '"%~dp0..\\resources\\engine\\runtime\\node.exe" "%~dp0..\\resources\\engine\\dist\\cli\\index.js" %*',
    'exit /b %errorlevel%', '',
  ].join('\r\n');
  await writeFile(join(bin, 'perfect.cmd'), source, 'ascii');
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/write-cli.mjs')) {
  if (!process.argv[2]) throw Error('Expected owned Windows package directory');
  await writeWindowsCli(process.argv[2]);
}
