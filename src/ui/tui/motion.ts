import { useEffect, useState } from "react";
import type { Motion } from "../../presentation/protocol.js";
export function motionEnabled(
  mode: Motion,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    mode === "full" ||
    (mode === "auto" &&
      !env.SSH_CONNECTION &&
      !env.CI &&
      env.TERM !== "dumb" &&
      env.PERFECT_REDUCED_MOTION !== "1")
  );
}
/** A finite transition; no timers survive completion or unmount. */
export function useEntrance(
  key: string,
  enabled: boolean,
  duration = 140,
): number {
  const [value, setValue] = useState(1);
  useEffect(() => {
    if (!enabled) {
      setValue(1);
      return;
    }
    setValue(0);
    const start = performance.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / duration);
      setValue(1 - Math.pow(1 - t, 3));
      if (t === 1) clearInterval(timer);
    }, 33);
    return () => clearInterval(timer);
  }, [key, enabled, duration]);
  return value;
}
export function useSpinner(active: boolean, enabled: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active || !enabled) return;
    const timer = setInterval(() => setFrame((n) => (n + 1) % 10), 100);
    return () => clearInterval(timer);
  }, [active, enabled]);
  return active
    ? enabled
      ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][frame]!
      : "◌"
    : "○";
}
