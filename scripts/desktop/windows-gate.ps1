param([string]$Release='release',[string]$PreviousInstaller)
$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true'){throw 'This diagnostic wrapper is limited to the owned Windows CI journey.'}
$out=[IO.Path]::GetFullPath('test-results/desktop/windows-package')
New-Item -ItemType Directory $out -Force | Out-Null
$beforeEnabled=$env:ELECTRON_ENABLE_LOGGING
$beforeLog=$env:ELECTRON_LOG_FILE
try {
  # Chromium logging does not disable any production fuse, sandbox, CSP or IPC check.
  # Only the CI-owned synthetic project is opened by windows-smoke.ps1.
  $env:ELECTRON_ENABLE_LOGGING='1'
  $env:ELECTRON_LOG_FILE=Join-Path $out 'electron-native.log'
  $snapshotFiles=Get-ChildItem (Join-Path $Release 'Perfect-Harness-Windows-x64') -Filter '*snapshot*.bin' -File | ForEach-Object {@{name=$_.Name;bytes=$_.Length;sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
  $snapshotFiles | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $out 'runtime-snapshots.json') -Encoding utf8NoBOM
  & (Join-Path $PSScriptRoot 'windows-smoke.ps1') -Release $Release -PreviousInstaller $PreviousInstaller
  if($LASTEXITCODE -ne 0){throw 'Native distribution gate returned a failure'}
} catch {
  $failure=$_
  if(Test-Path $env:ELECTRON_LOG_FILE){
    Write-Host 'Owned synthetic-session Chromium diagnostic (last 120 lines):'
    Get-Content $env:ELECTRON_LOG_FILE -Tail 120 | ForEach-Object {Write-Host $_}
  }
  throw $failure
} finally {
  $env:ELECTRON_ENABLE_LOGGING=$beforeEnabled
  $env:ELECTRON_LOG_FILE=$beforeLog
}
