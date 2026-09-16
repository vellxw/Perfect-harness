import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { useEffect } from "react";
import type { KeyEvent } from "@opentui/core";
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
    actions: UiAction[] = [],
    decodedKeys: string[] = [];
  const dispatch = client.dispatch;
  client.dispatch = (action) => {
    actions.push(action);
    dispatch(action);
  };
  let exited = false, effectsReady = false;
  // A painted frame is not a passive-effect barrier. OpenTUI's useKeyboard
  // installs its listener in useEffect. This parent effect runs after the
  // child App effects, so the first key cannot be sent before subscription.
  function MountedApp() {
    useEffect(() => {
      effectsReady = true;
    }, []);
    return (
      <App
        client={client}
        initialScreen={screen}
        onExit={() => {
          exited = true;
        }}
      />
    );
  }
  const onKey = (key: KeyEvent) => decodedKeys.push(key.name);
  test.renderer.keyInput.on("keypress", onKey);
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 60));
    await test.renderOnce();
  };
  const dispose = async () => {
    root.unmount();
    test.renderer.keyInput.off("keypress", onKey);
    test.renderer.destroy();
    await client.close();
  };
  root.render(<MountedApp />);
  try {
    const deadline = performance.now() + 5000;
    do {
      await flush();
    } while (!effectsReady && performance.now() < deadline);
    if (!effectsReady)
      throw Error("React did not commit the keyboard effects before input:\n" + test.captureCharFrame());
    await test.renderOnce();
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    ...test,
    client,
    actions,
    decodedKeys,
    flush,
    exited: () => exited,
    dispose,
  };
}
