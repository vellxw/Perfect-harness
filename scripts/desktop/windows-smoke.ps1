param([string]$Release='release',[string]$PreviousInstaller)
$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true'){throw 'Installer and registry tests require the owned Windows CI runner'}
Add-Type -AssemblyName System.Windows.Forms
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$releaseRoot=(Resolve-Path $Release).Path;$node=(Get-Command node).Source;$sha=(git -C $repo rev-parse HEAD).Trim()
$out=Join-Path $repo 'test-results/desktop/windows-package'
$testRoot=Join-Path $env:RUNNER_TEMP ('Perfect V5 verificación ñ '+[Guid]::NewGuid())
New-Item -ItemType Directory $out,$testRoot,(Join-Path $testRoot 'tools') -Force | Out-Null
$env:PERFECT_TEST_ROOT=$testRoot
$probe=$env:PERFECT_V5_PROBE;$nodeProbe=$env:PERFECT_RESTRICTED_NODE
if(-not(Test-Path $probe -PathType Leaf) -or -not(Test-Path $nodeProbe -PathType Leaf)){throw 'The native non-admin probes are missing'}
Copy-Item (Join-Path $PSScriptRoot 'desktop-cli-check.mjs'),(Join-Path $PSScriptRoot 'upgrade-fixture.mjs') (Join-Path $testRoot 'tools')
$beforePath=[string][Environment]::GetEnvironmentVariable('Path','User')
$processPath=$env:PATH;$beforeNodeOptions=$env:NODE_OPTIONS;$beforeRunAsNode=$env:ELECTRON_RUN_AS_NODE
$profile=Join-Path $env:LOCALAPPDATA 'Microsoft/Windows Terminal/Fragments/PerfectHarness/PerfectHarness.json'
$beforeProfile=if(Test-Path $profile){[IO.File]::ReadAllBytes($profile)}else{$null}
$terminalSettings=Join-Path $env:LOCALAPPDATA 'Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
$beforeSettings=if(Test-Path $terminalSettings){(Get-FileHash $terminalSettings).Hash}else{$null}
$checks=[Collections.Generic.List[string]]::new()
$report=@{status='RUNNING';version='0.5.0';sourceCommit=$sha;platform=(Get-CimInstance Win32_OperatingSystem).Caption;personalWindows11=$false;personalProviders=$false;unsigned=$true;checks=$checks;startedAt=[DateTime]::UtcNow.ToString('o')}
$recorder=$null;$installed=[Collections.Generic.List[string]]::new()
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Invoke-Probe([string[]]$ProbeArgs){& $probe @ProbeArgs;if($LASTEXITCODE -ne 0){throw 'Native final-binary test failed'}}
function Check-Package([string]$Path,[string]$Name){
 & $node (Join-Path $PSScriptRoot 'check-windows-package.mjs') $Path $sha (Join-Path $out "$Name-byte-check.json")
 if($LASTEXITCODE -ne 0){throw "Package integrity failed: $Name"}
}
function Package-Node([string]$Path){
 $runtime=Join-Path $Path 'resources/engine/runtime/node.exe'
 if(-not(Test-Path $runtime)){$runtime=Join-Path $Path 'runtime/node.exe'}
 if(-not(Test-Path $runtime)){throw 'Packaged Node is missing'}
 return $runtime
}
function Check-Cli([string]$Path,[string]$Data,[string]$Work){
 $result=Join-Path $testRoot ([Guid]::NewGuid().ToString()+'.cli-result.json')
 & $nodeProbe (Package-Node $Path) (Join-Path $testRoot 'tools/desktop-cli-check.mjs') $Path $Data $Work $result
 if($LASTEXITCODE -ne 0 -or -not(Test-Path $result)){throw 'Packaged CLI failed under the real standard-user token'}
 $value=Get-Content $result -Raw | ConvertFrom-Json
 if(-not $value.passed){throw 'CLI result not accepted'}
 Copy-Item $result (Join-Path $out ([IO.Path]::GetFileName($result)))
 $checks.Add('Actual packaged CLI: standard-user state, version/help, persistence and NODE_OPTIONS injection rejection without global Node')
}
function Upgrade-Fixture([string]$Mode,[string]$Path,[string]$Data,[string]$Work){
 & $nodeProbe (Package-Node $Path) (Join-Path $testRoot 'tools/upgrade-fixture.mjs') $Mode $Path $Data $Work
 if($LASTEXITCODE -ne 0){throw "Upgrade fixture failed under standard-user token: $Mode"}
}
function Start-Recording([string]$Name){
 if(-not(Test-Path $env:PERFECT_FFMPEG -PathType Leaf)){throw 'Verified FFmpeg is missing'}
 $path=Join-Path $out "$Name.mp4";$start=[Diagnostics.ProcessStartInfo]::new($env:PERFECT_FFMPEG)
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 foreach($arg in @('-hide_banner','-loglevel','warning','-y','-f','gdigrab','-framerate','60','-draw_mouse','1','-i','desktop','-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',$path)){$start.ArgumentList.Add($arg)}
 $process=[Diagnostics.Process]::Start($start);$stderr=$process.StandardError.ReadToEndAsync();$stdout=$process.StandardOutput.ReadToEndAsync();Start-Sleep -Seconds 1
 if($process.HasExited){throw "Screen recorder failed: $($stderr.GetAwaiter().GetResult())"}
 return @{Process=$process;Stderr=$stderr;Stdout=$stdout;Path=$path;Started=[DateTime]::UtcNow.ToString('o');Screen=[Windows.Forms.Screen]::PrimaryScreen.Bounds.ToString()}
}
function Stop-Recording($Recording,[int]$Minimum){
 if(-not $Recording){return}
 $process=$Recording.Process;$process.StandardInput.WriteLine('q');$process.StandardInput.Flush()
 if(-not $process.WaitForExit(30000)){throw 'Recorder did not finalize its original frames'}
 $errors=$Recording.Stderr.GetAwaiter().GetResult();$Recording.Stdout.GetAwaiter().GetResult() | Out-Null
 $errors | Set-Content ($Recording.Path+'.capture.log') -Encoding utf8NoBOM
 if($process.ExitCode -ne 0){throw "Screen recording failed: $errors"}
 & $node (Join-Path $PSScriptRoot 'video-check.mjs') $Recording.Path $sha $Minimum
 if($LASTEXITCODE -ne 0){throw 'Original screen recording failed full decoding'}
 @{startedAt=$Recording.Started;finishedAt=[DateTime]::UtcNow.ToString('o');screen=$Recording.Screen;method='Actual Windows gdigrab desktop capture, 60 requested capture fps, 1x elapsed time; renderer frame rate is measured separately';visualInspection='Awaiting independent pixel review'} | ConvertTo-Json | Set-Content ($Recording.Path+'.capture.json') -Encoding utf8NoBOM
 $process.Dispose()
}
function Journey([string]$Path,[string]$Data,[string]$Work,[string]$Name,[string]$Scenario='smoke'){
 $images=Join-Path $testRoot "$Name-images";New-Item -ItemType Directory $images -Force | Out-Null
 $old=$env:PATH;$oldRun=$env:ELECTRON_RUN_AS_NODE;$oldOptions=$env:NODE_OPTIONS
 try {
  $env:PATH="$env:WINDIR\System32;$env:WINDIR";$env:ELECTRON_RUN_AS_NODE='1'
  $env:NODE_OPTIONS='--require="'+(Join-Path $testRoot 'startup-trap.cjs')+'"'
  Invoke-Probe @('journey',(Join-Path $Path 'Perfect.exe'),$Data,$Work,$images,$Scenario)
 } finally {$env:PATH=$old;$env:ELECTRON_RUN_AS_NODE=$oldRun;$env:NODE_OPTIONS=$oldOptions;Copy-Item $images (Join-Path $out $Name) -Recurse -Force}
 if(Test-Path (Join-Path $testRoot 'startup-trap-executed')){throw 'Final fused GUI or engine executed hostile NODE_OPTIONS'}
 $checks.Add("${Name}: final fused GUI, non-admin token, actual controls, normal close, no global Node, startup injection ignored")
}
function Install([string]$Setup,[string]$Destination,[string]$Name){
 $log=Join-Path $testRoot "$Name-install.log";$installed.Add($Destination)
 try{Invoke-Probe @('install',$Setup,$Destination,$log)}finally{if(Test-Path $log){Copy-Item $log (Join-Path $out "$Name-install.log")}}
 if(-not(Test-Path (Join-Path $Destination 'Perfect.exe'))){throw 'Installer did not create the executable'}
}
function Uninstall([string]$Destination,[string]$Name){
 $log=Join-Path $testRoot "$Name-uninstall.log"
 try{Invoke-Probe @('uninstall',(Join-Path $Destination 'unins000.exe'),$log)}finally{if(Test-Path $log){Copy-Item $log (Join-Path $out "$Name-uninstall.log")}}
 if(([string][Environment]::GetEnvironmentVariable('Path','User')) -ne $beforePath){throw 'Uninstall did not preserve unrelated PATH entries'}
 $checks.Add("${Name}: uninstall restored exactly the pre-test user PATH")
}
try {
 foreach($line in Get-Content (Join-Path $releaseRoot 'SHA256SUMS.txt')){
  if($line -notmatch '^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$'){throw 'Malformed release checksum'}
  if((Hash (Join-Path $releaseRoot $Matches[2])) -ne $Matches[1]){throw 'Local distribution checksum mismatch'}
 }
 $setup=Join-Path $testRoot 'Perfect-Harness-Setup-x64.exe';Copy-Item (Join-Path $releaseRoot 'Perfect-Harness-Setup-x64.exe') $setup
 $report.installerSha256=Hash $setup
 $zip=Join-Path $releaseRoot 'Perfect-Harness-Windows-x64.zip';$report.portableSha256=Hash $zip
 $portableParent=Join-Path $testRoot 'Portable español con espacios';Expand-Archive $zip $portableParent
 $portable=Join-Path $portableParent 'Perfect-Harness-Windows-x64'
 $data=Join-Path $testRoot 'Datos portable ñ';$work=Join-Path $testRoot 'Proyecto portable ñ'
 New-Item -ItemType Directory $data,$work -Force | Out-Null
 '# Proyecto portable sintético' | Set-Content (Join-Path $work 'README.md') -Encoding utf8NoBOM
 Check-Package $portable 'portable';Check-Cli $portable $data $work;Journey $portable $data $work 'portable'
 $checks.Add('Actual distributed ZIP extracted to Unicode/spaced path and used directly')
 $fresh=Join-Path $testRoot 'Instalación limpia ñ';$freshData=Join-Path $testRoot 'Datos instalación limpia';$freshWork=Join-Path $testRoot 'Proyecto instalación limpia'
 New-Item -ItemType Directory $freshData,$freshWork -Force | Out-Null
 '# Proyecto instalado sintético' | Set-Content (Join-Path $freshWork 'README.md') -Encoding utf8NoBOM
 Install $setup $fresh 'fresh';Check-Package $fresh 'fresh-installed';Check-Cli $fresh $freshData $freshWork
 $recorder=Start-Recording 'A-uso-diario';Journey $fresh $freshData $freshWork 'daily-installed' 'everyday';Stop-Recording $recorder 60;$recorder=$null
 Journey $fresh $freshData $freshWork 'daily-reopened'
 $prefsHash=Hash (Join-Path $freshData 'state.sqlite');Uninstall $fresh 'fresh'
 if((Hash (Join-Path $freshData 'state.sqlite')) -ne $prefsHash){throw 'Uninstall changed independent user state'}
 if(-not $PreviousInstaller){throw 'V4 to V5 testing requires the exact previous public installer'}
 $previous=Join-Path $testRoot 'Perfect-Previous-0.4.0.exe';Copy-Item (Resolve-Path $PreviousInstaller).Path $previous
 if((Hash $previous) -ne '517df7531f9df8b5eb455af56c8d589e978c5fa2595d8f8ecd9bfbedbddbfba3'){throw 'Previous public V4 binary checksum mismatch'}
 $upgrade=Join-Path $testRoot 'Perfect actualizado ñ';$upgradeData=Join-Path $testRoot 'Datos persistentes de V4';$upgradeWork=Join-Path $testRoot 'Proyecto preservado de V4'
 New-Item -ItemType Directory $upgradeData,$upgradeWork -Force | Out-Null
 $recorder=Start-Recording 'C-instalacion-y-actualizacion';Install $previous $upgrade 'previous-v4'
 Upgrade-Fixture 'seed' $upgrade $upgradeData $upgradeWork
 Install $setup $upgrade 'upgrade-v5'
 if(([string][Environment]::GetEnvironmentVariable('Path','User')).Split(';') -contains $upgrade){throw 'Old GUI root remains on PATH and masks CLI'}
 if(([string][Environment]::GetEnvironmentVariable('Path','User')).Split(';') -notcontains (Join-Path $upgrade 'bin')){throw 'New CLI bin PATH was not registered'}
 Check-Package $upgrade 'upgraded';Upgrade-Fixture 'verify' $upgrade $upgradeData $upgradeWork
 Check-Cli $upgrade $upgradeData $upgradeWork;Journey $upgrade $upgradeData $upgradeWork 'upgraded-first-launch'
 Upgrade-Fixture 'verify-backup' $upgrade $upgradeData $upgradeWork
 Journey $upgrade $upgradeData $upgradeWork 'upgraded-reopened';Upgrade-Fixture 'verify-backup' $upgrade $upgradeData $upgradeWork
 $checks.Add('Public V4 installer upgraded in place: goal, snapshot, teams/profiles, manual skills, preferences, project and DPAPI created and verified under the same standard-user identity')
 Stop-Recording $recorder 1;$recorder=$null
 $expected=Get-Content (Join-Path $upgradeData 'upgrade-expected.json') -Raw;$databaseBefore=Hash (Join-Path $upgradeData 'state.sqlite')
 Uninstall $upgrade 'upgrade'
 if((Hash (Join-Path $upgradeData 'state.sqlite')) -ne $databaseBefore -or (Get-Content (Join-Path $upgradeData 'upgrade-expected.json') -Raw) -ne $expected){throw 'Uninstall modified migrated user data'}
 Upgrade-Fixture 'verify-backup' $portable $upgradeData $upgradeWork
 if($beforeSettings -and (Hash $terminalSettings).ToUpperInvariant() -ne $beforeSettings){throw 'Personal Windows Terminal settings were modified'}
 if((Hash $setup) -ne $report.installerSha256 -or (Hash $zip) -ne $report.portableSha256){throw 'Distributed bytes changed after testing'}
 $checks.Add('Uninstall preserves migrated data and original Terminal settings; distributed hashes unchanged');$report.status='PASS'
} catch {$report.status='FAIL';$report.error=$_.Exception.ToString();throw}
finally {
 $env:PATH=$processPath;$env:NODE_OPTIONS=$beforeNodeOptions;$env:ELECTRON_RUN_AS_NODE=$beforeRunAsNode
 if($recorder){try{Stop-Recording $recorder 1}catch{$report.captureFailure=$_.Exception.Message;if(-not $recorder.Process.HasExited){$recorder.Process.Kill()}}}
 $report.finishedAt=[DateTime]::UtcNow.ToString('o');$report | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $out 'report.json') -Encoding utf8NoBOM
 Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($testRoot+'\',[StringComparison]::OrdinalIgnoreCase)} | ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue}
 foreach($destination in $installed){if(Test-Path (Join-Path $destination 'unins000.exe')){try{Invoke-Probe @('uninstall',(Join-Path $destination 'unins000.exe'),(Join-Path $testRoot ([Guid]::NewGuid().ToString()+'.log')))}catch{Write-Warning $_}}}
 [Environment]::SetEnvironmentVariable('Path',$beforePath,'User')
 if($null -ne $beforeProfile){New-Item -ItemType Directory (Split-Path $profile -Parent) -Force | Out-Null;[IO.File]::WriteAllBytes($profile,$beforeProfile)}elseif(Test-Path $profile){Remove-Item $profile}
 if(Test-Path $testRoot){Remove-Item $testRoot -Recurse -Force -ErrorAction SilentlyContinue}
 Remove-Item Env:PERFECT_TEST_ROOT -ErrorAction SilentlyContinue
}
