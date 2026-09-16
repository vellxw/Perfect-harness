import test from 'node:test';
import assert from 'node:assert/strict';
import {positiveId,publicationInput,allowedDownload} from './publish-release.mjs';

test('publication accepts only unambiguous owner review or explicit dispatch IDs',()=>{
 const event={issue:{number:5},comment:{id:123,user:{login:'vellxw'},author_association:'OWNER',body:'<!-- perfect-desktop-visual-review:v1 -->\n```json\n{"acceptanceRunId":456}\n```'}};
 assert.deepEqual(publicationInput(event,'issue_comment'),{runId:456,commentId:123});
 assert.throws(()=>publicationInput({...event,issue:{number:6}},'issue_comment'));
 assert.throws(()=>publicationInput({...event,comment:{...event.comment,user:{login:'other'}}},'issue_comment'));
 assert.throws(()=>publicationInput({...event,comment:{...event.comment,body:event.comment.body+'\n```json\n{}\n```'}},'issue_comment'));
 assert.deepEqual(publicationInput({inputs:{acceptance_run:'456',review_comment:'123'}},'workflow_dispatch'),{runId:456,commentId:123});
 for(const value of ['1; rm','0',-1,NaN,Infinity,'9007199254740993'])assert.throws(()=>positiveId(value));
 assert.throws(()=>publicationInput(event,'pull_request'));
});
test('artifact redirects cannot downgrade TLS, contain credentials or leave GitHub delivery origins',()=>{
 assert.equal(allowedDownload('https://api.github.com/repos/vellxw/Perfect-harness/actions/artifacts/1/zip',true).hostname,'api.github.com');
 assert.equal(allowedDownload('https://release-assets.githubusercontent.com/a/b').protocol,'https:');
 for(const url of ['http://github.com/a','https://github.com@evil.example/a','https://evil.example/a','https://evilgithubusercontent.com/a','https://github.com:8443/a'])assert.throws(()=>allowedDownload(url));
 assert.throws(()=>allowedDownload('https://release-assets.githubusercontent.com/a/b',true));
});
