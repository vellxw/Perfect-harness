import fs from 'node:fs';
const fix=(p,a,b)=>{const s=fs.readFileSync(p,'utf8');if(s.split(a).length!==2)throw Error('Fix anchor '+p+' '+a.slice(0,100));fs.writeFileSync(p,s.replace(a,b));};
fix('src/skills/experiments.ts','requiredReviews:[]} as Task','requiredReviews:[],model:trial.profile.binding.model,reasoning:trial.profile.binding.reasoning,triggerFailureIds:[]} as Task');
fix('src/skills/experiments.ts','environment=check.environment;','environment=check.environment??{metadata:"not-reported"};');
fix('src/skills/experiments.ts','!goal||!goal.source.startsWith(t.workspace)&&!store.events(goal.id)','!goal||!store.events(goal.id)');
fix('src/skills/experiments.ts','AgentProfile, StudioConfig, SkillRelease','AgentProfile, StudioConfig');
fix('src/skills/experiments.ts','Goal, Usage, Task','Usage, Task');
console.log('Correct Task contract, optional environment metadata and strict evaluation-goal linkage.');
