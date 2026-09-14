import type {
  CommandSpec,
  VisualScenario,
  VerificationSpec,
} from "../domain/model.js";
export interface ExecutionRequest {
  goalId: string;
  taskId?: string;
  workspace: string;
  revision: string;
  artifactsDir: string;
  signal: AbortSignal;
}
export interface ExecutionOutput {
  code: number;
  stdout: string;
  stderr: string;
  artifacts: {
    path: string;
    kind: "screenshot" | "frame" | "trace" | "report";
  }[];
}
export interface ExecutionRunner {
  available(): Promise<boolean>;
  command(
    request: ExecutionRequest,
    command: CommandSpec,
  ): Promise<ExecutionOutput>;
  browser(
    request: ExecutionRequest,
    scenario: VisualScenario,
  ): Promise<ExecutionOutput>;
  remotion(
    request: ExecutionRequest,
    spec: NonNullable<VerificationSpec["remotion"]>,
  ): Promise<ExecutionOutput>;
  recover(goalId: string): Promise<void>;
}
