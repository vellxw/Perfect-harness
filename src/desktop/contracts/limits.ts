export function assertSmallMessage(value: unknown): void {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    throw Error("Mensaje IPC no serializable");
  }
  if (!text || text.length > 1_000_000)
    throw Error("Mensaje IPC demasiado grande");
}
export function sameAppOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "perfect:" &&
      url.hostname === "app" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/")
    );
  } catch {
    return false;
  }
}
export function collectorPaths(action: Record<string, unknown>): string[] {
  if (action.type === "workspace")
    return typeof action.path === "string" ? [action.path] : [];
  const child = action.action as Record<string, unknown> | undefined;
  if (!child || typeof child !== "object") return [];
  if (action.type === "studio") {
    if (child.command === "import-local" && typeof child.directory === "string")
      return [child.directory];
    if (child.command === "evaluate" && typeof child.casesFile === "string")
      return [child.casesFile];
  }
  if (action.type === "integration" && child.command === "configure") {
    const config = child.config as
      | { transport?: { type?: string; command?: string } }
      | undefined;
    if (
      config?.transport?.type === "stdio" &&
      typeof config.transport.command === "string"
    )
      return [config.transport.command];
  }
  return [];
}
