# Validation — core, TUI and Windows distribution

## Independent layers

1. Deterministic core tests: states, DAG, scheduling, ownership, budgets, retries, Judge, recovery and errors.
2. SDK contracts: actual Pi sessions against controlled SSE transport, with tools, explicit routing, cancellation and reported metadata. Not personal-provider inference.
3. Presentation tests: actual private IPC child lifecycle, persisted preferences, post-commit events, cross-workspace action rejection, and a real UI goal action entering the core and pausing without accounts. No network request is substituted for authentication.
4. Native TUI tests: OpenTUI renderer, keyboard, compositor layout, palettes, all detail views, masked secrets, resize, typed abort, long plan approvals and four reviewed golden character frames.
5. Docker E2E: real Git/code/API/SQLite/browser, failure/repair/Judge, plus Remotion frames and H.264 video. Only provider decisions/reviews are scripted.
6. Windows package smoke: launcher metadata/icon, version without external Node, Terminal fragment, clean per-user installation, PATH and uninstall. Actual Terminal screenshots are a separate provenance-bearing output.

`npm test` contains 118 cases after the final regression additions: 116 execute without Docker and two skip explicitly. The Linux Docker workflow runs those two rather than treating skips as success. The native matrix runs the same tests on Linux and Windows; do not double-count the same cases as distinct coverage. This is suite composition, not a claim that an unobserved Actions run passed.

## CI outputs and interpretation

The native workflow performs reproducible install, typecheck, lint, config-schema synchronization, tests, build and clean package installation. It publishes native UI captures and performance observations separately per OS. The Docker workflow publishes fullstack and Remotion evidence. The Windows package workflow publishes the installer, full-folder ZIP, checksum manifest and desktop capture provenance.

Verify the **exact HEAD commit** of the intended branch/PR. Old green checks cannot validate new code. A Windows Server 2025 runner is not a Windows 11 user-session test. DEMO/synthetic screenshots are not authenticated model runs. A capture status of BLOCKED is not a screenshot.

## Performance measurement

`scripts/benchmark-tui.mjs` measures keyboard dispatch to an explicitly requested native-renderer frame. It is not end-to-end keyboard-to-screen/OS latency. The startup field includes a deliberate 100ms settling wait after module imports; it is **not cold-launch timing**. Idle CPU is sampled over one second. The stress case creates 20,000 display events, 500 tasks, 1,000 coalesced updates and repeated resizes. Heap delta during that allocation-heavy run is not proof of either a memory leak or leak-freedom.

Committed observations in `docs/validation/native-benchmark.json` belong to their recorded source capture set; newer platform observations are in the exact CI run artifacts. The 16ms/50ms targets are goals, not fabricated certifications.

## Security and known boundaries

The UI cannot set DONE, rewrite bindings or auto-approve criteria. Terminal escape sequences are treated as data. Artifact opening validates scope/hash/type. Consent and privacy cannot silently downgrade. There is no shell-host fallback. Unsigned executable checksums show integrity, not publisher identity. No OAuth, API keys, signing certificate or private key is present in CI or release source.

Real account smoke is local. Windows 11 visual/keyboard/Docker acceptance remains a manual prerequisite for broad Windows certification. Pixel-level refraction from the design image is not implemented by terminal cells; Acrylic belongs to Windows Terminal. Inline image protocols are optional and the V2 uses verified external media opening as its dependable fallback.
