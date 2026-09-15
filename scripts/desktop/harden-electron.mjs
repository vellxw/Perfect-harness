import {flipFuses,FuseVersion,FuseV1Options} from '@electron/fuses';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const executable=resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Usage: node scripts/desktop/harden-electron.mjs <Perfect.exe>');
await flipFuses(executable,{
  version:FuseVersion.V1,
  strictlyRequireAllFuses:true,
  [FuseV1Options.RunAsNode]:false,
  [FuseV1Options.EnableCookieEncryption]:true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,
  [FuseV1Options.EnableNodeCliInspectArguments]:false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:true,
  [FuseV1Options.OnlyLoadAppFromAsar]:true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]:true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]:false,
  [FuseV1Options.WasmTrapHandlers]:true,
});
const bytes=await readFile(executable);const sentinel=Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');const at=bytes.indexOf(sentinel);if(at<0)throw Error('Electron fuse sentinel missing after hardening');
const version=bytes[at+sentinel.length],length=bytes[at+sentinel.length+1],wire=bytes.subarray(at+sentinel.length+2,at+sentinel.length+2+length).toString('ascii');
const report={executable,version,length,wire,expected:{runAsNode:false,cookieEncryption:true,nodeOptions:false,nodeCliInspect:false,asarIntegrity:true,onlyAsar:true,fileProtocolExtraPrivileges:false}};
await writeFile(process.argv[3]??'release/electron-fuses.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
