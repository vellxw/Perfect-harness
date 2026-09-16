using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Forms;

// CI-only driver, not a product tool. Every operation stays inside its owned
// tree/window. Final Electron fuses are unchanged; no CDP or renderer eval.
public static class PerfectV5Probe {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string reserved,desktop,title;
    public int x,y,xSize,ySize,xChars,yChars,fill,flags; public short show,reserved2;
    public IntPtr reservedPtr,stdIn,stdOut,stdErr;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process,thread; public int pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr sid; public uint attributes; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left,Top,Right,Bottom; }
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr token,uint flags,uint disableCount,IntPtr disable,uint deleteCount,IntPtr deletes,uint restrictCount,IntPtr restrictions,out IntPtr restricted);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSidToSid(string value,out IntPtr sid);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int type,ref SID_AND_ATTRIBUTES info,int size);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int type,IntPtr value,int size,out int length);
  [DllImport("advapi32.dll")] static extern uint GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessAsUser(IntPtr token,string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessWithTokenW(IntPtr token,uint logonFlags,string app,StringBuilder command,uint flags,IntPtr environment,string directory,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr h);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out RECT rect);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int command);
  [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr h,int x,int y,int w,int hgt,bool repaint);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,uint message,IntPtr wParam,IntPtr lParam);
  static string scope;
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  static readonly List<object> Steps = new List<object>();
  static IntPtr window;
  static AutomationElement root;

  static string Owned(string path) {
    string full=Path.GetFullPath(path), prefix=scope.TrimEnd('\\')+"\\";
    if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase)) throw new Exception("Outside the owned test tree: "+full);
    string at=full;
    while(at!=null && at.Length>=scope.Length) {
      if((File.Exists(at)||Directory.Exists(at)) && (File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0) throw new Exception("Test path has a reparse point");
      at=Path.GetDirectoryName(at);
    }
    return full;
  }
  static string Quote(string value) {
    var b=new StringBuilder("\""); int slashes=0;
    foreach(char c in value) { if(c=='\\'){slashes++;continue;} if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0; }
    b.Append('\\',slashes*2); b.Append('"'); return b.ToString();
  }
  static PROCESS_INFORMATION Launch(string executable,string[] arguments,string directory) {
    executable=Owned(executable); directory=Owned(directory);
    var allowed=new[]{"Perfect.exe","Perfect-Harness-Setup-x64.exe","Perfect-Previous-0.4.0.exe","unins000.exe"};
    if(!allowed.Contains(Path.GetFileName(executable),StringComparer.OrdinalIgnoreCase)) throw new Exception("Test driver executable not allowed");
    IntPtr token=IntPtr.Zero,restricted=IntPtr.Zero,sid=IntPtr.Zero,buffer=IntPtr.Zero;
    try {
      if(!OpenProcessToken(Process.GetCurrentProcess().Handle,0xF01FF,out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if(!CreateRestrictedToken(token,0x4,0,IntPtr.Zero,0,IntPtr.Zero,0,IntPtr.Zero,out restricted)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if(!ConvertStringSidToSid("S-1-16-8192",out sid)) throw new Win32Exception(Marshal.GetLastWin32Error());
      var label=new SID_AND_ATTRIBUTES {sid=sid,attributes=0x20};
      if(!SetTokenInformation(restricted,25,ref label,Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES))+(int)GetLengthSid(sid))) throw new Win32Exception(Marshal.GetLastWin32Error());
      buffer=Marshal.AllocHGlobal(4);int length;
      if(!GetTokenInformation(restricted,20,buffer,4,out length)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if(Marshal.ReadInt32(buffer)!=0) throw new Exception("Child token is still elevated");
      using(var identity=new WindowsIdentity(restricted)) {
        if(new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator)) throw new Exception("Child token retains Administrator membership");
      }
      var startup=new STARTUPINFO {cb=Marshal.SizeOf(typeof(STARTUPINFO)),desktop="winsta0\\default"};
      var command=new StringBuilder(Quote(executable)); foreach(var arg in arguments) command.Append(" ").Append(Quote(arg));
      PROCESS_INFORMATION child;
      if(!CreateProcessAsUser(restricted,executable,new StringBuilder(command.ToString()),IntPtr.Zero,IntPtr.Zero,false,0,IntPtr.Zero,directory,ref startup,out child) && !CreateProcessWithTokenW(restricted,0,executable,new StringBuilder(command.ToString()),0,IntPtr.Zero,directory,ref startup,out child)) throw new Win32Exception(Marshal.GetLastWin32Error());
      Steps.Add(new {operation="launch",pid=child.pid,executable=Path.GetFileName(executable),mediumIntegrity=true,elevated=false,administrator=false});
      return child;
    } finally { if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);if(sid!=IntPtr.Zero)LocalFree(sid);if(restricted!=IntPtr.Zero)CloseHandle(restricted);if(token!=IntPtr.Zero)CloseHandle(token); }
  }
  static void Release(PROCESS_INFORMATION child) { CloseHandle(child.thread);CloseHandle(child.process); }
  static int RunInstaller(string executable,string destination,string log,bool uninstall) {
    string[] args=uninstall ? new[]{"/VERYSILENT","/SUPPRESSMSGBOXES","/NORESTART","/LOG="+Owned(log)} : new[]{"/SILENT","/SUPPRESSMSGBOXES","/NORESTART","/LANG=spanish","/DIR="+Owned(destination),"/TASKS=addpath","/LOG="+Owned(log)};
    string workingDirectory=Owned(Path.Combine(scope,"tools"));
    if(!Directory.Exists(workingDirectory))throw new Exception("Owned installer working directory is missing");
    var child=Launch(executable,args,workingDirectory);
    try { if(WaitForSingleObject(child.process,600000)!=0)throw new Exception("Installer did not exit within ten minutes");uint code;if(!GetExitCodeProcess(child.process,out code))throw new Win32Exception(Marshal.GetLastWin32Error());if(code!=0)throw new Exception("Installer exit "+code);return 0; }
    finally { Release(child); }
  }
  static Condition Match(string name,ControlType type) {
    return type==null ? (Condition)new PropertyCondition(AutomationElement.NameProperty,name) : new AndCondition(new PropertyCondition(AutomationElement.NameProperty,name),new PropertyCondition(AutomationElement.ControlTypeProperty,type));
  }
  static AutomationElement Find(string name,ControlType type=null) {
    if(root==null)return null;
    foreach(AutomationElement e in root.FindAll(TreeScope.Descendants,Match(name,type))) {
      try { if(!e.Current.IsOffscreen && e.Current.IsEnabled) return e; } catch(ElementNotAvailableException) {}
    }
    return null;
  }
  static AutomationElement Wait(string name,ControlType type=null,int milliseconds=30000) {
    var watch=Stopwatch.StartNew();
    while(watch.ElapsedMilliseconds<milliseconds) { var e=Find(name,type);if(e!=null)return e;Thread.Sleep(100); }
    throw new Exception("Accessible control not found: "+name+"; visible="+VisibleText());
  }
  static void ScrollTo(string name,ControlType type=null) {
    for(int attempt=0;attempt<18;attempt++) {
      if(Find(name,type)!=null)return;
      foreach(AutomationElement e in root.FindAll(TreeScope.Descendants,Match(name,type))) {
        try { object item;if(e.TryGetCurrentPattern(ScrollItemPattern.Pattern,out item))((ScrollItemPattern)item).ScrollIntoView(); }
        catch(ElementNotAvailableException) {} catch(InvalidOperationException) {}
      }
      Thread.Sleep(120);
      if(Find(name,type)!=null)return;
      RECT r;if(!GetWindowRect(window,out r))throw new Exception("Lost owned window while scrolling");
      SetForegroundWindow(window);SetCursorPos(r.Left+(r.Right-r.Left)/2,r.Top+(r.Bottom-r.Top)*2/3);
      mouse_event(0x0800,0,0,unchecked((uint)-360),UIntPtr.Zero);
      Steps.Add(new {operation="mouse-scroll-owned-window",target=name,attempt=attempt+1,at=DateTime.UtcNow.ToString("o")});
      Thread.Sleep(200);
    }
    Wait(name,type,1000);
  }
  static string VisibleText() {
    if(root==null)return "";
    try { return String.Join(" | ",root.FindAll(TreeScope.Descendants,Condition.TrueCondition).Cast<AutomationElement>().Take(2000).Where(e=>!e.Current.IsOffscreen).Select(e=>e.Current.Name).Where(n=>!String.IsNullOrWhiteSpace(n)).Distinct().Take(120)); }
    catch { return "unavailable"; }
  }
  static void Click(string name,ControlType type=null) {
    var element=Wait(name,type);System.Windows.Point point;
    object scroll;if(element.TryGetCurrentPattern(ScrollItemPattern.Pattern,out scroll))((ScrollItemPattern)scroll).ScrollIntoView();
    if(!element.TryGetClickablePoint(out point))throw new Exception("Control has no clickable point: "+name);
    RECT bounds;if(!GetWindowRect(window,out bounds)||point.X<bounds.Left||point.X>=bounds.Right||point.Y<bounds.Top||point.Y>=bounds.Bottom)throw new Exception("Click escaped owned window");
    ShowWindow(window,9);SetForegroundWindow(window);SetCursorPos((int)point.X,(int)point.Y);Thread.Sleep(60);
    mouse_event(2,0,0,0,UIntPtr.Zero);Thread.Sleep(45);mouse_event(4,0,0,0,UIntPtr.Zero);Thread.Sleep(180);
    Steps.Add(new {operation="mouse-click",name=name,at=DateTime.UtcNow.ToString("o")});
  }
  static void Fill(string name,string value) {
    Click(name,ControlType.Edit);
    // A physical click and asynchronous Chromium UIA update are different events.
    // Confirm focus before sending keys; send the paste exactly once and await
    // its committed value instead of guessing a 200 ms accessibility delay.
    var focus=Stopwatch.StartNew();
    while(true) {
      var current=Find(name,ControlType.Edit);
      if(current!=null&&current.Current.HasKeyboardFocus)break;
      if(focus.ElapsedMilliseconds>=3000)throw new Exception("Owned input never acquired keyboard focus: "+name);
      Thread.Sleep(40);
    }
    Clipboard.SetText(value);
    if(!Clipboard.ContainsText()||Clipboard.GetText()!=value)throw new Exception("Synthetic clipboard contents changed before input");
    var watch=Stopwatch.StartNew();
    SendKeys.SendWait("^a");SendKeys.SendWait("^v");
    string observed=null;
    while(watch.ElapsedMilliseconds<3000) {
      var field=Find(name,ControlType.Edit);object pattern;
      if(field!=null&&field.TryGetCurrentPattern(ValuePattern.Pattern,out pattern)) {
        observed=((ValuePattern)pattern).Current.Value;
        if(observed==value) {
          Steps.Add(new {operation="literal-input",name=name,characters=value.Length,accessibilityCommitMs=watch.ElapsedMilliseconds,focusWaitMs=focus.ElapsedMilliseconds,pasteAttempts=1});
          return;
        }
      }
      Thread.Sleep(40);
    }
    Steps.Add(new {operation="literal-input-failed",name=name,expected=value,observed=observed,accessibilityWaitMs=watch.ElapsedMilliseconds,pasteAttempts=1});
    throw new Exception("Input did not reflect the single literal paste: "+name+"; expected="+value+"; observed="+observed);
  }
  static void Go(string name) {
    Click("Abrir comandos y navegación",ControlType.Button);Fill("Buscar sección",name);Click(name,ControlType.Button);
    var watch=Stopwatch.StartNew();while(Find("Buscar sección",ControlType.Edit)!=null&&watch.ElapsedMilliseconds<10000)Thread.Sleep(100);
    if(Find("Buscar sección",ControlType.Edit)!=null)throw new Exception("Navigation dialog did not close");Thread.Sleep(400);
  }
  static void Capture(string directory,string name) {
    RECT rect;if(!GetWindowRect(window,out rect))throw new Win32Exception(Marshal.GetLastWin32Error());
    int width=rect.Right-rect.Left,height=rect.Bottom-rect.Top;
    if(width<800||height<550)throw new Exception("Owned window is too small to verify");
    using(var bitmap=new Bitmap(width,height))using(var g=Graphics.FromImage(bitmap)) {
      g.CopyFromScreen(rect.Left,rect.Top,0,0,bitmap.Size);
      var colors=new HashSet<int>();for(int x=0;x<width;x+=19)for(int y=0;y<height;y+=19)colors.Add(bitmap.GetPixel(x,y).ToArgb());
      if(colors.Count<16)throw new Exception("Blank desktop capture");
      bitmap.Save(Owned(Path.Combine(directory,name+".png")),ImageFormat.Png);
      Steps.Add(new {operation="window-screenshot",file=name+".png",width=width,height=height,colors=colors.Count,inspection="Actual pixels captured; independent visual review still required"});
    }
  }
  static void Journey(string executable,string home,string workspace,string output,string scenario) {
    Owned(home);Owned(workspace);Owned(output);Directory.CreateDirectory(output);
    var child=Launch(executable,new[]{"--home",home,"--workspace",workspace,"--force-renderer-accessibility"},workspace);
    var watch=Stopwatch.StartNew();bool closed=false;
    try {
      while(watch.ElapsedMilliseconds<30000) {
        using(var process=Process.GetProcessById(child.pid)){process.Refresh();window=process.MainWindowHandle;}
        if(window!=IntPtr.Zero)break;Thread.Sleep(100);
      }
      if(window==IntPtr.Zero)throw new Exception("No owned Electron window");
      var area=Screen.PrimaryScreen.WorkingArea;ShowWindow(window,9);MoveWindow(window,area.Left+8,area.Top+8,Math.Min(1440,area.Width-16),Math.Min(900,area.Height-16),true);SetForegroundWindow(window);
      root=AutomationElement.FromHandle(window);Wait("Motor conectado");Thread.Sleep(600);Capture(output,"01-home");
      Steps.Add(new {operation="usable",milliseconds=watch.ElapsedMilliseconds,visible=VisibleText()});
      int pause=scenario=="everyday"?4500:250;
      Thread.Sleep(pause);
      Go("Habilidades");Wait("Modo de habilidades",ControlType.ComboBox);Capture(output,"02-skills");Thread.Sleep(pause);
      Go("Perfiles y modelos");Click("Cambiar modelo",ControlType.Button);Wait("Modelo exacto",ControlType.Edit);Capture(output,"03-model-form");Thread.Sleep(pause);Click("Cancelar",ControlType.Button);
      Go("Equipos");
      if(scenario=="everyday") {
        Click("Crear equipo",ControlType.Button);Fill("Identificador (sin espacios)","equipo-v5-qa");Fill("Nombre del equipo","Equipo de prueba V5");Click("Guardar equipo",ControlType.Button);
        var saved=Stopwatch.StartNew();while(Find("Guardar equipo",ControlType.Button)!=null&&saved.ElapsedMilliseconds<10000)Thread.Sleep(100);
        if(Find("Guardar equipo",ControlType.Button)!=null)throw new Exception("Team creation did not finish: "+VisibleText());
        ScrollTo("Equipo de prueba V5");
      }
      Capture(output,"04-teams");Thread.Sleep(pause);
      Go("Estudio de habilidades");Click("Crear habilidad",ControlType.Button);Wait("Identificador de la habilidad",ControlType.Edit);Capture(output,"05-creator-form");Thread.Sleep(pause);Click("Cancelar",ControlType.Button);
      Click("Nueva comparación A/B",ControlType.Button);Wait("Contrato de evaluación A/B");Capture(output,"06-ab-form");Thread.Sleep(pause);Click("Cancelar",ControlType.Button);
      Go("Integraciones");Click("GitHub",ControlType.Button);Capture(output,"07-integration-form");Thread.Sleep(pause);Click("Cancelar",ControlType.Button);
      Go("Archivos");Click("README.md",ControlType.Button);Capture(output,"08-files");Thread.Sleep(pause);
      Go("Ajustes");Wait("Movimiento",ControlType.ComboBox);Capture(output,"09-settings");Thread.Sleep(pause);
      Click("Inicio de Perfect",ControlType.Button);Capture(output,"10-home-return");
      if(scenario=="everyday" && watch.ElapsedMilliseconds<65000)Thread.Sleep((int)(65000-watch.ElapsedMilliseconds));
      if(!PostMessage(window,0x0010,IntPtr.Zero,IntPtr.Zero))throw new Exception("Normal close request failed");
      if(WaitForSingleObject(child.process,35000)!=0)throw new Exception("GUI/engine did not stop after normal window close");
      uint exit;if(!GetExitCodeProcess(child.process,out exit)||exit!=0)throw new Exception("GUI closed with an error");
      closed=true;Steps.Add(new {operation="normal-window-close",milliseconds=watch.ElapsedMilliseconds,exitCode=exit});
    } catch {
      if(window!=IntPtr.Zero)try{Capture(output,"failure");}catch{}
      throw;
    } finally { if(!closed&&window!=IntPtr.Zero)PostMessage(window,0x0010,IntPtr.Zero,IntPtr.Zero);Release(child);root=null;window=IntPtr.Zero; }
  }
  [STAThread] public static int Main(string[] args) {
    string output=null;
    try {
      scope=Path.GetFullPath(Environment.GetEnvironmentVariable("PERFECT_TEST_ROOT")??throw new Exception("Missing owned test root"));
      if(!Directory.Exists(scope))throw new Exception("Owned test root missing");
      if(args.Length==4 && args[0]=="install") { RunInstaller(Owned(args[1]),Owned(args[2]),Owned(args[3]),false); }
      else if(args.Length==3 && args[0]=="uninstall") { RunInstaller(Owned(args[1]),null,Owned(args[2]),true); }
      else if(args.Length==6 && args[0]=="journey") { output=Owned(args[4]);Journey(Owned(args[1]),Owned(args[2]),Owned(args[3]),output,args[5]); }
      else throw new Exception("Expected install, uninstall or journey arguments");
      var report=new {passed=true,platform=Environment.OSVersion.VersionString,method="Real final fused executable, restricted medium-integrity non-administrator token, native UI Automation locators and bounded physical mouse/keyboard; no CDP or disabled fuses",steps=Steps};
      string json=Json.Serialize(report);if(output!=null)File.WriteAllText(Path.Combine(output,"native-journey.json"),json,new UTF8Encoding(false));Console.WriteLine(json);return 0;
    } catch(Exception e) {
      string json=Json.Serialize(new {passed=false,error=e.ToString(),steps=Steps});
      if(output!=null)try{File.WriteAllText(Path.Combine(output,"native-journey.json"),json,new UTF8Encoding(false));}catch{}
      Console.Error.WriteLine(json);return 2;
    }
  }
}
