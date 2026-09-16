import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
const [packagePath,home,workspace,output]=process.argv.slice(2);
const root=resolve(process.env.PERFECT_TEST_ROOT??'');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||!root)throw Error('This is an owned Windows CI fixture, not a product command');
for(const path of [packagePath,home,workspace,output]){const rel=relative(root,resolve(path));if(!rel||rel.startsWith('..')||rel.includes(':'))throw Error('Path outside the owned fixture');}
const cli=join(packagePath,'bin','perfect.cmd'),trap=join(root,'startup-trap.cjs'),marker=join(root,'startup-trap-executed');
await writeFile(trap,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected');process.exit(98);`);
const env={...process.env,PATH:`${process.env.WINDIR}\\System32;${process.env.WINDIR}`,NODE_OPTIONS:`--require="${trap}"`};
function call(args){
 for(const value of [cli,...args])if(/["\r\n%]/.test(value))throw Error('Unsupported fixture argument');
 const line=`"${cli}" ${args.map(a=>'"'+a+'"').join(' ')}`;
 const result=spawnSync(process.env.ComSpec??join(process.env.WINDIR,'System32','cmd.exe'),['/d','/s','/c','"'+line+'"'],{env,windowsHide:true,windowsVerbatimArguments:true,encoding:'utf8',timeout:30000,maxBuffer:5_000_000});
 if(result.error)throw result.error;
 assert.equal(result.status,0,`CLI failed: ${result.stderr}\n${result.stdout}`);return result.stdout.trim();
}
assert.equal(call(['--version']),'0.5.0');
const help=call(['--sin-interfaz','--ayuda']);assert.match(help,/Uso: perfect/);assert.match(help,/habilidades/);assert.match(help,/desktop/);
const args=['--no-ui','--home',home,'--workspace',workspace,'--json','habilidades'];
const first=JSON.parse(call(args)),second=JSON.parse(call(args));assert.deepEqual(second,first);
try{await access(marker);throw Error('Packaged CLI executed inherited NODE_OPTIONS');}catch(error){if(error.code!=='ENOENT')throw error;}
// Check that the same non-admin identity can reopen and update its own data.
const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(home,'state.sqlite'));
try{db.exec('BEGIN IMMEDIATE; ROLLBACK;');}finally{db.close();}
await writeFile(output,JSON.stringify({passed:true,version:'0.5.0',node:process.version,mode:'Actual packaged CLI under medium integrity without administrator membership',checks:['version','Spanish help','bundled Node with global PATH removed','two-process skills persistence','startup injection ignored','same-user writable SQLite transaction']},null,2));
console.log('PACKAGED_CLI_STANDARD_USER_PASS');
