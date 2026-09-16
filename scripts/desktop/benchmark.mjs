import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, cpus, totalmem, release } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Production bundles, real Electron/engine/SQLite/IPC. The stress workload is
// explicitly synthetic and cannot certify provider throughput or a completed goal.
const quick = process.argv.includes('--screening');
const directory = await mkdtemp(join(tmpdir(), 'perfect-v5-benchmark-'));
const output = resolve(process.env.PERFECT_ARTIFACT_DIR ?? 'test-results/desktop/performance');
await mkdir(output, { recursive: true });
const identity = JSON.parse(await readFile('desktop/build-info.json', 'utf8'));
const report = {
  schemaVersion: 1, ...identity, status: 'RUNNING', mode: quick ? 'SCREENING_NOT_ACCEPTANCE' : 'FULL',
  environment: { os: process.platform, kernel: release(), cpu: cpus()[0]?.model, logicalProcessors: cpus().length, ramBytes: totalmem(), node: process.version, ci: Boolean(process.env.CI) },
  method: {
    startup: 'External monotonic clock before Electron spawn to first visible enabled composer, with motor-ready recorded separately. Fresh user data vs reused user data; OS disk cache is NOT forcibly flushed.',
    input: 'Real keyboard input event to second requestAnimationFrame after the committed controlled textarea value; automation transport excluded from this latency.',
    click: 'Real pointer click to second animation frame with expected UI state; no time dilation.',
    rss: 'Sum of Linux /proc VmRSS over the whole Electron descendant process tree, including the separate Node engine. Shared pages may be counted multiple times; raw process samples retained.',
    cpu: 'Delta of process-tree user/system CPU seconds divided by elapsed wall seconds, expressed as percent of ONE logical core; not divided by CPU count.',
    stress: '20,000 recorded SQLite events from four concurrent timer streams and 500 validated synthetic task specs; no inference, no accepted task or DONE state.',
    limitations: 'Virtual Linux display performance, not personal Windows 11 hardware. Native final Windows payload has a separate execution gate. Ten samples per start class are a small sample, not population certainty.',
  },
  launches: [], inputMs: [], clickMs: [], idle: [], soak: [], checks: [], errors: [],
};
let app, page, db, engineHome, workspace, fixtureGoal;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const percentile = (a, p) => { const sorted = [...a].sort((x, y) => x - y); return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null; };
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
async function boot() { return page.evaluate(() => window.perfect.boot()); }
async function action(operation, payload) {
  return page.evaluate(async ({ operation, payload }) => {
    const b = await window.perfect.boot();
    const result = await window.perfect.request({ protocol: 1, sessionId: b.sessionId, workspaceId: b.workspaceId, requestId: crypto.randomUUID(), operation, payload });
    if (!result.ok) throw Error(result.message);
    return result.data;
  }, { operation, payload });
}
async function launch(home, folder, record = false) {
  const start = performance.now();
  app = await electron.launch({ args: [resolve('desktop'), '--home', home, '--workspace', folder], timeout: 30000, ...(record ? { recordVideo: { dir: join(output, 'motion-video'), size: { width: 1440, height: 900 } } } : {}) });
  page = await app.firstWindow();
  page.on('pageerror', e => report.errors.push(String(e)));
  const composer = page.getByRole('textbox', { name: '¿Qué querés construir?', exact: true });
  await composer.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await composer.isEnabled(), true);
  const interactiveMs = performance.now() - start;
  await page.locator('.connection').filter({ hasText: 'Motor conectado' }).waitFor({ timeout: 30000 });
  const readyMs = performance.now() - start;
  const b = await boot(); assert.equal(b.buildId, identity.sourceCommit);
  return { interactiveMs, readyMs, pid: app.process().pid, at: new Date().toISOString() };
}
async function close() { if (app) { const previous = app; app = undefined; await previous.close(); } }
async function navigate(name) {
  await page.getByRole('button', { name: 'Abrir comandos y navegación' }).click();
  await page.getByRole('textbox', { name: 'Buscar sección' }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar sección' }).waitFor({ state: 'hidden' });
}
async function processSample() {
  if (process.platform !== 'linux') throw Error('This process-tree benchmark is Linux-only; do not silently substitute renderer-only memory.');
  const rootPid = app.process().pid, rows = [];
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = await readFile('/proc/' + name + '/stat', 'utf8');
      const close = stat.lastIndexOf(')'), fields = stat.slice(close + 2).trim().split(/\s+/);
      const status = await readFile('/proc/' + name + '/status', 'utf8');
      rows.push({ pid: Number(name), ppid: Number(fields[1]), startTicks: Number(fields[19]), cpuTicks: Number(fields[11]) + Number(fields[12]), rssBytes: Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) * 1024, name: stat.slice(stat.indexOf('(') + 1, close) });
    } catch { /* Processes may end while enumerating; the active engine is asserted below. */ }
  }
  const included = new Set([rootPid]);
  for (let pass = 0; pass < 10; pass++) for (const row of rows) if (included.has(row.ppid)) included.add(row.pid);
  const processes = rows.filter(row => included.has(row.pid));
  const metrics = await action('metrics');
  assert.ok(metrics.engine?.pid && included.has(metrics.engine.pid), 'Engine process must be included in memory/CPU totals');
  return { at: performance.now(), rssBytes: processes.reduce((n, p) => n + p.rssBytes, 0), processes, enginePid: metrics.engine.pid };
}
function cpuBetween(a, b) {
  const previous = new Map(a.processes.map(p => [p.pid + '/' + p.startTicks, p]));
  // CLK_TCK is obtained from getconf, not assumed to equal the host CPU clock rate.
  const ticks = b.processes.reduce((n, p) => n + Math.max(0, p.cpuTicks - (previous.get(p.pid + '/' + p.startTicks)?.cpuTicks ?? p.cpuTicks)), 0);
  return ticks / report.environment.clockTicks / ((b.at - a.at) / 1000) * 100;
}
async function inputProbe(count) {
  await page.getByRole('button', { name: 'Inicio de Perfect' }).click();
  const box = page.getByRole('textbox', { name: '¿Qué querés construir?', exact: true });
  await box.fill('');
  await page.evaluate(() => {
    window.__perfectInputSamples = [];
    const element = document.querySelector('textarea[aria-label="¿Qué querés construir?"]');
    if (!element) throw Error('Composer absent');
    element.addEventListener('input', () => {
      const start = performance.now(), expected = element.value;
      requestAnimationFrame(() => requestAnimationFrame(() => window.__perfectInputSamples.push({ ms: performance.now() - start, committed: element.value === expected })));
    });
  });
  for (let i = 0; i < count; i++) { await box.press(i % 2 ? 'Backspace' : 'a'); await sleep(40); }
  await sleep(100);
  const samples = await page.evaluate(() => window.__perfectInputSamples);
  assert.ok(samples.length >= count); assert.ok(samples.every(v => v.committed));
  report.inputMs.push(...samples.map(v => v.ms));
}
async function clickProbe(count) {
  const menu = page.getByRole('button', { name: 'Abrir comandos y navegación' });
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => {
      window.__perfectClickResult = null;
      const button = document.querySelector('button[aria-label="Abrir comandos y navegación"]');
      button.addEventListener('click', () => {
        const at = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__perfectClickResult = { ms: performance.now() - at, visible: Boolean(document.querySelector('dialog[open] input[aria-label="Buscar sección"]')) }; }));
      }, { once: true });
    });
    await menu.click();
    await page.waitForFunction(() => window.__perfectClickResult !== null);
    const sample = await page.evaluate(() => window.__perfectClickResult);
    assert.ok(sample.visible); report.clickMs.push(sample.ms);
    await page.keyboard.press('Escape');
  }
}
async function seedStress() {
  const { SqliteStore } = await import('../../dist/adapters/sqlite/store.js');
  const { defaultConfig } = await import('../../dist/config/schema.js');
  const { createGoal } = await import('../../dist/application/goals.js');
  const { TaskSpecSchema } = await import('../../dist/domain/model.js');
  db = new SqliteStore(join(engineHome, 'state.sqlite'));
  fixtureGoal = await createGoal({ request: 'RENDIMIENTO · DATOS SINTÉTICOS. No es una ejecución aceptada ni una medición de modelos.', source: workspace, home: engineHome, config: defaultConfig(), privacy: 'private', mode: 'mock' }, db);
  db.put('goals', { ...fixtureGoal, state: 'PAUSED', pauseReason: 'PERFORMANCE_FIXTURE_ONLY' }, 'goal.paused');
  db.transaction(() => {
    for (let i = 0; i < 500; i++) {
      const id = 'perf-task-' + i;
      const spec = TaskSpecSchema.parse({ id, title: 'Tarea sintética ' + i, description: 'Carga de presentación, sin código ejecutado ni aprobación de resultados.', type: 'general', assignedAgent: 'general', ownedFiles: ['fixture/' + i], acceptanceCriteria: ['fixture'] });
      db.put('tasks', { ...spec, goalId: fixtureGoal.id, planId: 'perf-only', status: 'pending', attempt: 0, maxAttempts: 3, baseRevision: fixtureGoal.candidateRevision, dependencyOutputVersions: {}, outputs: [], evidence: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, 'task.created');
    }
  });
  await action('action', { type: 'refresh' });
  await page.waitForFunction(id => window.perfect.boot().then(b => b.snapshot.goal?.id === id && b.snapshot.tasks.length === 500), fixtureGoal.id);
  const frame = join(fixtureGoal.root, 'artifacts', 'captura-real-de-la-prueba.png');
  await mkdir(join(fixtureGoal.root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: frame });
  const digest = createHash('sha256').update(await readFile(frame)).digest('hex');
  db.put('evidence', { id: 'perf-image', goalId: fixtureGoal.id, kind: 'screenshot', producer: 'controller', artifactRef: frame, contentHash: digest, revision: fixtureGoal.candidateRevision, environmentHash: 'performance-fixture', criteriaIds: [], capturedAt: new Date().toISOString(), validity: 'valid' }, 'evidence.created');
  await action('action', { type: 'refresh' });
}
async function streamStress(total) {
  const start = performance.now(); let recorded = 0;
  const writers = Array.from({ length: 4 }, (_, channel) => new Promise((resolveWriter, reject) => {
    let count = 0;
    const timer = setInterval(() => {
      try {
        db.transaction(() => { for (let i = 0; i < 20 && count < total / 4; i++, count++, recorded++) db.event(fixtureGoal.id, 'plan.perf_stream', { channel, ordinal: count, reason: `Stream sintético ${channel} · actualización ${count}` }, 'test-provider'); });
        if (count >= total / 4) { clearInterval(timer); resolveWriter(); }
      } catch (error) { clearInterval(timer); reject(error); }
    }, 40);
  }));
  await Promise.all([Promise.all(writers), (async () => {
    await navigate('Tareas'); const list = page.locator('.virtual-list').first();
    for (let i = 0; i < 30; i++) { await list.hover(); await page.mouse.wheel(0, i % 2 ? -600 : 600); await sleep(100); }
  })()]);
  await sleep(200);
  const snapshot = (await boot()).snapshot;
  assert.equal(recorded, total); assert.equal(snapshot.tasks.length, 500);
  assert.equal(snapshot.goal.state, 'PAUSED'); assert.ok(snapshot.activity.length <= 200);
  report.stress = { events: recorded, streams: 4, tasks: snapshot.tasks.length, ms: performance.now() - start, maxProjectedActivity: snapshot.activity.length, projectedBytes: Buffer.byteLength(JSON.stringify(snapshot)) };
  await page.screenshot({ path: join(output, 'tasks-stress.png') });
}
async function mediaCycles(count) {
  await navigate('Resultados');
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: 'captura-real-de-la-prueba.png', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Visor de resultado', exact: true });
    await dialog.getByRole('img').evaluate(img => img.decode());
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  report.mediaCycles = count;
}
function budget(name, observed, limit, unit) {
  const pass = Number.isFinite(observed) && observed <= limit;
  report.checks.push({ name, status: pass ? 'PASS' : 'FAIL', observed, limit, unit });
}
try {
  const { execFileSync } = await import('node:child_process');
  report.environment.clockTicks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
  assert.ok(report.environment.clockTicks > 0);
  const rounds = quick ? 2 : 10;
  const reused = join(directory, 'reused-home');
  workspace = join(directory, 'project'); await mkdir(workspace); await writeFile(join(workspace, 'README.md'), '# Proyecto sintético de rendimiento\n');
  for (const kind of ['fresh-user-data', 'reused-user-data']) for (let i = 0; i < rounds; i++) {
    const home = kind === 'fresh-user-data' ? join(directory, 'cold-' + i) : reused;
    await mkdir(home, { recursive: true });
    const sample = await launch(home, workspace);
    report.launches.push({ kind, ...sample });
    await close(); await sleep(150); await save();
  }
  engineHome = reused;
  await launch(engineHome, workspace);
  report.environment.display = await page.evaluate(() => ({ width: screen.width, height: screen.height, viewport: [innerWidth, innerHeight], devicePixelRatio }));
  await inputProbe(quick ? 20 : 200); await clickProbe(quick ? 10 : 50);
  await page.getByRole('textbox', { name: '¿Qué querés construir?', exact: true }).fill('');
  await sleep(8000); // Allow toasts/initial discovery to settle before idle accounting.
  let previous = await processSample();
  const idleStart = performance.now();
  for (let i = 0; i < (quick ? 2 : 60); i++) {
    await sleep(5000); const current = await processSample();
    report.idle.push({ ...current, cpuPercentOfOneCore: cpuBetween(previous, current) }); previous = current;
    if (i % 12 === 0) { console.log('Idle samples:', i + 1); await save(); }
  }
  report.idleDurationMs = performance.now() - idleStart;
  await close();
  await launch(engineHome, workspace, true);
  await seedStress();
  const motionStart = performance.now();
  await page.evaluate(() => {
    window.__perfectFrames = []; let before = performance.now();
    const sample = time => { window.__perfectFrames.push(time - before); before = time; if (window.__perfectFrames.length < 5000) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  await streamStress(quick ? 800 : 20000);
  const mediaBefore = await processSample(); await mediaCycles(quick ? 3 : 50); await sleep(1000);
  const mediaAfter = await processSample();
  report.mediaMemory = { before: mediaBefore.rssBytes, after: mediaAfter.rssBytes, delta: mediaAfter.rssBytes - mediaBefore.rssBytes };
  for (const [width, height] of [[900, 600], [1280, 720], [1440, 900], [1920, 1080]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
    await navigate('Habilidades'); await sleep(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    assert.equal(overflow, false, 'Horizontal document overflow at ' + width);
    await page.screenshot({ path: join(output, 'skills-' + width + '.png') });
  }
  while (!quick && performance.now() - motionStart < 65000) {
    await navigate('Tareas'); await page.mouse.wheel(0, 700); await sleep(250); await navigate('Habilidades'); await sleep(250);
  }
  report.animation = await page.evaluate(() => { const values = window.__perfectFrames.slice(2); values.sort((a, b) => a - b); return { frames: values.length, p95Ms: values[Math.ceil(values.length * .95) - 1], over34ms: values.filter(n => n > 34).length, method: 'requestAnimationFrame intervals during real activity, independent of recording frame rate' }; });
  await close();
  budget('Cold process startup p95 (fresh profile)', percentile(report.launches.filter(x => x.kind === 'fresh-user-data').map(x => x.interactiveMs), .95), 2000, 'ms');
  budget('Warm process startup p95 (reused profile)', percentile(report.launches.filter(x => x.kind === 'reused-user-data').map(x => x.interactiveMs), .95), 1000, 'ms');
  budget('Input to visible controlled value p95', percentile(report.inputMs, .95), 50, 'ms');
  budget('Click to visible palette p95', percentile(report.clickMs, .95), 100, 'ms');
  budget('Idle process tree memory p95', percentile(report.idle.map(x => x.rssBytes / 1048576), .95), 450, 'MiB');
  budget('Idle CPU mean', report.idle.reduce((n, v) => n + v.cpuPercentOfOneCore, 0) / report.idle.length, 1, '% of one logical core');
  // Capture/display jitter is reported; it cannot certify a personal 60/100 Hz GPU.
  if (quick) { report.status = 'SCREENING_NOT_ACCEPTANCE'; await save(); }
  else {
    const failures = report.checks.filter(c => c.status !== 'PASS');
    if (failures.length) throw Error('Performance budgets not met; soak not claimed: ' + failures.map(f => f.name + '=' + f.observed).join('; '));
    await launch(engineHome, workspace);
    const soakStart = performance.now();
    while (performance.now() - soakStart < 30 * 60 * 1000) {
      await navigate('Habilidades'); await sleep(1000); await navigate('Tareas');
      if (report.soak.length % 10 === 0) await mediaCycles(1);
      await sleep(10000);
      const sample = await processSample(); report.soak.push(sample);
      if (report.soak.length % 10 === 0) { console.log('Soak elapsed minutes:', ((performance.now() - soakStart) / 60000).toFixed(1)); await save(); }
    }
    report.soakDurationMs = performance.now() - soakStart;
    assert.ok(report.soakDurationMs >= 1800000);
    await action('restart-engine');
    await page.locator('.connection').filter({ hasText: 'Motor conectado' }).waitFor();
    assert.equal((await boot()).snapshot.goal.id, fixtureGoal.id);
    report.checks.push({ name: '30 minute session and engine recovery', status: 'PASS' });
    assert.deepEqual(report.errors, []); report.status = 'PASS'; await save();
  }
} catch (error) {
  report.status = 'FAIL'; report.error = String(error);
  if (page && app) { await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); report.visibleFailure = await page.locator('body').innerText().catch(() => ''); }
  await save(); throw error;
} finally {
  await close().catch(e => { report.closeError = String(e); });
  db?.close(); report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, mode: report.mode, checks: report.checks, launches: report.launches, error: report.error }, null, 2));
  await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
