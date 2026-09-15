#ifndef Payload
  #define Payload "..\..\release\Perfect-Harness-Windows-x64"
#endif
#ifndef Output
  #define Output "..\..\release"
#endif
#ifndef AppVersion
  #error "AppVersion must come from package.json through package-windows.ps1"
#endif
[Setup]
AppId={{F4D924BE-7843-4CF7-BA6D-7B207D000200}
AppName=Perfect Harness
AppVersion={#AppVersion}
AppPublisher=Perfect Harness
AppPublisherURL=https://github.com/vellxw/Perfect-harness
DefaultDirName={localappdata}\Programs\PerfectHarness
DefaultGroupName=Perfect Harness
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
DisableProgramGroupPage=yes
OutputDir={#Output}
OutputBaseFilename=Perfect-Harness-Setup-x64
SetupIconFile=..\..\assets\brand\perfect.ico
UninstallDisplayIcon={app}\Perfect.exe
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
CloseApplications=yes
RestartApplications=no
ShowLanguageDialog=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: desktopicon; Description: "Crear un acceso directo en el escritorio"; Flags: unchecked
Name: addpath; Description: "Añadir Perfect al PATH del usuario"; Flags: checkedonce
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Dirs]
Name: "{userdocs}\Perfect Projects\Workspace"; Flags: uninsneveruninstall
[Icons]
Name: "{group}\Perfect Harness"; Filename: "{app}\Perfect.exe"; Parameters: "--window"; WorkingDir: "{userdocs}\Perfect Projects\Workspace"
Name: "{autodesktop}\Perfect Harness"; Filename: "{app}\Perfect.exe"; Parameters: "--window"; WorkingDir: "{userdocs}\Perfect Projects\Workspace"; Tasks: desktopicon
[Run]
Filename: "{app}\Perfect.exe"; Parameters: "--install-profile"; Flags: runhidden waituntilterminated
Filename: "{app}\Perfect.exe"; Parameters: "--window"; Description: "Abrir Perfect Harness"; WorkingDir: "{userdocs}\Perfect Projects\Workspace"; Flags: postinstall nowait skipifsilent
[UninstallRun]
Filename: "{app}\Perfect.exe"; Parameters: "--remove-profile"; Flags: runhidden waituntilterminated; RunOnceId: "PerfectTerminalProfile"
[Code]
function HasPath(Value, Entry: String): Boolean;
begin
  Result := Pos(';' + Lowercase(Entry) + ';', ';' + Lowercase(Value) + ';') > 0;
end;
procedure CurStepChanged(CurStep: TSetupStep);
var Value, Entry: String;
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addpath') then begin
    Entry := ExpandConstant('{app}');
    RegQueryStringValue(HKCU, 'Environment', 'Path', Value);
    if not HasPath(Value, Entry) then begin
      if Value = '' then Value := Entry else Value := Value + ';' + Entry;
      if RegWriteExpandStringValue(HKCU, 'Environment', 'Path', Value) then
        RegWriteStringValue(HKCU, 'Software\PerfectHarness', 'PathAdded', Entry);
    end;
  end;
end;
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Value, Entry, Stored, Item, Updated: String; P: Integer;
begin
  if CurUninstallStep = usPostUninstall then begin
    Entry := ExpandConstant('{app}');
    if RegQueryStringValue(HKCU, 'Software\PerfectHarness', 'PathAdded', Stored) and (CompareText(Stored, Entry) = 0) then begin
      RegQueryStringValue(HKCU, 'Environment', 'Path', Value);
      Updated := '';
      while Value <> '' do begin
        P := Pos(';', Value);
        if P = 0 then begin Item := Value; Value := ''; end
        else begin Item := Copy(Value, 1, P - 1); Delete(Value, 1, P); end;
        if CompareText(Item, Entry) <> 0 then begin
          if Updated = '' then Updated := Item else Updated := Updated + ';' + Item;
        end;
      end;
      RegWriteExpandStringValue(HKCU, 'Environment', 'Path', Updated);
      RegDeleteValue(HKCU, 'Software\PerfectHarness', 'PathAdded');
      RegDeleteKeyIfEmpty(HKCU, 'Software\PerfectHarness');
    end;
  end;
end;
