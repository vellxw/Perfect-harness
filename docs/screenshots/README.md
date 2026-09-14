# Actual UI captures

The PNG/TXT pairs in this directory are generated from the **real OpenTUI renderer and actual React application** by `scripts/capture-tui.mjs`. Their data is a deterministic, visibly marked DEMO fixture. They are not generative mockups, not evidence of real model inference, and not OS window screenshots. The PNG rasterizer uses captured native cells/colors rather than recreating a different UI.

| Capture | Scene |
|---|---|
| [idle](idle.png) | Composer-first empty state |
| [running](running.png) | Current goal and agents |
| [concurrent](concurrent.png) | Concurrent specialist display fixture |
| [repair](repair.png) | Visual failure and assigned repair |
| [compact](compact.png) | 80×24 layout |
| [agents](agents.png) | Agent details overlay |
| [plan](plan.png) | Task dependencies |
| [verification](verification.png) | Current-candidate checks |
| [paused](paused.png) | Blocking environment condition |
| [done](done.png) | Evidence Judge completion display |
| [routing](routing.png) | Explicit model identities |
| [settings](settings.png) | Local UI/provider controls |

`provenance.json` records runtime, platform and dimensions. A separate `linux-desktop/` or `windows-desktop/` directory, when present, contains actual OS terminal captures and its own provenance. A Windows capture blocked by a noninteractive runner is reported as BLOCKED; no mockup is substituted.

Regenerate native snapshots with `npm run build && node --experimental-ffi scripts/capture-tui.mjs docs/screenshots`. Actual terminal capture scripts are `capture-xterm.sh` and `capture-windows.ps1`.
