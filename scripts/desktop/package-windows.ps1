param([switch]$Installer)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Build Perfect Desktop on Windows x64.' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$package = Get-Content package.json -Raw | ConvertFrom-Json
$version = $package.version
$electronVersion = $package.devDependencies.electron
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a numeric package version' }
if ((node --version).Trim() -ne 'v26.4.0') { throw 'Use the pinned Node 26.4.0 build runtime' }
$release = Join-Path $root 'release'
$electronOut = Join-Path $release 'electron-staging'
$payload = Join-Path $release 'Perfect-Harness-Windows-x64'
Remove-Item $electronOut,$payload -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $release -Force | Out-Null
& (Join-Path $root 'scripts\prepare-desktop.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Native Windows integration preparation failed' }
node scripts/build-brand.mjs
if ($LASTEXITCODE -ne 0) { throw 'Brand asset build failed' }
npm run build:desktop
if ($LASTEXITCODE -ne 0) { throw 'Desktop production build failed' }
node node_modules/electron/install.js
if ($LASTEXITCODE -ne 0) { throw 'Electron runtime preparation failed' }
node scripts/desktop/package-app.mjs
if ($LASTEXITCODE -ne 0) { throw 'Electron Packager failed' }
$packed = Join-Path $electronOut 'Perfect-win32-x64'
if (-not (Test-Path (Join-Path $packed 'Perfect.exe') -PathType Leaf)) { throw 'Packaged GUI executable missing' }
Move-Item $packed $payload
Remove-Item $electronOut -Recurse -Force
$engine = Join-Path $payload 'resources\engine'
New-Item -ItemType Directory "$engine\runtime","$engine\assets\windows" -Force | Out-Null
$nodeExecutable = (Get-Command node).Source
Copy-Item $nodeExecutable "$engine\runtime\node.exe"
$nodeLicense = Join-Path (Split-Path $nodeExecutable -Parent) 'LICENSE'
if (Test-Path $nodeLicense) { Copy-Item $nodeLicense "$engine\runtime\LICENSE" }
else { Invoke-WebRequest 'https://raw.githubusercontent.com/nodejs/node/v26.4.0/LICENSE' -OutFile "$engine\runtime\LICENSE" }
Copy-Item dist "$engine\dist" -Recurse
Copy-Item package.json,package-lock.json,perfect.config.example.json,perfect.config.schema.json "$engine\"
Copy-Item docs,examples "$engine\" -Recurse
Copy-Item assets/windows/desktop "$engine\assets\windows\desktop" -Recurse
Copy-Item assets/brand "$engine\assets\brand" -Recurse
Copy-Item README.md,SECURITY.md "$payload\"
Copy-Item LICENSE "$payload\LICENSE-Perfect.txt"
@{schemaVersion=1;relativeExecutable='../../Perfect.exe'} | ConvertTo-Json | Set-Content "$engine\desktop-launch.json" -Encoding utf8NoBOM
Push-Location $engine
try {
  npm ci --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Engine production dependency install failed' }
} finally { Pop-Location }
node scripts/desktop/write-cli.mjs $payload
if ($LASTEXITCODE -ne 0) { throw 'Isolated CLI launcher preparation failed' }
$bin = Join-Path $payload 'bin'
node scripts/desktop/harden-electron.mjs (Join-Path $payload 'Perfect.exe') (Join-Path $payload 'electron-fuses.json')
if ($LASTEXITCODE -ne 0) { throw 'Electron fuse hardening failed' }
$oldPath = $env:PATH
try {
  $env:PATH = "$env:WINDIR\System32;$env:WINDIR"
  $actual = & (Join-Path $bin 'perfect.cmd') --version
  if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $version) { throw 'Bundled CLI --version failed without external Node/npm' }
  $nodeVersion = & "$engine\runtime\node.exe" --version
  if ($nodeVersion.Trim() -ne 'v26.4.0') { throw "Unexpected bundled engine runtime: $nodeVersion" }
} finally { $env:PATH = $oldPath }
$sourceCommit = (git rev-parse HEAD).Trim()
$engineIdentity = Get-Content "$engine\dist\build-info.json" -Raw | ConvertFrom-Json
$desktopIdentity = Get-Content 'desktop/build-info.json' -Raw | ConvertFrom-Json
if ($engineIdentity.sourceCommit -ne $sourceCommit -or $desktopIdentity.sourceCommit -ne $sourceCommit -or $engineIdentity.version -ne $version -or $desktopIdentity.version -ne $version) { throw 'Engine/Desktop/source identity mismatch' }
$manifest = @{schemaVersion=1;version=$version;sourceCommit=$sourceCommit;electron=$electronVersion;engineNode='26.4.0';platform='win32-x64';gui='Perfect.exe';cli='bin/perfect.cmd';signing='unsigned';state='PERFECT_HOME or user .local/share/perfect-harness; never inside the installation directory'}
$manifest | ConvertTo-Json -Depth 6 | Set-Content "$payload\build-manifest.json" -Encoding utf8NoBOM
$files = Get-ChildItem $payload -Recurse -File | Sort-Object FullName | ForEach-Object {
  @{path=[IO.Path]::GetRelativePath($payload,$_.FullName).Replace('\','/');sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length}
}
@{schemaVersion=1;version=$version;sourceCommit=$sourceCommit;files=$files} | ConvertTo-Json -Depth 6 | Set-Content "$payload\package-integrity.json" -Encoding utf8NoBOM
node scripts/desktop/check-windows-package.mjs $payload $sourceCommit 'test-results/desktop/package-byte-check.json'
if ($LASTEXITCODE -ne 0) { throw 'Packaged files/fuses/source validation failed' }
$zip = Join-Path $release 'Perfect-Harness-Windows-x64.zip'
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $payload -DestinationPath $zip -CompressionLevel Optimal
$distributed = @($zip)
if ($Installer) {
  $compiler = $env:PERFECT_ISCC
  if (-not $compiler) { $compiler = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 7\ISCC.exe' }
  if (-not (Test-Path $compiler)) { throw 'Prepare pinned Inno Setup 7 or set PERFECT_ISCC.' }
  & $compiler /Qp "/DPayload=$payload" "/DOutput=$release" "/DAppVersion=$version" (Join-Path $root 'build\windows\perfect.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
  $distributed += Join-Path $release 'Perfect-Harness-Setup-x64.exe'
}
$distributed | ForEach-Object { $h=Get-FileHash $_ -Algorithm SHA256; "$($h.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))" } | Set-Content "$release\SHA256SUMS.txt" -Encoding utf8NoBOM
Write-Host "Perfect Desktop $version package: $payload"
