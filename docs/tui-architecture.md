# Reactive terminal architecture

## Boundaries

`Perfect Core → PresentationEngine → private process IPC → EngineClient → OpenTUI/React`.

The original domain, orchestrator, routing, budgets, ownership, Judge and sandbox remain authoritative. `UiActionSchema` accepts explicit user intents, not arbitrary method names or goal-state writes. No UI action can set DONE. Plan approvals include the displayed plan hash; apply and human-criterion approvals include the candidate revision. The core validates them again before mutation.

`perfect` on an interactive terminal starts the TUI. Classic subcommands and JSON output bypass it; non-TTY invocation prints CLI help instead of escape sequences. Node experimental FFI is enabled for the OpenTUI process. Pi and SQLite run in a separate local engine process, keeping synchronous database work and provider orchestration away from keyboard rendering. There is no HTTP server or web dashboard.

## Events and projections

SQLite retains V1 schema version 1. The driver changed from better-sqlite3 to Node DatabaseSync after regression tests. Transactions use BEGIN IMMEDIATE and nested savepoints. Domain-state and event changes remain atomic; subscribers wake only after the outer transaction commits. Rollback does not publish speculative state.

The presentation engine subscribes to post-commit wakeups and file notifications for changes made by another CLI process. Notifications coalesce for 20ms; snapshots are published only when their serialized content changes. There is no always-on one-second screen clearing loop. File notifications are a local wakeup mechanism, not distributed coordination; explicit refresh/reconnect reconstructs state from SQLite.

Projection limits: 500 task rows, 200 evidence records, 1000 source events reduced to the last 120 human activity entries. Details remain available through the traditional CLI and evidence store. Rows are windowed to the viewport. Many-to-many DAG dependencies are retained rather than pretending every child has exactly one parent.

## Actions and lifecycle

User actions are validated and serialized before execution, preventing duplicate goal-start races. Long-running goals, manual verification and dependency preparation have tracked operation kinds and cancellation controllers. Pause/abort of manually started work propagates cancellation; closing the UI pauses a goal and waits for safe completion instead of destroying checkpoints. A crashed renderer leaves recovery to the same core mechanisms; reconnect never infers success.

Authentication messages travel over inherited IPC. Secret entry uses a separate masked buffer and does not place the credential in the visible input, display snapshot, domain events or logs. A cancelled authentication prompt rejects the underlying provider flow. Diagnostic setup does not send an inference unless a separate smoke is explicitly requested.

## Visual layer

One frame, a compact header/current goal, chronological activity, a rail only on wide terminals, and a persistent composer. Overlays expose agents/routing, plan/tasks, current-revision verification, evidence, diff, cost, logs, setup and preferences. Arrow keys/Enter and slash commands are sufficient; mouse selection is optional. Ctrl+J provides a newline alternative for terminals that cannot distinguish Shift+Enter.

Material tokens follow the approved obsidian/lavender direction. Window blur is provided by the host terminal, not OpenTUI text cells. Motion currently consists of finite eased overlay transitions and activity spinners that stop when idle. Reduced/off preferences and remote/CI auto-detection are supported. This is not pixel-level parity with the generated design reference.

## Security

The UI receives sanitized text with OSC/CSI/control sequences stripped. It cannot silently update snapshots, model routing or evidence. Artifact IDs are resolved in the selected goal, hash-validated and constrained to its artifact directory. Images/video may be opened after a user action; arbitrary HTML, executables, scripts and archives are not auto-launched. Auth URLs are restricted to configured official provider origins. Contributor consent and public/private classification remain separate gates.

## Testing

Tests cover the real native renderer at 80×24, 100×30, 120×36 and 160×45, overlays, keyboard submission/newlines, typed abort, resize, unknown metadata, DAG joins, terminal escape sanitation, database commit/savepoints and idle notifications. The stress script uses 20k display events, 500 tasks and 1000 state updates. Its timing is explicit native-renderer dispatch-to-frame, not photon latency or an OS performance guarantee.
