import { PresentationEngine } from "./engine.js";
import type { UiMessage } from "./protocol.js";
let engine: PresentationEngine | undefined;
const send = (message: UiMessage) => {
  if (process.connected) process.send?.(message);
};
let initialization: Promise<void> | undefined;
process.on("message", (message: unknown) => {
  const m = message as {
    type?: string;
    requestId?: string;
    action?: unknown;
    options?: { home?: string; workspace?: string };
  };
  if (m?.type === "initialize" && !initialization)
    initialization = PresentationEngine.create(m.options ?? {}, send).then(
      (e) => {
        engine = e;
      },
      (error) => {
        send({ type: "fault", message: String(error) });
        process.exitCode = 1;
      },
    );
  else if (m?.type === "action" && typeof m.requestId === "string")
    void (initialization ?? Promise.resolve()).then(() =>
      engine?.dispatch(m.requestId!, m.action),
    );
  else if (m?.type === "shutdown") void close();
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await initialization;
  await engine?.dispose();
  if (process.connected) process.disconnect?.();
}
process.on("disconnect", () => {
  void close();
});
process.on("SIGTERM", () => {
  void close();
});
