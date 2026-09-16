import {readFile} from 'node:fs/promises';
const file=process.argv[2]??'test-results/desktop/performance/report.json';
const report=JSON.parse(await readFile(file,'utf8'));
const sample=report.idle?.at(-1),mib=value=>Number.isFinite(value)?value/1048576:null;
console.log(JSON.stringify({sourceCommit:report.sourceCommit,status:report.status,checks:report.checks,legacyComparisons:report.legacyComparisons,method:report.method,animation:report.animation,soakDurationMs:report.soakDurationMs,latestIdle:sample?{rawRssMiB:mib(sample.rssBytes),pssMiB:mib(sample.pssBytes),privateMiB:mib(sample.privateBytes),swapPssMiB:mib(sample.swapPssBytes),enginePid:sample.enginePid,processes:sample.processes.map(p=>({pid:p.pid,ppid:p.ppid,name:p.name,type:p.type,rssMiB:mib(p.rssBytes),pssMiB:mib(p.pssBytes),privateMiB:mib(p.privateBytes),cpuTicks:p.cpuTicks,privilegedRead:p.privilegedRead}))}:null},null,2));
