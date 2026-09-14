import type { ExecutionRunner, ExecutionRequest, ExecutionOutput } from '../../src/ports/execution.js';
import type { CommandSpec } from '../../src/domain/model.js';
import { processRun } from '../../src/adapters/git/process.js';

/** Tests only, for authored fixtures. This adapter is not exported or selectable by the product. */
export class NodeFixtureRunner implements ExecutionRunner {
  async available(){return true;}
  async command(request:ExecutionRequest,command:CommandSpec):Promise<ExecutionOutput>{
    if(command.executable!=='node')throw new Error('Fixture runner accepts only authored Node test commands');
    return{...await processRun(process.execPath,command.args,{cwd:request.workspace,env:{PATH:process.env.PATH,HOME:'/tmp'},signal:request.signal,timeoutMs:command.timeoutMs}),artifacts:[]};
  }
  async browser():Promise<ExecutionOutput>{throw new Error('Browser fixtures require DockerRunner');}
  async remotion():Promise<ExecutionOutput>{throw new Error('Remotion fixtures require DockerRunner');}
  async recover():Promise<void>{/* All fixture processes are awaited and killed by processRun on cancellation. */}
}
