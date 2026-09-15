import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { App } from "../../src/ui/tui/app.js";
import { DemoClient } from "../../src/ui/tui/demo.js";
import type { Screen, UiAction } from "../../src/presentation/protocol.js";
export async function mount(
  scene = "running",
  screen: Screen = "home",
  width = 120,
  height = 36,
) {
  const test = await createTestRenderer({ width, height, kittyKeyboard: true });
  const root = createRoot(test.renderer),
    client = new DemoClient(scene),
    actions: UiAction[] = [];
  const dispatch = client.dispatch;
  client.dispatch = (action) => {
    actions.push(action);
    dispatch(action);
  };
  let exited = false;
  root.render(
    <App
      client={client}
      initialScreen={screen}
      onExit={() => {
        exited = true;
      }}
    />,
  );
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 60));
    await test.renderOnce();
  };
  await flush();
  return {
    ...test,
    client,
    actions,
    flush,
    exited: () => exited,
    dispose: async () => {
      root.unmount();
      test.renderer.destroy();
      await client.close();
    },
  };
}
