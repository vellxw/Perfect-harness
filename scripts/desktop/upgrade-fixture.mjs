import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const [mode, packagePath, dataPath, workspacePath] = process.argv.slice(2);
if (!['seed', 'verify', 'verify-backup'].includes(mode) || !packagePath || !dataPath || !workspacePath) throw Error('Expected seed/verify/verify-backup package home workspace');
const root = resolve(packagePath), home = resolve(dataPath), workspace = resolve(workspacePath);
let dist = join(root, 'resources', 'engine', 'dist');
try { await access(dist); } catch { dist = join(root, 'app', 'dist'); }
const load = name => import(pathToFileURL(join(dist, name)).href);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const { SqliteStore } = await load('adapters/sqlite/store.js');
const { defaultConfig } = await load('config/schema.js');
const { createGoal } = await load('application/goals.js');
const { SkillsRegistry } = await load('skills/registry.js');
const { control, selectManual, selectionClosure } = await load('skills/control.js');
const { saveCredential, loadCredential } = await load('integrations/credentials.js');
await mkdir(home, { recursive: true });await mkdir(workspace, { recursive: true });
const store = new SqliteStore(join(home, 'state.sqlite')), base = defaultConfig(), registry = new SkillsRegistry(store);
const expectedPath = join(home, 'upgrade-expected.json');
try {
  if (mode === 'seed') {
    assert.equal(JSON.parse(await readFile(join(root, 'build-manifest.json'), 'utf8')).version, '0.4.0');
    await writeFile(join(workspace, 'README.md'), '# Migración V4 → V5\nProyecto sintético para comprobar preservación.\n');
    const goal = await createGoal({ request: 'Fixture sintético de actualización, sin inferencias', source: workspace, home, config: base, privacy: 'private', mode: 'mock' }, store);
    store.put('goals', { ...goal, state: 'PAUSED', pauseReason: 'UPGRADE_FIXTURE' }, 'upgrade.fixture.created');
    const before = registry.get(goal.source, base), config = structuredClone(before.config);
    assert.ok(config.sets.length && config.profiles.length);
    config.sets[0].name = 'Equipo conservado V4';config.profiles[0].name = 'Perfil conservado V4';config.skills.mode = 'manual';
    registry.update(goal.source, base, before.hash, config);
    const skill = store.list('skillReleases').find(s => s.skillId === 'perfect-postgres-backend');
    assert.ok(skill, 'Packaged V4 skill missing');
    selectManual(store, goal.source, base, skill.id, skill.hash, true, control(store, goal.source).epoch, selectionClosure(store, goal.source, skill.id));
    await saveCredential(home, 'PERFECT_UPGRADE_FIXTURE', 'synthetic-upgrade-value-not-a-personal-account');
    await writeFile(join(home, 'ui.json'), JSON.stringify({ ui: { motion: 'off', contrast: 'normal', transparent: true, onboarded: true } }));
    const expected = {
      goalId: goal.id, source: goal.source, goalHash: hash(store.get('goals', goal.id)),
      studioHash: hash(registry.get(goal.source, base)), selectionHash: hash(control(store, goal.source)),
      snapshotHash: hash(store.get('studioSnapshots', goal.studioSnapshotId)),
      credentialHash: hash(await loadCredential(home, 'PERFECT_UPGRADE_FIXTURE')),
      ui: await readFile(join(home, 'ui.json'), 'utf8'), readme: await readFile(join(workspace, 'README.md'), 'utf8'),
    };
    await writeFile(expectedPath, JSON.stringify(expected));
    console.log('V4 fixture seeded using the actual packaged V4 modules; no provider inference or personal credentials.');
  } else {
    const expected = JSON.parse(await readFile(expectedPath, 'utf8')), goal = store.get('goals', expected.goalId);
    assert.ok(goal);assert.equal(hash(goal), expected.goalHash, 'Goal changed during upgrade');
    assert.equal(hash(registry.get(expected.source, base)), expected.studioHash, 'Teams/profiles/config changed');
    assert.equal(hash(control(store, expected.source)), expected.selectionHash, 'Manual selection changed');
    assert.equal(hash(store.get('studioSnapshots', goal.studioSnapshotId)), expected.snapshotHash, 'Immutable snapshot changed');
    assert.equal(hash(await loadCredential(home, 'PERFECT_UPGRADE_FIXTURE')), expected.credentialHash, 'DPAPI credential changed');
    assert.equal(await readFile(join(home, 'ui.json'), 'utf8'), expected.ui, 'Preferences changed');
    assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), expected.readme, 'Project changed');
    if (mode === 'verify-backup') {
      const receipt = JSON.parse(await readFile(join(home, 'desktop-migration-v5.json'), 'utf8'));
      assert.equal(receipt.status, 'complete');assert.equal(receipt.product, 'perfect-desktop-v5');
      const dir = resolve(home, receipt.backupDirectory), rel = relative(home, dir);
      assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'));
      const backupFile = join(dir, 'state.sqlite'), bytes = await readFile(backupFile);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.files.find(f => f.name === 'state.sqlite').sha256);
      const db = new DatabaseSync(backupFile, { readOnly: true });
      try {
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
        assert.equal(hash(JSON.parse(db.prepare("SELECT body FROM entities WHERE kind='goals' AND id=?").get(expected.goalId).body)), expected.goalHash);
      } finally { db.close(); }
    }
    console.log('V4_TO_V5_PRESERVED: goal, immutable snapshot, customized team/profile, manual version selection, UI, project and synthetic DPAPI credential' + (mode === 'verify-backup' ? '; WAL-consistent backup verified' : ''));
  }
} finally { store.close(); }
