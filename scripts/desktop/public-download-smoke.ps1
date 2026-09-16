param([Parameter(Mandatory=$true)][string]$Receipt)
$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true'){throw 'This smoke uses only the owned Windows CI environment'}
$report=Get-Content -LiteralPath $Receipt -Raw | ConvertFrom-Json
$sha=(git rev-parse HEAD).Trim()
if($report.status -ne 'PUBLISHED_AND_PUBLIC_HASH_VERIFIED' -or $report.sourceCommit -ne $sha -or $report.version -notmatch '^0\.5\.\d+$'){throw 'Invalid publication receipt or checkout'}
$root=Join-Path $env:RUNNER_TEMP ('Perfect Public Smoke ñ '+[Guid]::NewGuid())
$out=[IO.Path]::GetFullPath('test-results/desktop/public-smoke')
New-Item -ItemType Directory $root,$out,(Join-Path $root 'home'),(Join-Path $root 'workspace'),(Join-Path $root 'tools'),(Join-Path $root 'images') -Force | Out-Null
$oldTestRoot=$env:PERFECT_TEST_ROOT
$env:PERFECT_TEST_ROOT=$root
$result=@{status='RUNNING';sourceCommit=$sha;version=$report.version;platform=(Get-CimInstance Win32_OperatingSystem).Caption;personalProviders=$false;personalWindows11=$false;downloadAuthentication='none';checks=@();startedAt=[DateTime]::UtcNow.ToString('o')}
$oldPath=$env:PATH;$oldNode=$env:NODE_OPTIONS;$oldRunAsNode=$env:ELECTRON_RUN_AS_NODE
try {
 foreach($name in @('Perfect-Harness-Windows-x64.zip','Perfect-Harness-Setup-x64.exe')){
  $expected=@($report.files | Where-Object name -EQ $name)
  if($expected.Count -ne 1 -or $expected[0].sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Missing expected public asset hash'}
  $path=Join-Path $root $name
  Invoke-WebRequest "https://github.com/vellxw/Perfect-harness/releases/download/v$($report.version)/$name" -OutFile $path -TimeoutSec 240
  if((Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected[0].sha256){throw "Public hash mismatch: $name"}
  $result.checks+=@{name=$name;sha256=$expected[0].sha256;status='HASH_VERIFIED'}
 }
 Expand-Archive -LiteralPath (Join-Path $root 'Perfect-Harness-Windows-x64.zip') -DestinationPath (Join-Path $root 'portable')
 $payload=Join-Path $root 'portable/Perfect-Harness-Windows-x64'
 node scripts/desktop/check-windows-package.mjs $payload $sha (Join-Path $out 'byte-check.json')
 if($LASTEXITCODE -ne 0){throw 'Downloaded package integrity check failed'}
 $framework=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
 $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
 $vs=(& $vswhere -latest -products '*' -property installationPath).Trim()
 $compiler=Join-Path $vs 'MSBuild/Current/Bin/Roslyn/csc.exe'
 $probe=Join-Path $root 'tools/PerfectV5Probe.exe'
 & $compiler /nologo /target:exe /platform:x64 /langversion:latest /main:PerfectProbeEntry /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/reference:$framework/WPF/UIAutomationClient.dll" "/reference:$framework/WPF/UIAutomationTypes.dll" "/reference:$framework/WPF/WindowsBase.dll" "/out:$probe" (Resolve-Path tests/windows/PerfectV5Probe.cs).Path (Resolve-Path tests/windows/PerfectProbeEntry.cs).Path
 if($LASTEXITCODE -ne 0){throw 'Native public-binary probe did not compile'}
 $nodeProbe=Join-Path $root 'tools/RestrictedNodeProbe.exe'
 & (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 "/out:$nodeProbe" (Resolve-Path tests/windows/RestrictedNodeProbe.cs).Path
 if($LASTEXITCODE -ne 0){throw 'Restricted Node test launcher did not compile'}
 Copy-Item scripts/desktop/desktop-cli-check.mjs (Join-Path $root 'tools/desktop-cli-check.mjs')
 $work=Join-Path $root 'workspace';$dataHome=Join-Path $root 'home'
 '# Public download smoke: synthetic project, no providers' | Set-Content (Join-Path $work 'README.md') -Encoding utf8NoBOM
 $env:PATH="$env:WINDIR\System32;$env:WINDIR";$env:NODE_OPTIONS=$null;$env:ELECTRON_RUN_AS_NODE=$null
 $cliResult=Join-Path $root 'cli-result.json'
 & $nodeProbe (Join-Path $payload 'resources/engine/runtime/node.exe') (Join-Path $root 'tools/desktop-cli-check.mjs') $payload $dataHome $work $cliResult
 if($LASTEXITCODE -ne 0 -or -not (Test-Path $cliResult)){throw 'Public downloaded CLI did not run with bundled Node'}
 if(-not (Get-Content $cliResult -Raw | ConvertFrom-Json).passed){throw 'Public CLI result failed'}
 & $probe journey (Join-Path $payload 'Perfect.exe') $dataHome $work (Join-Path $root 'images') smoke
 if($LASTEXITCODE -ne 0){throw 'Final hardened public GUI failed its native mouse/keyboard smoke'}
 Copy-Item $cliResult (Join-Path $out 'cli-result.json')
 $result.checks+=@{name='Native final public binary';status='PASS';method='Actual hardened Electron GUI and bundled CLI, restricted standard-user token, no CDP or global Node'}
 $result.status='PASS'
} catch {$result.status='FAIL';$result.error=$_.Exception.Message;throw}
finally {
 $env:PATH=$oldPath;$env:NODE_OPTIONS=$oldNode;$env:ELECTRON_RUN_AS_NODE=$oldRunAsNode;$env:PERFECT_TEST_ROOT=$oldTestRoot
 if(Test-Path (Join-Path $root 'images')){Copy-Item (Join-Path $root 'images') (Join-Path $out 'images') -Recurse -Force}
 $result.finishedAt=[DateTime]::UtcNow.ToString('o')
 $result | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $out 'result.json') -Encoding utf8NoBOM
 Write-Host ($result | ConvertTo-Json -Depth 8)
 # Only the uniquely owned test directory is removed. User installations and registry are untouched.
 Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
