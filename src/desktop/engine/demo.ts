import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { StateStore } from "../../ports/state-store.js";
import type { PerfectConfig } from "../../config/schema.js";
import { createGoal } from "../../application/goals.js";
import {
  seedReservationSource,
  reservationGoal,
} from "../../examples/reservations.js";

/** Deliberately selected demonstration of an existing V4 fixture; never a provider fallback. */
export async function createDesktopDemo(
  home: string,
  config: PerfectConfig,
  store: StateStore,
) {
  const parent = join(home, "desktop-demonstrations");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const source = await realpath(await mkdtemp(join(parent, "reservas-")));
  await seedReservationSource(source);
  const goal = await createGoal(
    {
      request:
        "DEMOSTRACIÓN CONTROLADA del fixture V4 existente. Providers simulados; código, pruebas y reparaciones reales. " +
        reservationGoal,
      source,
      home,
      config,
      privacy: "public",
      mode: "mock",
    },
    store,
  );
  const result = { ...goal, demonstration: "reservation-v4" as const };
  store.put("goals", result, "desktop.demonstration_created", "user");
  return result;
}
