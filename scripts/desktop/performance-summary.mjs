import {readFile} from 'node:fs/promises';
const file=process.argv[2]??'test-results/desktop/performance/report.json';
const report=JSON.parse(await readFile(file,'utf8'));
const sample=report.idle?.at(-1);
console.log(JSON.stringify({sourceCommit:report.sourceCommit,status:report.status,checks:report.checks,method:report.method,latestIdle:sample?{rssMiB:sample.rssBytes/1048576,enginePid:sample.enginePid,processes:sample.processes.map(p=>({pid:p.pid,ppid:p.ppid,name:p.name,rssMiB:p.rssBytes/1048576,cpuTicks:p.cpuTicks}))}:null},null,2));
