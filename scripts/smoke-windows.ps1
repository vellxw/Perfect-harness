param([string]$Package = 'release/Perfect-Harness-Windows-x64',[switch]$Installer)
$ErrorActionPreference = 'Stop'
$exe = Join-Path (Resolve-Path $Package) 'Perfect.exe'
$profile = Join-Path $env:LOCALAPPDATA 'Microsoft/Windows Terminal/Fragments/PerfectHarness/PerfectHarness.json'
$hadProfile = Test-Path $profile
$oldProfile = if ($hadProfile) { [IO.File]::ReadAllBytes($profile) } else { $null }
$settings = Join-Path $env:LOCALAPPDATA 'Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
$settingsHash = if (Test-Path $settings) { (Get-FileHash $settings).Hash } else { $null }
try {
  & $exe --install-profile
  if ($LASTEXITCODE -ne 0) { throw 'Profile registration failed' }
  $fragment = Get-Content $profile -Raw | ConvertFrom-Json
  if ($fragment.profiles[0].commandline -notmatch 'Perfect.exe.*--tui-child') { throw 'Invalid launch command' }
  if (-not (Test-Path $fragment.profiles[0].icon)) { throw 'Missing icon' }
  if ($settingsHash -and (Get-FileHash $settings).Hash -ne $settingsHash) { throw 'User Terminal settings were modified' }
  & $exe --remove-profile
  if (Test-Path $profile) { throw 'Own profile was not removed' }
  $temp = Join-Path $env:RUNNER_TEMP ('perfect-smoke-' + [Guid]::NewGuid())
  New-Item -ItemType Directory $temp -Force | Out-Null
  try {
    $json = & $exe --no-ui --home "$temp/state" --workspace $temp --json doctor
    $report = $json | ConvertFrom-Json
    if ($null -eq $report) { throw 'JSON CLI smoke failed' }
  } finally { Remove-Item $temp -Recurse -Force }
  if ($Installer) {
    $setup = Join-Path (Split-Path (Resolve-Path $Package) -Parent) 'Perfect-Harness-Setup-x64.exe'
    $dest = Join-Path $env:RUNNER_TEMP ('Perfect Installed ' + [Guid]::NewGuid())
    $beforePath = [Environment]::GetEnvironmentVariable('Path','User')
    $p = Start-Process $setup -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="' + $dest + '"'),'/TASKS=addpath') -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Installer exited $($p.ExitCode)" }
    if ((& "$dest/Perfect.exe" --version).Trim() -ne '0.2.0') { throw 'Installed executable failed' }
    if ([Environment]::GetEnvironmentVariable('Path','User') -notlike "*$dest*") { throw 'User PATH was not updated' }
    $uninstall = Start-Process "$dest/unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw 'Uninstaller failed' }
    if ([Environment]::GetEnvironmentVariable('Path','User') -ne $beforePath) { throw 'Uninstall did not preserve the original user PATH' }
  }
  Write-Host 'WINDOWS_PACKAGE_PROFILE_CLI_SMOKE_PASS'
} finally {
  if ($hadProfile) { New-Item -ItemType Directory (Split-Path $profile -Parent) -Force | Out-Null; [IO.File]::WriteAllBytes($profile,$oldProfile) }
  elseif (Test-Path $profile) { Remove-Item $profile }
}
