param([switch]$Installer)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Build this package on Windows x64.' }
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$out = Join-Path $root 'release/Perfect-Harness-Windows-x64'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory "$out/runtime","$out/app","$out/assets" -Force | Out-Null
node scripts/build-brand.mjs
if ($LASTEXITCODE -ne 0) { throw 'Icon build failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed' }
Copy-Item (Get-Command node).Source "$out/runtime/node.exe"
Copy-Item package.json,package-lock.json "$out/app/"
Copy-Item dist "$out/app/" -Recurse
Copy-Item assets/brand,assets/windows "$out/assets/" -Recurse
Copy-Item README.md,SECURITY.md,LICENSE "$out/"
Copy-Item docs,examples "$out/app/" -Recurse
Copy-Item perfect.config.example.json,perfect.config.schema.json "$out/app/"
Push-Location "$out/app"
npm ci --omit=dev --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Production dependency install failed' }
Pop-Location
# The user does not need Node/npm installed. The launcher and node runtime are separate files on purpose.
$csc = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path $csc)) { throw '.NET Framework C# compiler not available on this build machine' }
& $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$out/Perfect.exe" "/win32icon:$root/assets/brand/perfect.ico" "/win32manifest:$root/src/windows/Perfect.manifest" /reference:System.Windows.Forms.dll "$root/src/windows/Perfect.cs"
if ($LASTEXITCODE -ne 0) { throw 'Windows launcher compilation failed' }
$metadata = [System.Diagnostics.FileVersionInfo]::GetVersionInfo("$out/Perfect.exe")
if ($metadata.ProductName -ne 'Perfect Harness' -or $metadata.FileVersion -ne "$version.0") { throw 'Incorrect executable metadata' }
$oldPath = $env:PATH
try {
  $env:PATH = "$env:WINDIR/System32;$env:WINDIR"
  $actual = & "$out/Perfect.exe" --version
  if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $version) { throw 'Bundled launcher --version failed without external Node/npm' }
} finally { $env:PATH = $oldPath }
$profile = & "$out/Perfect.exe" --print-profile | ConvertFrom-Json
if ($profile.profiles[0].name -ne 'Perfect Harness' -or $profile.profiles[0].opacity -ne 88) { throw 'Terminal fragment is invalid' }
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon("$out/Perfect.exe")
if ($null -eq $icon) { throw 'Executable has no icon resource' }
$icon.Dispose()
$files = Get-ChildItem $out -Recurse -File | Sort-Object FullName | ForEach-Object { @{path=[IO.Path]::GetRelativePath($out,$_.FullName).Replace('\','/');sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length} }
@{version=$version;node=(& "$out/runtime/node.exe" --version);platform='win32-x64';signing='unsigned launcher; signing requires a release certificate';files=$files} | ConvertTo-Json -Depth 5 | Set-Content "$out/package-integrity.json" -Encoding utf8NoBOM
$zip = Join-Path $root 'release/Perfect-Harness-Windows-x64.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $out -DestinationPath $zip -CompressionLevel Optimal
if ($Installer) {
  $iscc = Get-ChildItem "${env:ProgramFiles(x86)}/Inno Setup*/ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $iscc) { throw 'Inno Setup is not installed. Install the pinned official compiler explicitly.' }
  & $iscc.FullName "/DPayload=$out" "/DOutput=$root/release" "$root/build/windows/perfect.iss"
  if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
}
Get-ChildItem "$root/release" -File | ForEach-Object { $h=Get-FileHash $_.FullName -Algorithm SHA256; "$($h.Hash.ToLowerInvariant())  $($_.Name)" } | Set-Content "$root/release/SHA256SUMS.txt" -Encoding utf8NoBOM
Write-Host "Windows package created: $zip"
