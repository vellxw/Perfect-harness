param([string]$Package='release/Perfect-Harness-Windows-x64',[string]$PreviousInstaller,[switch]$Capture)
$ErrorActionPreference='Stop'
$root=(Resolve-Path $Package).Path
$version=(Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
$setup=Join-Path (Split-Path $root -Parent) 'Perfect-Harness-Setup-x64.exe'
$sumBefore=(Get-FileHash $setup -Algorithm SHA256).Hash
$manifest=Get-Content (Join-Path $root 'build-manifest.json') -Raw | ConvertFrom-Json
if($manifest.version -ne $version -or $manifest.sourceCommit -notmatch '^[a-f0-9]{40}$'){throw 'Invalid build manifest'}
$temporary=Join-Path $env:RUNNER_TEMP ('Perfect verificación ñ '+[Guid]::NewGuid())
$destination=Join-Path $temporary 'Perfect instalado ñ'
# PowerShell variables are case-insensitive: $home would overwrite read-only $HOME.
$dataHome=Join-Path $temporary 'Datos del usuario'
$workspace=Join-Path $temporary 'Proyecto español'
New-Item -ItemType Directory $dataHome,$workspace -Force | Out-Null
$beforePath=[Environment]::GetEnvironmentVariable('Path','User')
$oldEnvPath=$env:PATH
$fragment=Join-Path $env:LOCALAPPDATA 'Microsoft/Windows Terminal/Fragments/PerfectHarness/PerfectHarness.json'
$oldFragment=if(Test-Path $fragment){[IO.File]::ReadAllBytes($fragment)}else{$null}
$personalSettings=Join-Path $env:LOCALAPPDATA 'Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
$settingsHash=if(Test-Path $personalSettings){(Get-FileHash $personalSettings).Hash}else{$null}
$report=@{version=$version;sourceCommit=$manifest.sourceCommit;workflowSha=$env:GITHUB_SHA;platform=(Get-CimInstance Win32_OperatingSystem).Caption;checks=@();personalProviders=$false;installerSha256=$sumBefore.ToLowerInvariant();unsigned=$true;status='RUNNING'}
function Install-Perfect([string]$InstallerPath){
 $p=Start-Process $InstallerPath -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="'+$destination+'"'),'/TASKS=addpath','/LANG=spanish') -Wait -PassThru
 if($p.ExitCode -ne 0){throw "Installer failed: $($p.ExitCode)"}
}
try{
 & (Join-Path $root 'Perfect.exe') --version | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Portable executable failed'}
 $report.checks+='portable executable'
 if($PreviousInstaller){
  Install-Perfect (Resolve-Path $PreviousInstaller).Path
  & "$destination/runtime/node.exe" "$PSScriptRoot/windows-upgrade-data.mjs" seed $destination $dataHome $workspace
  if($LASTEXITCODE -ne 0){throw 'Could not create previous-version synthetic data'}
  $report.checks+='previous version installed; synthetic state and DPAPI seeded'
 }
 Install-Perfect $setup
 $exe=Join-Path $destination 'Perfect.exe'
 $env:PATH="$env:SystemRoot\System32;$env:SystemRoot"
 if((& $exe --version).Trim() -ne $version){throw 'Installed version mismatch without global Node'}
 $help=(& $exe --no-ui --help) -join "`n"
 if($LASTEXITCODE -ne 0 -or $help -notmatch 'habilidades' -or $help -notmatch 'skill-studio' -or $help -notmatch 'validacion'){throw 'V4 commands absent from installed executable'}
 $report.checks+='installed V4 runs without global Node; Spanish commands available'
 $env:PATH=$oldEnvPath
 if($PreviousInstaller){
  & "$destination/runtime/node.exe" "$PSScriptRoot/windows-upgrade-data.mjs" verify $destination $dataHome $workspace
  if($LASTEXITCODE -ne 0){throw 'Upgrade preservation failed'}
  $report.checks+='upgrade: goals, immutable snapshots, skills, UI and encrypted credential preserved'
 }
 $cliArgs=@('--no-ui','--home',$dataHome,'--workspace',$workspace,'--json','habilidades')
 $state=(& $exe @cliArgs | ConvertFrom-Json)
 if($LASTEXITCODE -ne 0 -or -not $state){throw 'Installed skills command failed'}
 $second=(& $exe @cliArgs | ConvertFrom-Json)
 if(($state | ConvertTo-Json -Depth 30 -Compress) -ne ($second | ConvertTo-Json -Depth 30 -Compress)){throw 'State changed unexpectedly across restarted CLI processes'}
 $report.checks+='skills state persists across process restart'
 if((Get-Content "$destination/build-manifest.json" -Raw | ConvertFrom-Json).sourceCommit -ne $manifest.sourceCommit){throw 'Installer payload differs from tested source'}
 if($Capture){
  & "$PSScriptRoot/capture-windows.ps1" -Package $destination -Output 'test-results/windows-installed'
  $capture=Get-Content 'test-results/windows-installed/provenance.json' -Raw | ConvertFrom-Json
  if($capture.status -ne 'CAPTURED' -or $capture.captures.Count -lt 2){throw "Installed TUI capture blocked: $($capture.error)"}
  $report.checks+='actual installed launcher and Windows Terminal screenshots'
 }
 if($settingsHash -and (Get-FileHash $personalSettings).Hash -ne $settingsHash){throw 'Personal Terminal settings changed'}
 if([Environment]::GetEnvironmentVariable('Path','User') -notlike "*$destination*"){throw 'Installer PATH entry missing'}
 $p=Start-Process "$destination/unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
 if($p.ExitCode -ne 0){throw 'Uninstaller failed'}
 if([Environment]::GetEnvironmentVariable('Path','User') -ne $beforePath){throw 'Uninstall changed unrelated PATH entries'}
 if(-not(Test-Path "$dataHome/state.sqlite")){throw 'Uninstall removed user data'}
 if($settingsHash -and (Get-FileHash $personalSettings).Hash -ne $settingsHash){throw 'Uninstall changed personal Terminal settings'}
 if((Get-FileHash $setup -Algorithm SHA256).Hash -ne $sumBefore){throw 'Installer changed after being tested'}
 $report.checks+='uninstall preserves data, PATH and Terminal settings; binary hash unchanged'
 $report.status='PASS'
} catch {$report.status='FAIL';$report.error=$_.Exception.Message;throw}
finally{
 $env:PATH=$oldEnvPath
 if($null -ne $oldFragment){New-Item -ItemType Directory (Split-Path $fragment -Parent) -Force | Out-Null;[IO.File]::WriteAllBytes($fragment,$oldFragment)}elseif(Test-Path $fragment){Remove-Item $fragment}
 New-Item -ItemType Directory 'test-results/windows-installation' -Force | Out-Null
 $report | ConvertTo-Json -Depth 8 | Set-Content 'test-results/windows-installation/report.json' -Encoding utf8NoBOM
 # Only this test-owned temporary tree. No personal home or credentials are published.
 if(Test-Path $temporary){Remove-Item $temporary -Recurse -Force -ErrorAction SilentlyContinue}
}
