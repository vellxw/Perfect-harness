param([switch]$Installer)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not $IsWindows) { throw 'Build this package on Windows x64.' }
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a numeric package version' }
$out = Join-Path $root 'release\Perfect-Harness-Windows-x64'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory "$out\runtime","$out\app","$out\assets" -Force | Out-Null
& (Join-Path $PSScriptRoot 'prepare-desktop.ps1')
node scripts/build-brand.mjs
if ($LASTEXITCODE -ne 0) { throw 'Icon build failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed' }
Copy-Item (Get-Command node).Source "$out\runtime\node.exe"
$nodeLicense = Join-Path (Split-Path (Get-Command node).Source -Parent) 'LICENSE'
if (Test-Path $nodeLicense) { Copy-Item $nodeLicense "$out\runtime\LICENSE" }
else { Invoke-WebRequest 'https://raw.githubusercontent.com/nodejs/node/v26.4.0/LICENSE' -OutFile "$out\runtime\LICENSE" }
Copy-Item package.json,package-lock.json "$out\app\"
Copy-Item dist "$out\app\" -Recurse
Copy-Item assets/brand,assets/windows "$out\assets\" -Recurse
Copy-Item README.md,SECURITY.md,LICENSE "$out\"
Copy-Item docs,examples "$out\app\" -Recurse
Copy-Item perfect.config.example.json,perfect.config.schema.json "$out\app\"
Push-Location "$out\app"
try {
  npm ci --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Production dependency install failed' }
} finally { Pop-Location }
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw '.NET Framework compiler unavailable on this build machine' }
$sourceOriginal = (Resolve-Path (Join-Path $root 'src\windows\Perfect.cs')).Path
$sourcePath = Join-Path $root 'release\Perfect.generated.cs'
$sourceText = [IO.File]::ReadAllText($sourceOriginal) -replace '(?<=AssemblyVersion\(")[^"]+(?="\))', "$version.0" -replace '(?<=AssemblyFileVersion\(")[^"]+(?="\))', "$version.0"
[IO.File]::WriteAllText($sourcePath,$sourceText)
$iconPath = (Resolve-Path (Join-Path $root 'assets\brand\perfect.ico')).Path
$manifestPath = (Resolve-Path (Join-Path $root 'src\windows\Perfect.manifest')).Path
$exePath = Join-Path $out 'Perfect.exe'
Write-Host "Compiling $sourcePath into $exePath"
try {
  & $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$exePath" "/win32icon:$iconPath" "/win32manifest:$manifestPath" /reference:System.Windows.Forms.dll $sourcePath
  if ($LASTEXITCODE -ne 0) { throw 'Windows launcher compilation failed' }
} finally { Remove-Item $sourcePath -Force -ErrorAction SilentlyContinue }
$metadata = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exePath)
if ($metadata.ProductName -ne 'Perfect Harness' -or $metadata.FileVersion -ne "$version.0") { throw 'Incorrect executable metadata' }
$oldPath = $env:PATH
try {
  $env:PATH = "$env:WINDIR\System32;$env:WINDIR"
  $actual = & $exePath --version
  if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $version) { throw 'Bundled --version failed without external Node/npm' }
} finally { $env:PATH = $oldPath }
$profile = & $exePath --print-profile | ConvertFrom-Json
if ($profile.profiles[0].name -ne 'Perfect Harness' -or $profile.profiles[0].opacity -ne 88) { throw 'Terminal fragment invalid' }
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
if ($null -eq $icon) { throw 'Executable has no icon resource' }
$icon.Dispose()
$identity = Get-Content "$out\app\dist\build-info.json" -Raw | ConvertFrom-Json
if ($identity.version -ne $version -or $identity.sourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'Missing exact build provenance' }
$identity | ConvertTo-Json -Depth 5 | Set-Content "$out\build-manifest.json" -Encoding utf8NoBOM
$files = Get-ChildItem $out -Recurse -File | Sort-Object FullName | ForEach-Object {
  @{path=[IO.Path]::GetRelativePath($out,$_.FullName).Replace('\','/');sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length}
}
@{version=$version;sourceCommit=$identity.sourceCommit;node=(& "$out\runtime\node.exe" --version);platform='win32-x64';signing='unsigned launcher; a release certificate is required for Authenticode';files=$files} | ConvertTo-Json -Depth 5 | Set-Content "$out\package-integrity.json" -Encoding utf8NoBOM
$zip = Join-Path $root 'release\Perfect-Harness-Windows-x64.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $out -DestinationPath $zip -CompressionLevel Optimal
$distributed = @($zip)
if ($Installer) {
  $iscc = Get-ChildItem "${env:ProgramFiles(x86)}\Inno Setup*\ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $iscc) { throw 'Install the official Inno Setup compiler explicitly first.' }
  & $iscc.FullName "/DPayload=$out" "/DOutput=$root\release" "/DAppVersion=$version" (Join-Path $root 'build\windows\perfect.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
  $distributed += Join-Path $root 'release\Perfect-Harness-Setup-x64.exe'
}
$distributed | ForEach-Object { $h=Get-FileHash $_ -Algorithm SHA256; "$($h.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))" } | Set-Content "$root\release\SHA256SUMS.txt" -Encoding utf8NoBOM
Write-Host "Windows package created: $zip"
