import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// This journey uses the normal UI, controller, Docker verifiers and Judge.
// Only the deliberately selected historical reservation provider is synthetic.
const root = await mkdtemp(join(tmpdir(), 'perfect-v5-goal-loop-'));
const home = join(root, 'state'), workspace = join(root, 'workspace');
const out = resolve(process.env.PERFECT_ARTIFACT_DIR ?? 'test-results/desktop/goal-loop');
await Promise.all([mkdir(home, { recursive: true }), mkdir(workspace, { recursive: true }), mkdir(out, { recursive: true })]);
const hostReadme = '# Workspace anfitrión\nLa demostración se ejecuta en su propio fixture temporal.\n';
await writeFile(join(workspace, 'README.md'), hostReadme);
const build = JSON.parse(await readFile('desktop/build-info.json', 'utf8'));
const startedAt = new Date().toISOString(), pageErrors = [], observedStates = [];
let app, page, goalId, demoWorkspace;
const launch = async (folder, record = false) => electron.launch({
  args: [resolve('desktop'), '--home', home, '--workspace', folder],
  ...(record ? { recordVideo: { dir: join(out, 'video'), size: { width: 1440, height: 900 } } } : {}),
  timeout: 30000,
});
const frame = async (name) => page.screenshot({ path: join(out, name + '.png') });
const boot = () => page.evaluate(() => window.perfect.boot());
async function waitState(expected, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const b = await boot(), goal = b.snapshot?.goal;
    if (goal && observedStates.at(-1)?.state !== goal.state) {
      observedStates.push({ state: goal.state, at: new Date().toISOString(), revision: goal.revision });
      console.log('Observed controller state:', goal.state);
      await frame('state-' + String(observedStates.length).padStart(2, '0') + '-' + goal.state);
    }
    if (goal?.state === expected && !b.snapshot.busy) return b;
    if (goal && ['FAILED', 'ABORTED'].includes(goal.state) && goal.state !== expected)
      throw Error('Unexpected terminal state: ' + JSON.stringify(goal));
    await page.waitForTimeout(250);
  }
  throw Error('Goal did not reach idle ' + expected + ': ' + JSON.stringify((await boot()).snapshot?.goal));
}
async function confirm(phrase, title) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.getByLabel('Confirmación', { exact: true }).fill(phrase);
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
try {
  app = await launch(workspace, true);
  page = await app.firstWindow();
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.locator('.connection').filter({ hasText: 'Motor conectado' }).waitFor({ timeout: 30000 });
  const initial = await boot();
  assert.equal(initial.buildId, build.sourceCommit);
  assert.equal(initial.version, build.version);
  await frame('01-home');
  await page.getByRole('button', { name: 'Probar el Goal Loop', exact: true }).click();
  await confirm('DEMOSTRAR', 'Demostración verificable');
  const paused = await waitState('PAUSED', 60000);
  assert.match(paused.snapshot.goal.reason ?? '', /PLAN_APPROVAL/i);
  assert.equal(paused.snapshot.goal.mode, 'mock');
  goalId = paused.snapshot.goal.id;
  demoWorkspace = paused.snapshot.workspace;
  assert.notEqual(demoWorkspace, workspace, 'Demo must not modify the host workspace');
  await frame('02-plan-approval-required');
  await page.getByRole('button', { name: 'Revisar plan', exact: true }).click();
  await page.getByRole('heading', { name: 'Plan de trabajo', exact: true }).waitFor();
  await frame('03-plan');
  await page.getByRole('button', { name: 'Aprobar plan', exact: true }).click();
  await confirm('APROBAR', 'Aprobar el plan');
  await page.getByRole('button', { name: 'Trabajo', exact: true }).click();
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  const done = await waitState('DONE', 240000);
  assert.equal(done.snapshot.goal.id, goalId);
  assert.ok(done.snapshot.verification.passed >= 2, JSON.stringify(done.snapshot.verification));
  await frame('04-done');
  await page.getByRole('button', { name: 'Ver cambios', exact: true }).click();
  await page.getByRole('heading', { name: 'Cambios', exact: true }).waitFor();
  await frame('05-diff');
  await page.getByRole('button', { name: 'Aplicar al proyecto', exact: true }).click();
  await confirm('APLICAR', 'Aplicar cambios verificados');
  assert.deepEqual(pageErrors, []);
  await app.close(); app = undefined;

  app = await launch(demoWorkspace);
  page = await app.firstWindow();
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.locator('.connection').filter({ hasText: 'Motor conectado' }).waitFor({ timeout: 30000 });
  const persisted = await boot();
  assert.equal(persisted.snapshot.goal?.id, goalId);
  assert.equal(persisted.snapshot.goal?.state, 'DONE');
  assert.equal(persisted.buildId, initial.buildId);
  assert.equal(persisted.snapshot.busy, false);
  await frame('06-reopened');
  await app.close(); app = undefined;

  const { SqliteStore } = await import('../../dist/adapters/sqlite/store.js');
  const { GitWorkspace, manifest } = await import('../../dist/adapters/git/workspace.js');
  const { ConfigSchema } = await import('../../dist/config/schema.js');
  const db = new SqliteStore(join(home, 'state.sqlite'));
  try {
    const goal = db.get('goals', goalId), failures = db.list('failures', goalId);
    const events = db.events(goalId), verifications = db.list('verifications', goalId), reviews = db.list('reviews', goalId);
    const decisions = events.filter(e => e.type === 'judge.decided');
    assert.equal(goal?.state, 'DONE');
    assert.equal(db.list('goals').length, 1, 'Reopening must not create a duplicate goal');
    assert.ok(failures.length >= 1, 'Expected deliberate verifier failure');
    assert.ok(failures.some(f => f.resolvedAt), 'Expected a resolved failure');
    assert.ok(decisions.some(e => e.payload.done === true), 'Judge did not accept the evidence');
    assert.ok(verifications.some(v => v.status === 'failed'), 'No failed verifier attempt recorded');
    assert.ok(verifications.some(v => v.status === 'passed' && v.revision === goal.candidateRevision), 'No passing check for final candidate');
    assert.ok(reviews.some(r => r.decision === 'approve' && r.purpose === 'acceptance' && r.revision === goal.candidateRevision), 'No current acceptance review');
    assert.ok(events.some(e => e.type === 'apply.completed'), 'UI apply did not complete');
    assert.ok(db.list('intents', goalId).filter(i => i.kind === 'apply').every(i => i.status === 'completed'), 'Uncertain apply');
    const cfg = ConfigSchema.parse(goal.configSnapshot), candidate = new GitWorkspace(goal.root, cfg);
    assert.deepEqual((await manifest(goal.source, cfg)).files, (await manifest(candidate.repo, cfg)).files, 'Applied source differs from verified candidate');
    assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), hostReadme);
    await writeFile(join(out, 'controller-evidence.json'), JSON.stringify({
      goalId, candidateRevision: goal.candidateRevision,
      failures: failures.map(f => ({ id: f.id, category: f.category, resolvedAt: f.resolvedAt })),
      verifications: verifications.map(v => ({ id: v.id, specId: v.specId, status: v.status, revision: v.revision, evidenceIds: v.evidenceIds })),
      reviews: reviews.map(r => ({ id: r.id, role: r.role, decision: r.decision, purpose: r.purpose, revision: r.revision })),
      judgeEvents: decisions, applyEvents: events.filter(e => e.type.startsWith('apply.')), observedStates,
    }, null, 2));
  } finally { db.close(); }
  assert.deepEqual(pageErrors, []);
  await writeFile(join(out, 'result.json'), JSON.stringify({
    passed: true, goalId, sourceCommit: initial.buildId, version: initial.version,
    startedAt, finishedAt: new Date().toISOString(), platform: process.platform,
    capture: { method: 'Playwright Electron content recording, continuous 1x, not whole desktop', width: 1440, height: 900 },
    hostReadmeSha256: createHash('sha256').update(hostReadme).digest('hex'),
    kind: 'Real controller, scheduler, files, Docker, browser, repair, review, Judge and apply. Explicit historical mock providers; no live account or Pi inference certification.',
  }, null, 2));
  console.log('Desktop Goal Loop PASS: real failed verification, repair, current Judge acceptance, UI apply and restart persistence.');
} catch (error) {
  if (page && app) await frame('failure').catch(() => {});
  const body = page && app ? await page.locator('body').innerText().catch(() => '') : '';
  await writeFile(join(out, 'failure.json'), JSON.stringify({ error: String(error), body, goalId, pageErrors, observedStates, build }, null, 2));
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
