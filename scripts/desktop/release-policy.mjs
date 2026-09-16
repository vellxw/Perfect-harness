import assert from 'node:assert/strict';

export const repository = 'vellxw/Perfect-harness';
export const requiredGates = ['core', 'blender', 'terminal', 'desktop', 'goal-loop', 'performance', 'windows'];
export function assertAcceptance(value, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.sourceCommit, sha, 'Evidence belongs to another source revision');
  assert.match(value.version, /^0\.5\.\d+$/);
  assert.equal(value.status, 'AUTOMATED_PASS_VISUAL_REVIEW_REQUIRED');
  assert.deepEqual(Object.keys(value.gates).sort(), [...requiredGates].sort());
  for (const gate of requiredGates) assert.equal(value.gates[gate], 'success', 'Unsuccessful gate: ' + gate);
  assert.equal(value.windows.status, 'PASS');
  assert.equal(value.windows.sourceCommit, sha);
  assert.equal(value.performance.status, 'PASS');
  assert.equal(value.performance.mode, 'FULL');
  assert.equal(value.performance.sourceCommit, sha);
  assert.ok(value.performance.checks.length >= 7);
  assert.ok(value.performance.checks.every(c => c.status === 'PASS'));
  assert.ok(value.performance.soakDurationMs >= 1_800_000);
  assert.ok(value.performance.idleDurationMs >= 300_000);
  assert.equal(value.goalLoop.passed, true);
  assert.equal(value.goalLoop.sourceCommit, sha);
  assert.ok(Array.isArray(value.files) && value.files.length >= 12);
  assert.equal(new Set(value.files.map(f => f.path)).size, value.files.length);
  for (const file of value.files) {
    assert.match(file.path, /^[A-Za-z0-9_./-]+$/);
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
  }
  const videos = value.files.filter(f => f.kind === 'video');
  assert.equal(videos.length, 4);
  assert.deepEqual(videos.map(v => v.scenario).sort(), ['daily', 'goal-loop', 'motion', 'upgrade']);
  return value;
}
export function assertCandidateRun(run, sha) {
  assert.equal(run.repository?.full_name, repository);
  assert.equal(run.head_sha, sha);
  assert.equal(run.head_branch, 'main');
  assert.ok(['push', 'workflow_dispatch'].includes(run.event), 'Only a tested main candidate can be released');
  assert.equal(run.path, '.github/workflows/v5-acceptance.yml');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
}
export function parseVisualReview(comment, acceptance, runId, artifact) {
  assert.equal(comment.user?.login, 'vellxw', 'Visual review must be an explicit repository-owner action');
  assert.equal(comment.author_association, 'OWNER');
  const body = comment.body ?? '';
  assert.ok(body.startsWith('<!-- perfect-desktop-visual-review:v1 -->'));
  const matches = [...body.matchAll(/```json\s*([\s\S]*?)```/g)];
  assert.equal(matches.length, 1, 'One unambiguous review record is required');
  const review = JSON.parse(matches[0][1]);
  assert.equal(review.sourceCommit, acceptance.sourceCommit);
  assert.equal(review.acceptanceRunId, Number(runId));
  assert.equal(review.evidenceArtifactId, artifact.id);
  assert.equal(review.evidenceArtifactSha256, artifact.digest?.replace(/^sha256:/, ''));
  assert.equal(review.verdict, 'approved');
  assert.ok(typeof review.notes === 'string' && review.notes.trim().length >= 20);
  assert.ok(Array.isArray(review.reviewedFiles));
  assert.equal(new Set(review.reviewedFiles.map(f => f.path)).size, review.reviewedFiles.length);
  const expected = new Map(acceptance.files.map(f => [f.path, f]));
  for (const file of review.reviewedFiles) assert.equal(file.sha256, expected.get(file.path)?.sha256, 'Review refers to other bytes: ' + file.path);
  for (const video of acceptance.files.filter(f => f.kind === 'video')) assert.ok(review.reviewedFiles.some(f => f.path === video.path), 'Every video must be inspected');
  assert.ok(review.reviewedFiles.filter(f => expected.get(f.path)?.kind === 'screenshot').length >= 8, 'Inspect representative real screens, not only one cover');
  return review;
}
