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
$actual=[Diagnostics.FileVersionInfo]::GetVersionInfo($compiler)
if($actual.FileMajorPart -ne 7 -or $actual.FileMinorPart -ne 0 -or $actual.FileBuildPart -ne 2){throw 'Wrong Inno Setup compiler version'}
$selected=Get-ChildItem "${env:ProgramFiles(x86)}/Inno Setup*/ISCC.exe" | Select-Object -First 1
if($selected.FullName -ne $compiler){throw 'A different compiler would shadow pinned Inno Setup 7'}
Write-Host "Pinned compiler verified: $($actual.FileVersion); supports long Node dependency paths"
