import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAcceptance, assertCandidateRun, parseVisualReview, requiredGates} from './release-policy.mjs';
const sha='a'.repeat(40), digest='b'.repeat(64), runId=123;
const files=[...['daily','goal-loop','motion','upgrade'].map((scenario,i)=>({path:`videos/${i}.mp4`,sha256:digest,bytes:100,kind:'video',scenario})),...Array.from({length:8},(_,i)=>({path:`screenshots/${i}.png`,sha256:digest,bytes:100,kind:'screenshot'}))];
const acceptance={schemaVersion:1,sourceCommit:sha,version:'0.5.0',status:'AUTOMATED_PASS_VISUAL_REVIEW_REQUIRED',gates:Object.fromEntries(requiredGates.map(g=>[g,'success'])),windows:{status:'PASS',sourceCommit:sha},performance:{status:'PASS',mode:'FULL',sourceCommit:sha,checks:Array.from({length:7},()=>({status:'PASS'})),soakDurationMs:1800000,idleDurationMs:300000},goalLoop:{passed:true,sourceCommit:sha},files};
const artifact={id:17,digest:'sha256:'+digest};
function comment(overrides={}){const review={sourceCommit:sha,acceptanceRunId:runId,evidenceArtifactId:17,evidenceArtifactSha256:digest,verdict:'approved',notes:'Fixture de prueba, no una revisión visual real.',reviewedFiles:files.map(({path,sha256})=>({path,sha256})),...overrides};return {user:{login:'vellxw'},author_association:'OWNER',body:'<!-- perfect-desktop-visual-review:v1 -->\n```json\n'+JSON.stringify(review)+'\n```'};}
test('publication gates cannot count skips, old revisions or partial benchmarks as acceptance',()=>{
 assertAcceptance(acceptance,sha);
 assert.throws(()=>assertAcceptance({...acceptance,sourceCommit:'c'.repeat(40)},sha));
 assert.throws(()=>assertAcceptance({...acceptance,gates:{...acceptance.gates,windows:'skipped'}},sha));
 assert.throws(()=>assertAcceptance({...acceptance,performance:{...acceptance.performance,mode:'SCREENING_NOT_ACCEPTANCE'}},sha));
 assert.throws(()=>assertAcceptance({...acceptance,performance:{...acceptance.performance,soakDurationMs:1000}},sha));
});
test('a PR or other main revision cannot publish a release',()=>{
 const run={repository:{full_name:'vellxw/Perfect-harness'},head_sha:sha,head_branch:'main',event:'push',path:'.github/workflows/v5-acceptance.yml',status:'completed',conclusion:'success'};
 assertCandidateRun(run,sha);
 assert.throws(()=>assertCandidateRun({...run,event:'pull_request'},sha));
 assert.throws(()=>assertCandidateRun({...run,head_sha:'d'.repeat(40)},sha));
});
test('visual review must explicitly identify actual evidence bytes and every video',()=>{
 assert.equal(parseVisualReview(comment(),acceptance,runId,artifact).verdict,'approved');
 assert.throws(()=>parseVisualReview(comment({reviewedFiles:files.slice(1)}),acceptance,runId,artifact));
 assert.throws(()=>parseVisualReview(comment({sourceCommit:'c'.repeat(40)}),acceptance,runId,artifact));
 assert.throws(()=>parseVisualReview({...comment(),user:{login:'someone-else'}},acceptance,runId,artifact));
 assert.throws(()=>parseVisualReview(comment({evidenceArtifactSha256:'c'.repeat(64)}),acceptance,runId,artifact));
});
