$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true'){throw 'This capture tool is prepared only on the owned Windows CI runner'}
$tools=Join-Path $env:RUNNER_TEMP 'perfect-video-tools-9.0.1'
New-Item -ItemType Directory $tools -Force | Out-Null
$archive=Join-Path $tools 'ffmpeg-9.0.1.zip'
$url='https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip'
$expected='fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9'
Invoke-WebRequest $url -OutFile $archive -TimeoutSec 180
if((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Capture tool hash mismatch'}
Expand-Archive $archive (Join-Path $tools 'unpacked') -Force
$bin=Join-Path $tools 'unpacked/ffmpeg-9.0.1-essentials_build/bin'
foreach($name in @('ffmpeg.exe','ffprobe.exe')){if(-not(Test-Path (Join-Path $bin $name) -PathType Leaf)){throw "Capture tool missing $name"}}
"PERFECT_FFMPEG=$(Join-Path $bin 'ffmpeg.exe')" | Out-File $env:GITHUB_ENV -Append -Encoding utf8
"PERFECT_FFPROBE=$(Join-Path $bin 'ffprobe.exe')" | Out-File $env:GITHUB_ENV -Append -Encoding utf8
@{version='9.0.1';source=$url;archiveSha256=$expected;license='GPL-3.0-or-later build, CI-only, not included in Perfect packages'} | ConvertTo-Json | Set-Content (Join-Path $tools 'provenance.json') -Encoding utf8NoBOM
