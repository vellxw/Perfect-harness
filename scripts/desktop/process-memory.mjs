import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

export function rollupValues(text) {
  const field=name=>{const value=new RegExp('^'+name+':\\s+(\\d+)\\s+kB$','m').exec(text)?.[1];if(value===undefined)throw Error('Missing smaps field '+name);return Number(value)*1024;};
  const value={pssBytes:field('Pss'),privateBytes:field('Private_Clean')+field('Private_Dirty'),mappedRssBytes:field('Rss'),swapPssBytes:field('SwapPss')};
  assert.ok(value.pssBytes<=value.mappedRssBytes+4096,'Invalid proportional memory');
  assert.ok(value.privateBytes<=value.mappedRssBytes+4096,'Invalid private memory');
  return value;
}
/** Reads only members of the app's descendant tree. Never treats inaccessible
 * process memory as zero. Sandbox-protected rollup can require read-only sudo
 * diagnostics on hosted CI; the application still runs unprivileged. */
export async function sampleTree(rootPid,enginePid) {
  if(process.platform!=='linux'||!Number.isSafeInteger(rootPid)||rootPid<=0)throw Error('Linux process-tree measurement required');
  const rows=[];
  for(const name of await readdir('/proc')) {
    if(!/^\d+$/.test(name))continue;
    try {
      const raw=await readFile('/proc/'+name+'/stat','utf8'),end=raw.lastIndexOf(')'),fields=raw.slice(end+2).trim().split(/\s+/);
      rows.push({pid:Number(name),ppid:Number(fields[1]),startTicks:Number(fields[19]),cpuTicks:Number(fields[11])+Number(fields[12]),name:raw.slice(raw.indexOf('(')+1,end)});
    }catch(error){if(!['ENOENT','ESRCH','EACCES'].includes(error.code))throw error;}
  }
  const included=new Set([rootPid]);
  let added=true;
  while(added){added=false;for(const row of rows)if(included.has(row.ppid)&&!included.has(row.pid)){included.add(row.pid);added=true;}}
  assert.ok(enginePid&&included.has(enginePid),'Separate Node engine is absent from the process tree');
  const processes=[];
  for(const row of rows.filter(r=>included.has(r.pid))) {
    try {
      const status=await readFile(`/proc/${row.pid}/status`,'utf8');
      const path=`/proc/${row.pid}/smaps_rollup`;let smaps,privilegedRead=false;
      try{smaps=await readFile(path,'utf8');}
      catch(error){
        if(!['EACCES','EPERM'].includes(error.code)||process.env.GITHUB_ACTIONS!=='true')throw error;
        // Numeric, already verified child PID only; no arbitrary file, shell or
        // elevation of the tested Electron/Node processes.
        smaps=execFileSync('sudo',['-n','cat',path],{encoding:'utf8',timeout:3000,maxBuffer:64000});privilegedRead=true;
      }
      const command=(await readFile(`/proc/${row.pid}/cmdline`,'utf8')).split('\0');
      const type=command.find(x=>x.startsWith('--type='))?.slice(7)??(row.pid===enginePid?'perfect-engine':row.pid===rootPid?'electron-main':row.name);
      processes.push({...row,...rollupValues(smaps),rssBytes:Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]??0)*1024,type,privilegedRead});
    }catch(error){if(['ENOENT','ESRCH'].includes(error.code)&&row.pid!==rootPid&&row.pid!==enginePid)continue;throw error;}
  }
  assert.ok(processes.some(p=>p.pid===rootPid)&&processes.some(p=>p.pid===enginePid),'A live product process was excluded');
  const sum=key=>processes.reduce((n,p)=>n+p[key],0);
  return {at:performance.now(),rssBytes:sum('rssBytes'),pssBytes:sum('pssBytes'),privateBytes:sum('privateBytes'),swapPssBytes:sum('swapPssBytes'),chargedBytes:sum('pssBytes')+sum('swapPssBytes'),processes,enginePid};
}
