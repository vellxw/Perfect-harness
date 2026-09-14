# Actual Perfect UI captures

These are captures of Perfect Harness, not screenshots of the reservation fixture it builds.

## Native renderer frames

`idle`, `running`, `concurrent`, `repair`, `compact`, `agents`, `plan`, `verification`, `routing`, `paused`, `done` and `settings` are produced by the real OpenTUI/React app. `captureSpans()` supplies cells, colors and text; the capture script rasterizes those spans to PNG. The `.txt` files retain the exact character grid. Data is synthetic and visibly marked DEMO. They are not OS screenshots and do not prove that Grok, Muse or Astra ran.

Four reviewed character frames (running, compact, agents, done) are golden-test baselines. CI compares current output before generating new capture artifacts; tests do not overwrite their own expected output.

## Operating-system captures

- `windows-desktop/windows-terminal-idle.png`
- `windows-desktop/windows-terminal-running.png`
- `linux-desktop/xterm-repair.png`

These are real pixel captures of host terminal windows running the packaged/executed app with synthetic display fixtures. The Windows capture uses the real bundled `Perfect.exe` launch route and Microsoft Windows Terminal. The hosted OS is **Windows Server 2025 build 26100**, not a Windows 11 desktop certification. Each folder records the OS, dimensions and method in `provenance.json`.

`commit-provenance.json` records the exact source commit, Actions run and artifact hash of the committed capture set. Later animation-only changes may not change the motion-off character grids; current CI produces a fresh artifact for each commit rather than silently rewriting the historical provenance.

The actual conceptual reference is in `../design/perfect-v2-direction.webp`. It is a generative direction image, explicitly not an implementation screenshot. Terminal cells cannot reproduce arbitrary pixel glass refraction.
