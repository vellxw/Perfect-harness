param([switch]$Installer)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not $IsWindows) { throw 'Build this package on Windows x64.' }
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
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
npm ci --omit=dev --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Production dependency install failed' }
Pop-Location
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw '.NET Framework compiler unavailable on this build machine' }
$sourcePath = (Resolve-Path (Join-Path $root 'src\windows\Perfect.cs')).Path
$iconPath = (Resolve-Path (Join-Path $root 'assets\brand\perfect.ico')).Path
$manifestPath = (Resolve-Path (Join-Path $root 'src\windows\Perfect.manifest')).Path
$exePath = Join-Path $out 'Perfect.exe'
Write-Host "Compiling $sourcePath into $exePath"
& $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$exePath" "/win32icon:$iconPath" "/win32manifest:$manifestPath" /reference:System.Windows.Forms.dll $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Windows launcher compilation failed' }
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
$files = Get-ChildItem $out -Recurse -File | Sort-Object FullName | ForEach-Object { @{path=[IO.Path]::GetRelativePath($out,$_.FullName).Replace('\','/');sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length} }
@{version=$version;node=(& "$out\runtime\node.exe" --version);platform='win32-x64';signing='unsigned launcher; a release certificate is required for Authenticode';files=$files} | ConvertTo-Json -Depth 5 | Set-Content "$out\package-integrity.json" -Encoding utf8NoBOM
$zip = Join-Path $root 'release\Perfect-Harness-Windows-x64.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $out -DestinationPath $zip -CompressionLevel Optimal
if ($Installer) {
  $iscc = Get-ChildItem "${env:ProgramFiles(x86)}\Inno Setup*\ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $iscc) { throw 'Install the official Inno Setup compiler explicitly first.' }
  & $iscc.FullName "/DPayload=$out" "/DOutput=$root\release" (Join-Path $root 'build\windows\perfect.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
}
Get-ChildItem "$root\release" -File | Where-Object Name -ne 'SHA256SUMS.txt' | ForEach-Object { $h=Get-FileHash $_.FullName -Algorithm SHA256; "$($h.Hash.ToLowerInvariant())  $($_.Name)" } | Set-Content "$root\release\SHA256SUMS.txt" -Encoding utf8NoBOM
Write-Host "Windows package created: $zip"
