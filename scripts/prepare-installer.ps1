# Build dependency only. Never runs as part of the Perfect installer.
$ErrorActionPreference='Stop'
$download=Join-Path $env:RUNNER_TEMP 'innosetup-7.0.2-x86.exe'
$url='https://github.com/jrsoftware/issrc/releases/download/is-7_0_2/innosetup-7.0.2-x86.exe'
$expected='2b8734490a83f1ed074022b85d46c5ce9c3e2fbe9b63a45c28a74b478ac3a94f'
# Published digest from the immutable official is-7_0_2 release.
Invoke-WebRequest $url -OutFile $download -TimeoutSec 120
if((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Inno Setup checksum mismatch'}
if((Get-AuthenticodeSignature $download).Status -ne 'Valid'){throw 'Inno Setup publisher signature could not be validated'}
$directory=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 7'
$p=Start-Process $download -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/ALLUSERS',('/DIR="'+$directory+'"')) -Wait -PassThru
if($p.ExitCode -ne 0){throw "Inno Setup preparation failed: $($p.ExitCode)"}
$compiler=Join-Path $directory 'ISCC.exe'
if(-not(Test-Path $compiler)){throw 'Pinned compiler is absent'}
# /? reports only the frontend's major version. A harmless compile loads ISCmplr.dll
# and reports the exact engine version. Output=no creates no installer to execute.
$probe=Join-Path $env:RUNNER_TEMP ('perfect-compiler-probe-'+[Guid]::NewGuid()+'.iss')
@'
[Setup]
AppName=Perfect Compiler Probe
AppVersion=0.0.0
DefaultDirName={tmp}\PerfectCompilerProbe
CreateAppDir=no
Uninstallable=no
Output=no
'@ | Set-Content $probe -Encoding utf8NoBOM
try {
  $banner=(& $compiler $probe 2>&1 | Out-String)
  $code=$LASTEXITCODE
  Write-Host $banner
  if($code -ne 0){throw "Inno Setup compiler probe failed: $code"}
  if($banner -notmatch 'Compiler engine version:\s*Inno Setup 7\.0\.2\b'){throw 'Wrong Inno Setup compiler engine version'}
} finally {Remove-Item $probe -Force -ErrorAction SilentlyContinue}
$env:PERFECT_ISCC=$compiler
if($env:GITHUB_ENV){"PERFECT_ISCC=$compiler" | Out-File $env:GITHUB_ENV -Append -Encoding utf8}
Write-Host 'Pinned Inno Setup 7.0.2 compiler verified; explicit path prevents shadowing by preinstalled 6.x'
