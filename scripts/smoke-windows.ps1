param([string]$Package = 'release/Perfect-Harness-Windows-x64',[switch]$Installer)
$ErrorActionPreference = 'Stop'
$exe = Join-Path (Resolve-Path $Package) 'Perfect.exe'
$expectedVersion = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
$profile = Join-Path $env:LOCALAPPDATA 'Microsoft/Windows Terminal/Fragments/PerfectHarness/PerfectHarness.json'
$hadProfile = Test-Path $profile
$oldProfile = if ($hadProfile) { [IO.File]::ReadAllBytes($profile) } else { $null }
$settings = Join-Path $env:LOCALAPPDATA 'Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
$settingsHash = if (Test-Path $settings) { (Get-FileHash $settings).Hash } else { $null }
try {
  & $exe --install-profile
  if ($LASTEXITCODE -ne 0) { throw 'Falló el registro del perfil' }
  $fragment = Get-Content $profile -Raw | ConvertFrom-Json
  if ($fragment.profiles[0].commandline -notmatch 'Perfect.exe.*--tui-child') { throw 'Comando de inicio inválido' }
  if (-not (Test-Path $fragment.profiles[0].icon)) { throw 'Falta el icono' }
  if ($settingsHash -and (Get-FileHash $settings).Hash -ne $settingsHash) { throw 'Se modificaron los ajustes personales de Windows Terminal' }
  & $exe --remove-profile
  if (Test-Path $profile) { throw 'No se quitó el perfil propio' }
  $temp = Join-Path $env:RUNNER_TEMP ('perfect-smoke-' + [Guid]::NewGuid())
  New-Item -ItemType Directory $temp -Force | Out-Null
  try {
    $json = & $exe --sin-interfaz --datos "$temp/state" --carpeta $temp --json diagnostico
    $report = $json | ConvertFrom-Json
    if ($null -eq $report) { throw 'Falló el diagnóstico JSON con opciones españolas' }
    $help = (& $exe --sin-interfaz --ayuda) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $help -notmatch 'Uso: perfect' -or $help -notmatch 'objetivo\|goal' -or $help -notmatch 'reanudar\|resume') { throw 'La ayuda instalada no está localizada o perdió compatibilidad' }
    if ((& $exe --version).Trim() -ne $expectedVersion) { throw 'La versión portable no coincide con el paquete' }
  } finally { Remove-Item $temp -Recurse -Force }
  if ($Installer) {
    $setup = Join-Path (Split-Path (Resolve-Path $Package) -Parent) 'Perfect-Harness-Setup-x64.exe'
    $dest = Join-Path $env:RUNNER_TEMP ('Perfect Installed ' + [Guid]::NewGuid())
    $beforePath = [Environment]::GetEnvironmentVariable('Path','User')
    $p = Start-Process $setup -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="' + $dest + '"'),'/TASKS=addpath','/LANG=spanish') -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "El instalador terminó con código $($p.ExitCode)" }
    if ((& "$dest/Perfect.exe" --version).Trim() -ne $expectedVersion) { throw 'Falló la versión del ejecutable instalado' }
    $installedHelp = (& "$dest/Perfect.exe" --sin-interfaz --ayuda) -join "`n"
    if ($installedHelp -notmatch 'Uso: perfect' -or $installedHelp -notmatch 'conectar\|login') { throw 'Falló la ayuda española después de instalar' }
    if ([Environment]::GetEnvironmentVariable('Path','User') -notlike "*$dest*") { throw 'No se actualizó el PATH del usuario' }
    $uninstall = Start-Process "$dest/unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw 'Falló la desinstalación' }
    if ([Environment]::GetEnvironmentVariable('Path','User') -ne $beforePath) { throw 'La desinstalación no conservó el PATH original' }
  }
  Write-Host "WINDOWS_PACKAGE_PROFILE_CLI_SMOKE_PASS version=$expectedVersion idioma=es"
} finally {
  if ($hadProfile) { New-Item -ItemType Directory (Split-Path $profile -Parent) -Force | Out-Null; [IO.File]::WriteAllBytes($profile,$oldProfile) }
  elseif (Test-Path $profile) { Remove-Item $profile }
}
