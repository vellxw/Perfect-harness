import { useSyncExternalStore } from "react";
import type {
  DesktopBoot,
  DesktopEvent,
  DesktopReply,
  UiAction,
  UiSnapshot,
  UiMessage,
} from "../contracts/protocol.js";
export interface ViewState {
  boot?: DesktopBoot;
  snapshot?: UiSnapshot;
  connected: boolean;
  messages: UiMessage[];
  error?: string;
  preview?: string;
}
let state: ViewState = { connected: false, messages: [] };
const listeners = new Set<() => void>();
const publish = () => {
  for (const listener of listeners) listener();
};
let unsubscribe: (() => void) | undefined,
  sequence = 0;
export function useDesktop() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
export async function connect() {
  unsubscribe?.();
  unsubscribe = window.perfect.onEvent((event: DesktopEvent) => {
    if (event.type === "engine") {
      if (event.sequence <= sequence) return;
      sequence = event.sequence;
      if (event.message.type === "snapshot")
        state = {
          ...state,
          snapshot: event.message.snapshot,
          connected: true,
          boot: state.boot
            ? { ...state.boot, workspaceId: event.workspaceId }
            : undefined,
        };
      else
        state = {
          ...state,
          messages: [...state.messages.slice(-99), event.message],
        };
    } else if (event.type === "connection")
      state = { ...state, connected: event.connected, error: event.reason };
    else state = { ...state, preview: event.open ? event.url : undefined };
    publish();
  });
  try {
    const boot = await window.perfect.boot();
    state = {
      ...state,
      boot,
      snapshot: boot.snapshot ?? state.snapshot,
      connected: boot.connected || state.connected,
    };
    publish();
  } catch (error) {
    state = { ...state, error: String(error) };
    publish();
  }
}
export async function request(
  operation: Parameters<typeof window.perfect.request>[0]["operation"],
  payload?: unknown,
): Promise<DesktopReply> {
  if (!state.boot) {
    await connect();
  }
  if (!state.boot) throw Error("El escritorio no está conectado");
  const response = await window.perfect.request({
    protocol: 1,
    sessionId: state.boot.sessionId,
    workspaceId: state.boot.workspaceId,
    requestId: crypto.randomUUID(),
    operation,
    payload,
  });
  if (!response.ok) throw Error(response.message ?? "Operación rechazada");
  return response;
}
export const act = (action: UiAction) => request("action", action);
