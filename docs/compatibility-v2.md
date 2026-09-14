# V2 compatibility gate

## Versions selected

Pi SDK 0.85.1; OpenTUI core/react 0.5.9; React 19.2.0; Node 26.4.0 with experimental FFI for terminal rendering; Node DatabaseSync for SQLite. These are exact tested versions, not labels claiming future compatibility. Node 26 is not selected for LTS status: OpenTUI's Node FFI requirement drove this compatibility decision. CLI and package entry points reject an incompatible runtime instead of crashing deep inside a native module.

## Observed gates

Run 34810253111 checked the untouched V1 under Node 24 on Linux and exercised real OpenTUI/React/SQLite on Node 26.4 in both Linux and Windows Server 2025. The V1 regression suite then passed with DatabaseSync after preserving the database schema, transaction behavior and locks. The SDK contract tests continue to use actual Pi sessions against controlled fake transport; they do not imply personal provider access.

## Changes found by execution

- Windows OS-relative paths use backslashes. Only internally generated evidence paths are normalized before the POSIX-style safe-path broker; external untrusted paths remain rejected.
- Canonical workspace paths are used consistently for trust decisions on Windows.
- Git checkout line-ending conversion caused a false schema-staleness failure. `.gitattributes` now fixes LF text representation, preserving exact schema checking.
- The real OpenTUI mock keyboard exports `pressKey("RETURN")`/`pressEnter`, not a guessed `pressReturn` API. Tests use observed exports.
- Native input submission is typed as a union; only string input is accepted by the auth value handler.
- Activity capacity must reserve the header, reason, toast and composer. Responsive tests assert the latest repair remains visible.
- The legacy Windows C# compiler needs normalized native source paths; package compilation uses resolved paths.
- A child-process IPC worker is spawned hidden on Windows. No unsupported ForkOptions field is used.

## Packaging choice

A native launcher with bundled Node/dependencies was implemented and exercised in a real Windows CI installation/uninstallation. This avoids an unverified SEA/Bun conversion of Pi's resources and OpenTUI's FFI/native libraries. It is a self-contained installation directory, not one portable file. Provider OAuth, a Windows 11 desktop session and real Windows Docker execution are separate validation layers and are never inferred from `--version`.
