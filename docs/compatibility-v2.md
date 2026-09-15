# V2 compatibility gate

## Exact versions

Pi SDK 0.85.1; OpenTUI core/react 0.5.9; React 19.2.0; Node 26.4.0 with experimental FFI for terminal rendering; Node DatabaseSync for SQLite. These are tested pins, not labels claiming compatibility with every future release. Node 26 was selected for OpenTUI's FFI requirement, not for LTS status. CLI and package entry points reject an incompatible runtime before loading the native UI.

## Gates

Run 34810253111 checked untouched V1 on Node 24/Linux and exercised real OpenTUI/React/SQLite on Node 26.4/Linux and Windows Server 2025. V1 regression tests then passed with DatabaseSync, preserving schema, atomic transactions, locks and recovery. The SDK contract tests still create actual Pi sessions against controlled transport; they do not establish personal provider access.

After the continuation fixes, run 34865115486 passed both complete native jobs on Linux and Windows: typecheck, lint, schema synchronization, core/UI tests, build, clean package installation, native captures and benchmarks. New tests and subsequent changes require their own HEAD checks; this historical run is not a substitute for those checks.

## Problems found and repaired

- Generated Windows evidence paths use backslashes; normalize internally generated relative paths before the POSIX-style file broker, not arbitrary untrusted input.
- Canonical workspace paths are used consistently for trust and consent.
- Node 26.4/libuv on Windows could abort with exit 0xC0000409 when `fs.watch` observed a directory opened through a short TEMP alias. Canonicalizing the engine home with `realpath` before watching resolved the crash. Actual child-process IPC preference persistence now passes on Windows; the test was not skipped or replaced with a mock.
- Git line-ending conversion caused false schema staleness. `.gitattributes` fixes LF representation instead of weakening the schema comparison.
- The actual OpenTUI keyboard API exports `pressKey("RETURN")`/`pressEnter`, not a guessed `pressReturn` method.
- Native input submission is a union; auth accepts strings only. Secret entry has a separate masked buffer that does not enter visible renderer state.
- Responsive activity reserves space for the goal reason and composer. The newest repair remains visible at 80x24.
- Multiple workers of the same role must remain separate run records; presentation now preserves each binding/account rather than collapsing them into one row.
- The suite selector initially rejected `e2e`; it now accepts digits and the Docker job actually runs both tests.
- `Start-Process -Wait` waits for descendants, including a terminal meant to stay open. Desktop capture now waits only for launcher exit with a timeout, verifies its live TUI child, and sizes the window within the usable desktop area.

## Packaging

A C# x64 launcher with bundled Node/dependencies and Inno Setup installer was implemented and exercised in Windows CI, including clean install/uninstall and actual Terminal capture. This avoids forcing Pi's dynamic resources and OpenTUI's native FFI assets through an unverified SEA/Bun rewrite. It is a complete installation directory, not a portable single file.

Personal OAuth inference, a Windows 11 user session and actual Docker execution on a Windows host remain separate validation layers. They are never inferred from `Perfect.exe --version` or a successful native-renderer test.
