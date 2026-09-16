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
Name: addpath; Description: "Añadir el comando perfect al PATH del usuario"; Flags: checkedonce
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Dirs]
Name: "{userdocs}\Perfect Projects\Workspace"; Flags: uninsneveruninstall
[Icons]
Name: "{group}\Perfect Harness"; Filename: "{app}\Perfect.exe"; WorkingDir: "{userdocs}\Perfect Projects\Workspace"
Name: "{autodesktop}\Perfect Harness"; Filename: "{app}\Perfect.exe"; WorkingDir: "{userdocs}\Perfect Projects\Workspace"; Tasks: desktopicon
[Run]
Filename: "{app}\Perfect.exe"; Description: "Abrir Perfect Harness"; WorkingDir: "{userdocs}\Perfect Projects\Workspace"; Flags: postinstall nowait skipifsilent
[Code]
const OwnKey = 'Software\PerfectHarness';
function HasPath(Value, Entry: String): Boolean;
begin
  Result := Pos(';' + Lowercase(Entry) + ';', ';' + Lowercase(Value) + ';') > 0;
end;
function RemoveExactPath(Value, Entry: String): String;
var Wrapped, Needle: String; P: Integer;
begin
  Wrapped := ';' + Value + ';'; Needle := ';' + Lowercase(Entry) + ';';
  P := Pos(Needle, Lowercase(Wrapped));
  while P > 0 do begin
    Delete(Wrapped, P, Length(Needle) - 1);
    P := Pos(Needle, Lowercase(Wrapped));
  end;
  if Length(Wrapped) <= 1 then Result := ''
  else Result := Copy(Wrapped, 2, Length(Wrapped) - 2);
end;
procedure ForgetPathReceipt;
begin
  RegDeleteValue(HKCU, OwnKey, 'PathAdded');
  RegDeleteValue(HKCU, OwnKey, 'PathBeforeOwn');
  RegDeleteValue(HKCU, OwnKey, 'PathAfterOwn');
  RegDeleteValue(HKCU, OwnKey, 'PathOriginallyPresent');
  RegDeleteKeyIfEmpty(HKCU, OwnKey);
end;
procedure RemoveOwnedTerminalFragment;
var Filename, Content, EscapedExecutable: String; Lines: TArrayOfString; I: Integer;
begin
  Filename := ExpandConstant('{localappdata}\Microsoft\Windows Terminal\Fragments\PerfectHarness\PerfectHarness.json');
  EscapedExecutable := ExpandConstant('{app}\Perfect.exe');
  StringChangeEx(EscapedExecutable, '\', '\\', True);
  if LoadStringsFromFile(Filename, Lines) then begin
    Content := '';
    for I := 0 to GetArrayLength(Lines) - 1 do
      Content := Content + Lines[I] + #13#10;
    if Pos(Lowercase(EscapedExecutable), Lowercase(Content)) > 0 then
      DeleteFile(Filename);
  end;
end;
procedure CurStepChanged(CurStep: TSetupStep);
var Value, BeforeValue, AfterValue, Entry, Stored, OldEntry: String; Present: Cardinal;
begin
  if CurStep = ssPostInstall then begin
    Entry := ExpandConstant('{app}\bin'); OldEntry := ExpandConstant('{app}');
    Value := '';
    if RegQueryStringValue(HKCU, 'Environment', 'Path', Value) then Present := 1 else Present := 0;
    { V4 recorded its own root entry. Only that entry is migrated. }
    if RegQueryStringValue(HKCU, OwnKey, 'PathAdded', Stored) and
       (CompareText(Stored, OldEntry) = 0) then begin
      Value := RemoveExactPath(Value, OldEntry);
      if not RegWriteExpandStringValue(HKCU, 'Environment', 'Path', Value) then
        RaiseException('No se pudo migrar el PATH propio de Perfect.');
      ForgetPathReceipt;
    end;
    if WizardIsTaskSelected('addpath') and not HasPath(Value, Entry) then begin
      BeforeValue := Value;
      if Value = '' then AfterValue := Entry else AfterValue := Value + ';' + Entry;
      { Keep the exact original representation, including empty path segments.
        On unchanged PATH uninstall restores this receipt. If another application
        edits PATH later, only Perfect's own entry is removed instead. }
      if not RegWriteStringValue(HKCU, OwnKey, 'PathBeforeOwn', BeforeValue) or
         not RegWriteStringValue(HKCU, OwnKey, 'PathAfterOwn', AfterValue) or
         not RegWriteDWordValue(HKCU, OwnKey, 'PathOriginallyPresent', Present) then
        RaiseException('No se pudo conservar el PATH anterior del usuario.');
      if not RegWriteExpandStringValue(HKCU, 'Environment', 'Path', AfterValue) then
        RaiseException('No se pudo registrar el comando perfect en el PATH del usuario.');
      if not RegWriteStringValue(HKCU, OwnKey, 'PathAdded', Entry) then begin
        RegWriteExpandStringValue(HKCU, 'Environment', 'Path', BeforeValue);
        ForgetPathReceipt;
        RaiseException('No se pudo registrar la propiedad del cambio PATH.');
      end;
    end;
    RemoveOwnedTerminalFragment;
  end;
end;
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Value, Entry, Stored, BeforeValue, AfterValue: String; Present: Cardinal; Restored: Boolean;
begin
  if CurUninstallStep = usPostUninstall then begin
    Entry := ExpandConstant('{app}\bin');
    if RegQueryStringValue(HKCU, OwnKey, 'PathAdded', Stored) and
       (CompareText(Stored, Entry) = 0) then begin
      Value := ''; RegQueryStringValue(HKCU, 'Environment', 'Path', Value);
      if RegQueryStringValue(HKCU, OwnKey, 'PathBeforeOwn', BeforeValue) and
         RegQueryStringValue(HKCU, OwnKey, 'PathAfterOwn', AfterValue) and
         RegQueryDWordValue(HKCU, OwnKey, 'PathOriginallyPresent', Present) and
         (Value = AfterValue) then begin
        if Present = 0 then Restored := RegDeleteValue(HKCU, 'Environment', 'Path')
        else Restored := RegWriteExpandStringValue(HKCU, 'Environment', 'Path', BeforeValue);
      end else
        Restored := RegWriteExpandStringValue(HKCU, 'Environment', 'Path', RemoveExactPath(Value, Entry));
      if not Restored then
        RaiseException('No se pudo retirar el PATH propio; se conserva el registro para recuperación.');
      ForgetPathReceipt;
    end;
  end;
end;
