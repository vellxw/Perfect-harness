import type{StateStore}from"../ports/state-store.js";
import type{ExecutionRunner}from"../ports/execution.js";
import type{PerfectConfig}from"../config/schema.js";
import{BudgetManager}from"../application/budget.js";
import{OwnershipManager}from"../application/ownership.js";
import{Blocked,now}from"../domain/util.js";

/** Explicit recovery, never stealing a live owner or replaying uncertain provider calls. */
export async function recoverTrial(store:StateStore,runner:ExecutionRunner,base:PerfectConfig,workspace:string,trialId:string,confirmation:string){
 if(confirmation!=="RECUPERAR")throw new Blocked("EVAL_RECOVERY_APPROVAL","Revisá la interrupción y confirmá RECUPERAR");
 const trial=store.get("skillTrials",trialId);
 if(!trial||trial.workspace!==workspace||!["running","cancelled","interrupted"].includes(trial.status))throw new Blocked("EVAL_RECOVERY_STATE","La evaluación no requiere recuperación en esta carpeta");
 if(trial.ownerPid){
  try{process.kill(trial.ownerPid,0);throw new Blocked("EVAL_OWNER_ALIVE","El controlador anterior sigue activo; cancelalo desde esa sesión antes de recuperar");}
  catch(error){if(error instanceof Blocked)throw error;if((error as NodeJS.ErrnoException).code!=="ESRCH")throw new Blocked("EVAL_OWNER_UNKNOWN","No se confirmó que el proceso haya terminado");}
 }
 const linked=store.list("goals").filter(g=>store.events(g.id).some(e=>e.type==="skill.trial_link"&&(e.payload as{trialId?:string}).trialId===trialId));
 for(const goal of linked){
  await runner.recover(goal.id);
  const budget=new BudgetManager(store,goal.id,base);
  for(const run of store.list("runs",goal.id).filter(r=>r.status==="running")){
   store.put("runs",{...run,status:"interrupted",endedAt:now(),stopReason:"Reconciliación de evaluación interrumpida"},"skill.trial_run_recovered");budget.interrupt(run.id);
  }
  const ownership=new OwnershipManager(store);
  for(const lease of store.list("ownership",goal.id).filter(l=>l.status==="held"))ownership.release(lease.id);
  if(!["DONE","ABORTED","FAILED"].includes(goal.state))store.put("goals",{...store.get("goals",goal.id)!,state:"PAUSED",pauseReason:"EVALUATION_ONLY: conservar candidato parcial; el reintento usa otra copia",updatedAt:now()},"skill.trial_goal_recovered");
 }
 const activeMs=trial.status==="running"&&trial.startedAt?Math.max(0,Date.now()-Date.parse(trial.startedAt)):0;
 const recovered={...trial,status:"interrupted" as const,ownerPid:undefined,endedAt:now(),activeMs:Math.min(trial.spec.timeoutMs,(trial.activeMs??0)+activeMs),failure:"Operaciones reconciliadas. Resultados completos conservados; reservas inciertas e intentos no se reinician."};
 store.put("skillTrials",recovered,"skill.trial_recovered","user");
 return {message:"Recuperación completa. Revisá presupuesto y contrato antes de autorizar la continuación; no se repitió ninguna llamada incierta.",trialId,outcomes:trial.outcomes.length,attempts:trial.attempts};
}
