import { Blocked } from "../domain/util.js";

/** Keep remote diagnostics out of prompts/logs: they can include echoed credentials. */
export function integrationFailure(error: unknown, signal?: AbortSignal): Error {
  if (error instanceof Blocked) return error;
  if (signal?.aborted) return signal.reason instanceof Error ? signal.reason : new Error("Integración cancelada");
  const status = error && typeof error === "object" ? (error as { status?: unknown; statusCode?: unknown; code?: unknown }) : {};
  const code = Number(status.status ?? status.statusCode ?? status.code);
  if (code === 401 || code === 403) return new Blocked("MCP_AUTH_REQUIRED", "El servicio rechazó las credenciales o sus permisos. Revisá la conexión local; no se cambiará de cuenta automáticamente.");
  if (code === 429) return new Blocked("MCP_RATE_LIMIT", "El servicio limitó las solicitudes. La operación no se reintentará automáticamente; esperá antes de reanudar.");
  return new Blocked("MCP_CONNECTION_FAILED", "La conexión MCP falló o terminó sin una respuesta válida. Revisá su estado; los detalles remotos no se copiaron para evitar exponer credenciales.");
}
