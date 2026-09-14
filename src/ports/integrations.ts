export type IntegrationContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };
export interface IntegrationResponse {
  content: IntegrationContent[];
  isError?: boolean;
  replayed?: boolean;
}
export interface IntegrationObservation {
  server: string;
  tool: string;
  operationId: string;
  argumentHash: string;
  elapsedMs: number;
  response: IntegrationResponse;
}
export interface RunIntegrations {
  list(server?: string): Promise<unknown>;
  call(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<IntegrationResponse>;
  resources(server: string, cursor?: string): Promise<unknown>;
  readResource(server: string, uri: string): Promise<IntegrationResponse>;
  close(): Promise<void>;
}
