// Temporary source changes for execution cancellation and platform confinement; removed after materialization.
import {readFile,writeFile} from 'node:fs/promises';
async function edit(path,fn){const before=await readFile(path,'utf8'),after=fn(before);await writeFile(path,after);console.log(path,before===after?'unchanged':'updated');}
await edit('src/presentation/engine.ts',s=>{
 s=s.replace('private activeGoal?: string;','private activeGoal?: string;\n  private activeKind?: "goal" | "verification" | "preparation";\n  private actionQueue: Promise<void> = Promise.resolve();');
 s=s.replace('this.activeGoal = goal.id;\n    this.activeAbort','this.activeGoal = goal.id;\n    this.activeKind = "goal";\n    this.activeAbort');
 s=s.replace('async dispatch(requestId: string, raw: unknown): Promise<void> {','dispatch(requestId: string, raw: unknown): Promise<void> {\n    const next = this.actionQueue.then(() => this.perform(requestId, raw));\n    this.actionQueue = next.catch(() => {});\n    return next;\n  }\n  private async perform(requestId: string, raw: unknown): Promise<void> {');
 s=s.replace('await controlGoal(ctx, ctx.goal(action.goalId), action.type);','if (this.activeGoal === action.goalId && this.activeKind !== "goal") this.activeAbort?.abort(new Error("User stopped manual operation"));\n          await controlGoal(ctx, ctx.goal(action.goalId), action.type);');
 s=s.replace('this.activeGoal = goal.id;\n          this.active =','this.activeGoal = goal.id;\n          this.activeKind = "verification";\n          this.active =');
 const start=s.indexOf('        case "prepare": {'),end=s.indexOf('        case "refresh":',start);if(start<0||end<0)throw Error('prepare anchors missing');
 s=s.slice(0,start)+`        case "prepare": {
          this.idle();
          const goal = ctx.goal(action.goalId);
          this.activeAbort = new AbortController();
          this.activeGoal = goal.id;
          this.activeKind = "preparation";
          const signal = AbortSignal.any([this.activeAbort.signal, AbortSignal.timeout(goalConfig(goal).limits.timeoutPerTask)]);
          this.active = prepareDependencies({goal,config:goalConfig(goal),store:this.store,home:this.home,allowNetwork:true,render:action.render,signal})
            .then(() => { this.send({type:"result",requestId,ok:true,message:"Approved dependency image prepared"}); })
            .catch(error => { this.send({type:"fault",message:text(error)}); })
            .finally(() => { this.active=undefined;this.activeGoal=undefined;this.activeKind=undefined;this.activeAbort=undefined;this.publish(); });
          message = "Preparing the approved dependency image; Pause cancels safely";
          break;
        }
`+s.slice(end);
 s=s.replace('if (this.closing) return;\n    this.authAbort?.abort();','if (this.closing) return;\n    await this.actionQueue;\n    this.authAbort?.abort();\n    if(this.activeKind && this.activeKind !== "goal") this.activeAbort?.abort(new Error("UI closed"));');
 return s;
});
await edit('src/ui/tui/app.tsx',s=>s.replace('if (confirmation || auth?.promptId) return;','if (confirmation) return;\n    if (auth?.promptId) {\n      if (key.name === "escape" || (key.ctrl && key.name === "c")) { key.preventDefault(); mutate({type:"auth-cancel"}); setAuth(undefined); navigate("home"); }\n      return;\n    }'));
for(const path of ['src/adapters/sandbox/docker.ts','src/adapters/sandbox/dependencies.ts'])await edit(path,s=>s.replaceAll('/[:,\\n]/.test(dir)','/[:,\\n]/.test(dir.replace(/^[A-Za-z]:/, ""))').replaceAll('/[:,\\n]/.test(request.artifactsDir)','/[:,\\n]/.test(request.artifactsDir.replace(/^[A-Za-z]:/, ""))'));
