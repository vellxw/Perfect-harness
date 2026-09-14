param([string]$Package='release/Perfect-Harness-Windows-x64',[string]$Output='test-results/windows-desktop')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing,System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class PerfectCaptureWin32 {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int hgt,bool repaint);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
}
'@
$out=[IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory $out -Force | Out-Null
$exe=Join-Path (Resolve-Path $Package) 'Perfect.exe'
$temp=Join-Path $env:RUNNER_TEMP ('perfect-terminal-'+[Guid]::NewGuid())
New-Item -ItemType Directory $temp -Force | Out-Null
$os=Get-CimInstance Win32_OperatingSystem
$report=@{os=$os.Caption;build=$os.BuildNumber;terminal='1.24.11911.0';mode='real Windows Terminal window; synthetic app fixture, no OAuth';status='NOT_TESTED';captures=@();error=$null}
$oldTerminal=$env:PERFECT_WT_PATH
$profile=Join-Path $env:LOCALAPPDATA 'Microsoft/Windows Terminal/Fragments/PerfectHarness/PerfectHarness.json'
$oldProfile=if(Test-Path $profile){[IO.File]::ReadAllBytes($profile)}else{$null}
$ownedNodeIds=@()
try {
 $archive=Join-Path $temp 'terminal.zip'
 Invoke-WebRequest 'https://github.com/microsoft/terminal/releases/download/v1.24.11911.0/Microsoft.WindowsTerminal_1.24.11911.0_x64.zip' -OutFile $archive -TimeoutSec 90
 if((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '7691efeb71c8dd0b95536c84e366fa4cf809a42c534912f9cefa1056534383bd'){throw 'Windows Terminal download hash mismatch'}
 Expand-Archive $archive (Join-Path $temp 'terminal')
 $terminal=Get-ChildItem (Join-Path $temp 'terminal') -Filter WindowsTerminal.exe -Recurse | Select-Object -First 1
 if(-not $terminal){throw 'Portable terminal executable missing'}
 $terminalRoot=$terminal.DirectoryName
 New-Item (Join-Path $terminalRoot '.portable') -ItemType File | Out-Null
 New-Item (Join-Path $terminalRoot 'settings') -ItemType Directory -Force | Out-Null
 $fragment=(& $exe --print-profile | ConvertFrom-Json)
 $settings=@{defaultProfile=$fragment.profiles[0].guid;initialCols=120;initialRows=36;confirmCloseAllTabs=$false;profiles=@{list=@($fragment.profiles[0])};schemes=$fragment.schemes;theme='dark'}
 $settings | ConvertTo-Json -Depth 15 | Set-Content (Join-Path $terminalRoot 'settings/settings.json') -Encoding utf8NoBOM
 # Only this isolated portable Terminal uses these settings. Personal settings.json is untouched.
 $env:PERFECT_WT_PATH=$terminal.FullName
 foreach($scene in @('idle','running')){
   Write-Host "Starting real Windows Terminal capture: $scene"
   $launcher=Start-Process $exe -ArgumentList @('--window','--demo',$scene,'--motion','off') -PassThru
   # -Wait waits for descendants too, including the intentionally persistent Terminal.
   if(-not $launcher.WaitForExit(15000)){ $launcher.Kill(); throw 'Launcher did not exit within 15s' }
   if($launcher.ExitCode -ne 0){throw "Launcher exited $($launcher.ExitCode)"}
   $window=$null
   for($i=0;$i -lt 60;$i++){
     Start-Sleep -Milliseconds 250
     $window=Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0 -and $_.Path -and $_.Path.StartsWith($terminalRoot,[StringComparison]::OrdinalIgnoreCase)} | Select-Object -Last 1
     if($window){break}
   }
   if(-not $window){throw 'No interactive Windows Terminal window is available on this runner'}
   $screen=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
   [void][PerfectCaptureWin32]::ShowWindow($window.MainWindowHandle,9)
   [void][PerfectCaptureWin32]::MoveWindow($window.MainWindowHandle,12,12,[Math]::Min(1380,$screen.Width-24),[Math]::Min(880,$screen.Height-24),$true)
   [void][PerfectCaptureWin32]::SetForegroundWindow($window.MainWindowHandle)
   Start-Sleep -Seconds 5
   $children=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine -like '*Perfect-Harness-Windows-x64*' -and $_.CommandLine -like "*--demo*$scene*"})
   if(-not $children.Count){throw 'The bundled TUI process is not alive; no screenshot is accepted'}
   $ownedNodeIds+=@($children | ForEach-Object ProcessId)
   $rect=[PerfectCaptureWin32+RECT]::new();[void][PerfectCaptureWin32]::GetWindowRect($window.MainWindowHandle,[ref]$rect)
   $w=$rect.Right-$rect.Left;$h=$rect.Bottom-$rect.Top
   if($w -lt 500 -or $h -lt 300){throw 'Terminal window is too small or unavailable'}
   $bitmap=[Drawing.Bitmap]::new($w,$h);$graphics=[Drawing.Graphics]::FromImage($bitmap)
   try {
     $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$bitmap.Size)
     $colors=[Collections.Generic.HashSet[int]]::new()
     for($x=0;$x -lt $w;$x+=17){for($y=0;$y -lt $h;$y+=17){[void]$colors.Add($bitmap.GetPixel($x,$y).ToArgb())}}
     if($colors.Count -lt 16){throw 'Desktop capture is blank; interactive visual verification remains blocked'}
     $name="windows-terminal-$scene.png";$bitmap.Save((Join-Path $out $name),[Drawing.Imaging.ImageFormat]::Png)
     $report.captures+=@{file=$name;scene=$scene;width=$w;height=$h;processVerified=$true;inspection='Pixel capture; inspect the PNG to confirm layout and readability'}
   } finally {$graphics.Dispose();$bitmap.Dispose()}
   foreach($child in $children){Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue}
   Stop-Process -Id $window.Id -ErrorAction SilentlyContinue
 }
 $report.status='CAPTURED'
} catch {$report.status='BLOCKED';$report.error=$_.Exception.Message;Write-Warning $report.error}
finally {
 $env:PERFECT_WT_PATH=$oldTerminal
 foreach($pidValue in $ownedNodeIds){Stop-Process -Id $pidValue -ErrorAction SilentlyContinue}
 Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase)} | Stop-Process -ErrorAction SilentlyContinue
 if($null -ne $oldProfile){New-Item -ItemType Directory (Split-Path $profile -Parent) -Force | Out-Null;[IO.File]::WriteAllBytes($profile,$oldProfile)}elseif(Test-Path $profile){Remove-Item $profile}
 $report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $out 'provenance.json') -Encoding utf8NoBOM
 Write-Host ($report | ConvertTo-Json -Depth 8)
}
