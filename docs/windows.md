# Windows package and launch experience

## Install and open

Download the **Windows package** artifact for a successful commit. Run `Perfect-Harness-Setup-x64.exe`, or extract **all** of `Perfect-Harness-Windows-x64.zip`. The installer is per-user, adds Start-menu and optional desktop shortcuts, optionally adds its own directory to your user PATH, and supports uninstall. Do not copy `Perfect.exe` alone: it launches the bundled Node runtime, application code and native OpenTUI assets beside it.

Double-click Perfect, or use its shortcut, to open the Perfect Harness profile in Windows Terminal. From an existing interactive terminal, `perfect` uses that terminal. `Perfect.exe --version`, `--no-ui` and classic commands do not require a separate global Node/npm installation.

Windows Terminal is an external prerequisite for the dedicated visual window. Missing Terminal produces an actionable message, not an empty PowerShell. Git and a working Docker engine capable of running Linux containers remain prerequisites for actual coding execution. They are not silently installed or granted elevated privileges. A standalone UI can run without Docker, but verification must pause instead of falling back to the host shell.

Use `perfect --workspace "C:\Projects\My App"` to select your project, or `/workspace` inside the UI. The default desktop shortcut starts in `Documents\Perfect Projects\Workspace`. Private goals are the default; configure your local providers before attempting a real goal.

## What the installer changes

Application: `%LOCALAPPDATA%\Programs\PerfectHarness` by default. Terminal fragment: `%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\PerfectHarness\PerfectHarness.json`. This is an app-owned fragment with a fixed GUID, not an edit to the user's `settings.json`. Its profile uses 88% opacity, Acrylic, a muted wallpaper, Cascadia Mono and a dark color scheme. Acrylic support and appearance depend on the terminal/compositor and accessibility settings. Mica is a window-theme preference and is not forced globally.

Uninstall removes its own fragment only when it references this installation and removes its own PATH entry only when it added it. Project folders, original source code and local harness state are not deleted. Credentials remain outside the installation and Git repository.

## Packaging decision

The distribution deliberately uses a small C#/.NET Framework x64 launcher plus a pinned Node 26.4.0 runtime and ordinary production dependencies. Windows includes the required Framework runtime; the compiler is only needed on the build machine. This approach preserves Pi's dynamic resources, the separate engine worker and OpenTUI's native library paths without forcing them through a single-file bundler.

Node SEA and Bun compilation were investigated as alternatives. The chosen release is **not** a Node SEA image and does not claim every dependency works under Bun. Avoiding a speculative runtime rewrite is more valuable than reducing a complete installation to one file.

The launcher has product/version metadata, an embedded multi-resolution ICO, DPI/long-path manifest and `asInvoker` privileges. It does not execute a command string through cmd/PowerShell. The core worker is hidden and communicates over private inherited IPC, not a localhost web server.

## Build and smoke

On Windows x64 with Node 26.4.0 and the official Inno Setup compiler:

```powershell
npm ci
./scripts/package-windows.ps1 -Installer
./scripts/smoke-windows.ps1 -Installer
```

The package script verifies version without external Node on PATH, native icon resources, generated Terminal profile and dependency integrity. The smoke test registers/removes the profile, checks the user's Terminal settings were not edited, invokes JSON diagnostics, installs silently into a clean path, checks PATH addition, uninstalls and checks the original PATH was restored.

## Signing

The launcher and setup executable are currently **unsigned**. SHA256 checksums detect file changes, not publisher identity. Do not disable Windows security protections to install them. A production publisher should sign the finished launcher and installer with Authenticode using an external certificate/managed signing service; never commit a PFX, password or private key. Signing must be followed by a fresh checksum manifest and installer smoke.

## Evidence boundaries

The hosted `windows-2025` runner is Windows Server 2025 build 26100, **not a Windows 11 desktop session**. Passing its native renderer, CLI and installer tests is useful Windows compatibility evidence, but not a claim that a human Windows 11 installation or Acrylic performance was tested.

`capture-windows.ps1` attempts an actual Windows Terminal window using Microsoft's pinned portable ZIP in an isolated settings directory, launches the packaged executable, verifies a live bundled TUI process, captures the actual window and records OS/process provenance. If an interactive desktop is unavailable or blank, it records BLOCKED rather than fabricating a screenshot. Its application data is a clearly marked demo; no OAuth is involved. A final Windows 11 user-session visual/keyboard/Docker check remains required before calling the package broadly certified.

Official references: Microsoft Terminal JSON fragments and profile appearance documentation; OpenTUI runtime/standalone documentation; Node single-executable documentation; Inno Setup documentation. Versions are pinned in scripts, not inferred from branding.
