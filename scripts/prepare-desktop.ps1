param([string]$Output='assets/windows/desktop')
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'El módulo de escritorio se prepara en Windows x64'}
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
# PowerShell's location is not necessarily the .NET process current directory.
# Resolve against this checkout, including when it lives in a nested upgrade fixture.
$out=[IO.Path]::GetFullPath($Output,$root)
New-Item -ItemType Directory $out -Force | Out-Null
$tmp=Join-Path ([IO.Path]::GetTempPath()) ('perfect-winapp-'+[Guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
  $zip=Join-Path $tmp 'winapp.zip'
  Invoke-WebRequest 'https://github.com/microsoft/winappCli/releases/download/v0.6.0/winappcli-x64.zip' -OutFile $zip -TimeoutSec 90
  if((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'f6dc42e3b4e4709c8f617003008e2cfdd9a51735e04e7170d60edda258db78a8'){throw 'La descarga oficial no coincide con la versión aprobada'}
  Expand-Archive $zip (Join-Path $tmp 'files')
  foreach($name in @('winapp.exe','libSkiaSharp.dll')){
    $file=Get-ChildItem (Join-Path $tmp 'files') -Recurse -Filter $name | Select-Object -First 1
    if(-not $file){throw "Falta $name en el paquete oficial"}
    Copy-Item $file.FullName (Join-Path $out $name)
  }
  Invoke-WebRequest 'https://raw.githubusercontent.com/microsoft/winappCli/b7494ed3b324d6e378cb17b477f2b1a9729765d0/LICENSE' -OutFile (Join-Path $out 'WinApp-LICENSE.txt') -TimeoutSec 30
  $framework=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
  $csc=Join-Path $framework 'csc.exe'
  $source=(Resolve-Path 'src/windows/DesktopGuard.cs').Path
  & $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$out/Perfect.DesktopGuard.exe" /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll $source
  if($LASTEXITCODE -ne 0){throw 'No se compiló la frontera de permisos de escritorio'}
  $element=(Resolve-Path 'src/windows/DesktopElementGuard.cs').Path
  & $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$out/Perfect.DesktopElementGuard.exe" /reference:System.Web.Extensions.dll "/reference:$framework/WPF/UIAutomationClient.dll" "/reference:$framework/WPF/UIAutomationTypes.dll" "/reference:$framework/WPF/WindowsBase.dll" $element
  if($LASTEXITCODE -ne 0){throw 'No se compiló la comprobación independiente de campos privados'}
  $vaultSource=(Resolve-Path 'src/windows/CredentialVault.cs').Path
  & $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$out/Perfect.CredentialVault.exe" /reference:System.Security.dll $vaultSource
  if($LASTEXITCODE -ne 0){throw 'No se compiló el almacén cifrado de credenciales'}
  foreach($required in @('winapp.exe','libSkiaSharp.dll','Perfect.DesktopGuard.exe','Perfect.DesktopElementGuard.exe','Perfect.CredentialVault.exe')){
    if(-not(Test-Path (Join-Path $out $required) -PathType Leaf)){throw "Falta recurso nativo en la carpeta de este checkout: $required"}
  }
  @{backend='Microsoft WinApp CLI';version='0.6.0';archiveSha256='f6dc42e3b4e4709c8f617003008e2cfdd9a51735e04e7170d60edda258db78a8';files=@(Get-ChildItem $out -File | ForEach-Object {@{name=$_.Name;sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $out 'provenance.json') -Encoding utf8NoBOM
} finally {Remove-Item $tmp -Recurse -Force}
Write-Host 'Módulo de escritorio preparado: UIA, ventana limitada y Ctrl+Alt+F10. No se activó el control del equipo.'
