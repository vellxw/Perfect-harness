param([switch]$Installer)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'Build Perfect Desktop V5 on Windows x64.'}
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$package=Get-Content package.json -Raw | ConvertFrom-Json
$version=$package.version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Expected a numeric package version'}
if($version -ne '0.5.0'){Write-Host "Packaging version $version"}
$release=Join-Path $root 'release'
$electronOut=Join-Path $release 'electron-staging'
$payload=Join-Path $release 'Perfect-Harness-Windows-x64'
Remove-Item $electronOut,$payload -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $release,$electronOut -Force|Out-Null

# Native integrations are compiled explicitly; the installer never downloads them on first launch.
& (Join-Path $root 'scripts\prepare-desktop.ps1')
if($LASTEXITCODE -ne 0){throw 'Native Windows integration preparation failed'}
node scripts/build-brand.mjs
if($LASTEXITCODE -ne 0){throw 'Brand asset build failed'}
npm run build:desktop
if($LASTEXITCODE -ne 0){throw 'Desktop production build failed'}
node node_modules/electron/install.js
if($LASTEXITCODE -ne 0){throw 'Electron runtime preparation failed'}

$packager=Join-Path $root 'node_modules\.bin\electron-packager.cmd'
& $packager (Join-Path $root 'desktop') 'Perfect' --platform=win32 --arch=x64 --electron-version=44.3.0 "--out=$electronOut" --overwrite --asar "--icon=$root\assets\brand\perfect.ico" "--app-version=$version"
if($LASTEXITCODE -ne 0){throw 'Electron Packager failed'}
$packed=Join-Path $electronOut 'Perfect-win32-x64'
if(-not(Test-Path (Join-Path $packed 'Perfect.exe') -PathType Leaf)){throw 'Packaged GUI executable missing'}
Move-Item $packed $payload
Remove-Item $electronOut -Recurse -Force

# The controller keeps Node 26 separate from Electron's embedded Node.
$engine=Join-Path $payload 'resources\engine'
New-Item -ItemType Directory "$engine\runtime","$engine\assets\windows" -Force|Out-Null
Copy-Item (Get-Command node).Source "$engine\runtime\node.exe"
$nodeLicense=Join-Path (Split-Path (Get-Command node).Source -Parent) 'LICENSE'
if(Test-Path $nodeLicense){Copy-Item $nodeLicense "$engine\runtime\LICENSE"}
else{Invoke-WebRequest 'https://raw.githubusercontent.com/nodejs/node/v26.4.0/LICENSE' -OutFile "$engine\runtime\LICENSE"}
Copy-Item dist "$engine\dist" -Recurse
Copy-Item package.json,package-lock.json "$engine\"
Copy-Item perfect.config.example.json,perfect.config.schema.json "$engine\"
Copy-Item assets/windows/desktop "$engine\assets\windows\desktop" -Recurse
Push-Location $engine
try{
  npm ci --omit=dev --ignore-scripts
  if($LASTEXITCODE -ne 0){throw 'Engine production dependency install failed'}
}finally{Pop-Location}

# Keep the shell command separate from the GUI executable on case-insensitive Windows filesystems.
$bin=Join-Path $payload 'bin';New-Item -ItemType Directory $bin -Force|Out-Null
$cli='@echo off`r`n"%~dp0..\resources\engine\runtime\node.exe" "%~dp0..\resources\engine\dist\cli\index.js" %*`r`n'
[IO.File]::WriteAllText((Join-Path $bin 'perfect.cmd'),$cli,[Text.Encoding]::ASCII)

# Harden the exact GUI binary after Packager embedded ASAR integrity metadata and before hashing/installing it.
node scripts/desktop/harden-electron.mjs (Join-Path $payload 'Perfect.exe') (Join-Path $release 'electron-fuses.json')
if($LASTEXITCODE -ne 0){throw 'Electron fuse hardening failed'}

# Smoke the bundled engine/CLI without using global Node or npm.
$oldPath=$env:PATH
try{
  $env:PATH="$env:WINDIR\System32;$env:WINDIR"
  $actual=& (Join-Path $bin 'perfect.cmd') --version
  if($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $version){throw 'Bundled CLI --version failed without external Node/npm'}
  $nodeVersion=& "$engine\runtime\node.exe" --version
  if($nodeVersion.Trim() -ne 'v26.4.0'){throw "Unexpected bundled engine runtime: $nodeVersion"}
}finally{$env:PATH=$oldPath}

$build=Get-Content "$payload\resources\app.asar" -ErrorAction SilentlyContinue
# build-info remains inside app.asar; keep an external immutable manifest for distribution provenance too.
$sourceCommit=(git rev-parse HEAD).Trim()
$files=Get-ChildItem $payload -Recurse -File|Sort-Object FullName|ForEach-Object{@{path=[IO.Path]::GetRelativePath($payload,$_.FullName).Replace('\','/');sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length}}
$manifest=@{version=$version;sourceCommit=$sourceCommit;electron='44.3.0';engineNode='26.4.0';platform='win32-x64';gui='Perfect.exe';cli='bin/perfect.cmd';signing='unsigned; Authenticode certificate not configured';state='user profile, separate from binaries';files=$files}
$manifest|ConvertTo-Json -Depth 6|Set-Content "$payload\build-manifest.json" -Encoding utf8NoBOM
Copy-Item (Join-Path $release 'electron-fuses.json') "$payload\electron-fuses.json"

$zip=Join-Path $release 'Perfect-Harness-Windows-x64.zip';Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$payload\*" -DestinationPath $zip -CompressionLevel Optimal
$distributed=@($zip)
if($Installer){
  $compiler=$env:PERFECT_ISCC
  if(-not $compiler){$compiler=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 7\ISCC.exe'}
  if(-not(Test-Path $compiler)){throw 'Prepare pinned Inno Setup 7 or set PERFECT_ISCC.'}
  & $compiler /Qp "/DPayload=$payload" "/DOutput=$release" "/DAppVersion=$version" (Join-Path $root 'build\windows\perfect.iss')
  if($LASTEXITCODE -ne 0){throw 'Installer compilation failed'}
  $distributed+=Join-Path $release 'Perfect-Harness-Setup-x64.exe'
}
$distributed|ForEach-Object{$h=Get-FileHash $_ -Algorithm SHA256;"$($h.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))"}|Set-Content "$release\SHA256SUMS.txt" -Encoding utf8NoBOM
Write-Host "Perfect Desktop V5 package: $payload"
