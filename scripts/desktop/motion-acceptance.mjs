import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

// Evaluate the unmodified production UI. CSS-hypothesis cases in the companion
// diagnostic are never accepted as proof of the shipped implementation.
const directory=resolve(process.argv[2]??'test-results/desktop/motion-diagnosis');
const report=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
const identity=JSON.parse(await readFile('desktop/build-info.json','utf8'));
assert.equal(report.sourceCommit,identity.sourceCommit);
assert.equal(report.completed,true);
assert.deepEqual(report.errors,[]);
const actual=report.cases.find(c=>c.id==='normal-unrecorded');
assert.ok(actual&&actual.variant==='normal'&&!actual.recorded);
assert.ok(!['off','reduced'].includes(actual.raw.motion),'Motion must remain enabled in the acceptance run');
const checks=[];
for(const phase of ['palette-animation','model-form']){
  const measurement=actual.phases[phase];
  const enough=measurement?.animationFrames>=50;
  const observed=measurement?.animationP95Ms;
  checks.push({name:phase,status:enough&&Number.isFinite(observed)&&observed<=20?'PASS':'FAIL',observedMs:observed??null,limitMs:20,animatedFrames:measurement?.animationFrames??0,method:'Actual production animation RAF intervals, unrecorded; 60 Hz target with 3.3 ms scheduling tolerance. No inserted CSS.'});
}
const recorded=report.cases.find(c=>c.id==='normal-recorded');
const result={sourceCommit:identity.sourceCommit,status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',checks,recordedDiagnostics:recorded?.phases??null,limits:'Does not certify personal GPU or keyboard-to-photon latency. Recording overhead is reported separately and never corrected by interpolation.'};
await writeFile(join(directory,'acceptance.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
assert.equal(result.status,'PASS','Actual product motion exceeds the measured acceptance bound');
