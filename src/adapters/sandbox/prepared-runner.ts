import { PostgresRunner } from "./postgres.js";
import { join } from "node:path";
import type { PerfectConfig } from "../../config/schema.js";
import type { StateStore } from "../../ports/state-store.js";
import type {
  ExecutionRunner,
  ExecutionRequest,
  ExecutionOutput,
} from "../../ports/execution.js";
import type {
  CommandSpec,
  VerificationSpec,
  VisualScenario,
} from "../../domain/model.js";
import { DockerRunner } from "./docker.js";
import { preparedImage } from "./dependencies.js";
import { Semaphore } from "../../application/semaphore.js";

/** Same sandbox boundary; only explicitly approved, manifest-matched image digests may supply dependencies. */
export class PreparedDockerRunner implements ExecutionRunner {
  private admission: Semaphore;
  constructor(
    private config: PerfectConfig,
    private store: StateStore,
    private directory: string,
  ) {
    this.admission = new Semaphore(config.parallelism.heavyCommands);
  }
  private plain(): DockerRunner {
    return new DockerRunner(this.config, this.store, this.directory);
  }
  postgres(
    request: ExecutionRequest,
    command: CommandSpec,
  ): Promise<ExecutionOutput> {
    return this.admission.use(request.signal, () =>
      new PostgresRunner(
        this.config,
        this.store,
        join(this.directory, "postgres"),
      ).run(request, command),
    );
  }
  available(): Promise<boolean> {
    return this.plain().available();
  }
  recover(goalId: string): Promise<void> {
    return this.plain().recover(goalId);
  }
  private async runner(
    request: ExecutionRequest,
    render = false,
  ): Promise<DockerRunner> {
    const base = render
      ? this.config.sandbox.browserImage
      : this.config.sandbox.image;
    const image = await preparedImage(
      request.workspace,
      request.goalId,
      base,
      this.store,
    );
    this.store.event(request.goalId, "execution.image_selected", {
      revision: request.revision,
      image,
      manifestMatched: image !== base,
    });
    return new DockerRunner(
      { ...this.config, sandbox: { ...this.config.sandbox, image } },
      this.store,
      join(this.directory, "prepared"),
    );
  }
  command(
    request: ExecutionRequest,
    command: CommandSpec,
  ): Promise<ExecutionOutput> {
    return this.admission.use(request.signal, async () =>
      (await this.runner(request)).command(request, command),
    );
  }
  browser(
    request: ExecutionRequest,
    scenario: VisualScenario,
  ): Promise<ExecutionOutput> {
    return this.admission.use(request.signal, async () =>
      (await this.runner(request)).browser(request, scenario),
    );
  }
  remotion(
    request: ExecutionRequest,
    spec: NonNullable<VerificationSpec["remotion"]>,
  ): Promise<ExecutionOutput> {
    return this.admission.use(request.signal, async () =>
      (await this.runner(request, true)).remotion(request, spec),
    );
  }
}
