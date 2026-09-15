import {mkdir,readFile,writeFile,readdir}from'node:fs/promises';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
const [mode,packageRoot,home,workspace]=process.argv.slice(2);if(!['seed','verify'].includes(mode)||!packageRoot||!home||!workspace)throw Error('Expected seed/verify packageRoot home workspace');
const root=resolve(packageRoot),load=name=>import(pathToFileURL(join(root,'app','dist',name)).href),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const {SqliteStore}=await load('adapters/sqlite/store.js'),{defaultConfig}=await load('config/schema.js'),{createGoal}=await load('application/goals.js'),{SkillsRegistry}=await load('skills/registry.js'),{saveCredential,loadCredential}=await load('integrations/credentials.js');
await mkdir(home,{recursive:true});await mkdir(workspace,{recursive:true});const store=new SqliteStore(join(home,'state.sqlite')),base=defaultConfig(),registry=new SkillsRegistry(store);
try{
 if(mode==='seed'){
  const goal=await createGoal({request:'Fixture sintético de actualización, sin inferencias',source:workspace,home,config:base,privacy:'private',mode:'mock'},store);store.put('goals',{...goal,state:'PAUSED',pauseReason:'UPGRADE_FIXTURE'},'upgrade.fixture.created');
  const studio=registry.get(goal.source,base);await saveCredential(home,'PERFECT_UPGRADE_FIXTURE','synthetic-upgrade-value-not-a-personal-account');
  await writeFile(join(home,'ui.json'),JSON.stringify({ui:{motion:'off',contrast:'normal',transparent:true,onboarded:true}}));
  const expected={goalId:goal.id,source:goal.source,goalHash:hash(store.get('goals',goal.id)),studioHash:hash(studio),snapshotHash:hash(store.get('studioSnapshots',goal.studioSnapshotId)),credentialHash:hash(await loadCredential(home,'PERFECT_UPGRADE_FIXTURE')),ui:await readFile(join(home,'ui.json'),'utf8')};
  await writeFile(join(home,'upgrade-expected.json'),JSON.stringify(expected));console.log('UPGRADE_SYNTHETIC_DATA_SEEDED');
 }else{
  const expected=JSON.parse(await readFile(join(home,'upgrade-expected.json'),'utf8')),goal=store.get('goals',expected.goalId);
  if(!goal||hash(goal)!==expected.goalHash||hash(registry.get(expected.source,base))!==expected.studioHash||hash(store.get('studioSnapshots',goal.studioSnapshotId))!==expected.snapshotHash)throw Error('Goal/config/snapshot changed unexpectedly during upgrade');
  if(hash(await loadCredential(home,'PERFECT_UPGRADE_FIXTURE'))!==expected.credentialHash)throw Error('DPAPI credential did not survive upgrade');
  if(await readFile(join(home,'ui.json'),'utf8')!==expected.ui)throw Error('UI preferences changed during installation');
  const {control,selectManual,selectionClosure}=await load('skills/control.js');if(control(store,expected.source).manual.length)throw Error('Migration must start with an empty manual selection');
  const record=registry.get(expected.source,base),config=structuredClone(record.config);config.skills.mode='manual';registry.update(expected.source,base,record.hash,config);
  const skill=store.list('skillReleases').find(s=>s.skillId==='perfect-postgres-backend');if(!skill)throw Error('Missing packaged skill');selectManual(store,expected.source,base,skill.id,skill.hash,true,control(store,expected.source).epoch,selectionClosure(store,expected.source,skill.id));
  const backups=(await readdir(home)).filter(n=>n.endsWith('.before-v4-complete.sqlite'));if(!backups.length)throw Error('Migration did not create the expected SQLite backup');
  console.log('UPGRADE_GOALS_SKILLS_SNAPSHOTS_DPAPI_PREFERENCES_PRESERVED');
 }
}finally{store.close();}
