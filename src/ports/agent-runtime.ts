import type {
  AgentDefinition,
  AgentRun,
  CommandSpec,
  ContextPackage,
  Privacy,
  RouteBinding,
  Usage,
} from "../domain/model.js";
export interface AgentServices {
  listFiles(): Promise<string[]>;
  readFile(
    path: string,
    startLine?: number,
    endLine?: number,
  ): Promise<{
    path: string;
    content: string;
    hash: string;
    truncated?: boolean;
    totalLines?: number;
    nextLine?: number;
  }>;
  readEvidence?(
    id: string,
  ): Promise<{ id: string; content: string; truncated: boolean }>;
  readImage?(
    path: string,
  ): Promise<{ data: string; mimeType: string; source: string }>;
  writeFile?(
    path: string,
    content: string,
    expectedHash?: string,
  ): Promise<unknown>;
  removeFile?(path: string, expectedHash: string): Promise<void>;
  command?(
    command: CommandSpec,
  ): Promise<{ code: number; stdout: string; stderr: string }>;
  research?(url: string): Promise<string>;
}
export interface AgentRequest {
  run: AgentRun;
  context: ContextPackage;
  cwd: string;
  controlDir: string;
  signal: AbortSignal;
  services: AgentServices;
  instruction: string;
  resultSchema: Record<string, unknown>;
  parseResult?: (value: unknown) => unknown;
  images?: { data: string; mimeType: string; source: string }[];
  beforeRequest: (
    requestId: string,
    tokenUpperBound: number,
    estimatedCost?: number,
  ) => void | Promise<void>;
  usage: (usage: Usage) => void;
  event: (type: string, payload: unknown) => void;
}
export interface AgentOutput {
  result: unknown;
  summary: string;
  sessionRef?: string;
}
export interface AgentRuntime {
  resolve(
    definition: AgentDefinition,
    privacy: Privacy,
    contributorConsent: boolean,
    signal: AbortSignal,
  ): Promise<RouteBinding>;
  run(request: AgentRequest): Promise<AgentOutput>;
}
