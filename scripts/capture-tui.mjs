import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { createElement } from "react";
import { Resvg } from "@resvg/resvg-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { App } from "../dist/ui/tui/app.js";
import { DemoClient } from "../dist/ui/tui/demo.js";
const output = resolve(process.argv[2] ?? "test-results/tui");
await mkdir(output, { recursive: true });
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const color = (c) => {
  const b = c?.buffer;
  if (!b || b.length !== 4) throw Error("Unsupported native RGBA capture");
  return `rgba(${b[0]},${b[1]},${b[2]},${b[3] / 255})`;
};
const results = [];
for (const [name, scene, screen, cols, rows] of [
  ["idle", "idle", "home", 120, 36],
  ["running", "running", "home", 160, 45],
  ["concurrent", "concurrent", "home", 160, 45],
  ["repair", "repair", "home", 120, 36],
  ["compact", "repair", "home", 80, 24],
  ["agents", "running", "agents", 120, 36],
  ["plan", "running", "plan", 120, 36],
  ["verification", "repair", "verify", 120, 36],
  ["routing", "running", "routing", 120, 36],
  ["paused", "paused", "home", 120, 36],
  ["done", "done", "home", 120, 36],
  ["settings", "idle", "settings", 120, 36],
]) {
  const test = await createTestRenderer({ width: cols, height: rows }),
    root = createRoot(test.renderer),
    client = new DemoClient(scene);
  root.render(
    createElement(App, { client, initialScreen: screen, onExit: () => {} }),
  );
  await new Promise((r) => setTimeout(r, 100));
  await test.renderOnce();
  const frame = test.captureCharFrame(),
    spans = test.captureSpans();
  await writeFile(join(output, name + ".txt"), frame);
  const cellW = 10,
    cellH = 20,
    pad = 24,
    label = 30,
    width = cols * cellW + pad * 2,
    height = rows * cellH + pad * 2 + label;
  let drawing = `<rect width="100%" height="100%" fill="#050507"/><text x="24" y="20" fill="#7c879f" font-family="DejaVu Sans Mono,monospace" font-size="11">PERFECT · native OpenTUI renderer capture · synthetic display fixture · ${cols}×${rows}</text>`;
  for (const [row, line] of spans.lines.entries()) {
    let col = 0;
    for (const span of line.spans) {
      const x = pad + col * cellW,
        y = pad + label + row * cellH,
        fg = color(span.fg),
        bg = color(span.bg);
      drawing += `<rect x="${x}" y="${y}" width="${span.width * cellW}" height="${cellH}" fill="${bg}"/><text xml:space="preserve" x="${x}" y="${y + 15}" fill="${fg}" font-weight="${(span.attributes & 1) !== 0 ? 700 : 400}" font-family="DejaVu Sans Mono,Cascadia Mono,Consolas,monospace" font-size="16" textLength="${Math.max(1, span.width * cellW)}" lengthAdjust="spacingAndGlyphs">${escape(span.text)}</text>`;
      col += span.width;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${drawing}</svg>`;
  await writeFile(
    join(output, name + ".png"),
    new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng(),
  );
  console.log(`Captured ${name} ${cols}x${rows}`);
  results.push({
    name,
    source: "native OpenTUI captureSpans",
    data: "synthetic fixture, no real provider calls",
    cols,
    rows,
  });
  root.unmount();
  test.renderer.destroy();
}
await writeFile(
  join(output, "provenance.json"),
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      opentui: "0.5.9",
      captures: results,
    },
    null,
    2,
  ),
);
