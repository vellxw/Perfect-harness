using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Local consent boundary and emergency switch, not a general shell or automation API.
public static class DesktopGuard {
  [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
  private delegate bool WindowCallback(IntPtr hwnd,IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback,IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int max);
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool SetProp(IntPtr hwnd,string name,IntPtr value);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr GetProp(IntPtr hwnd,string name);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr RemoveProp(IntPtr hwnd,string name);
  [DllImport("advapi32.dll",SetLastError=true)] private static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] private static extern bool GetTokenInformation(IntPtr token,int infoClass,out int info,int length,out int returned);
  [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
  private static JavaScriptSerializer json=new JavaScriptSerializer(){MaxJsonLength=1000000};
  private static readonly HashSet<string> blocked=new HashSet<string>(StringComparer.OrdinalIgnoreCase){"powershell","pwsh","cmd","conhost","openconsole","windowsterminal","regedit","mmc","taskmgr","consent","winlogon","logonui","credentialuibroker","perfect","perfect.desktopguard"};
  private static string Property(string nonce){Guid value;if(!Guid.TryParse(nonce,out value))throw new Exception("DESKTOP_NONCE: autorización inválida");return "PerfectHarness.Window."+value.ToString("N");}
  public static Dictionary<string,object> Describe(long raw){
    IntPtr hwnd=new IntPtr(raw);if(raw<=0||!IsWindow(hwnd))throw new Exception("DESKTOP_WINDOW_CLOSED: la ventana ya no existe");
    uint pid;GetWindowThreadProcessId(hwnd,out pid);
    using(Process p=Process.GetProcessById((int)pid)){
      if(p.SessionId!=Process.GetCurrentProcess().SessionId)throw new Exception("DESKTOP_SESSION: no pertenece a esta sesión de Windows");
      if(blocked.Contains(p.ProcessName))throw new Exception("DESKTOP_SYSTEM_APP: terminales y herramientas administrativas no están permitidas");
      IntPtr token;if(!OpenProcessToken(p.Handle,8,out token))throw new Exception("DESKTOP_PRIVILEGE: no se puede verificar el nivel del proceso");
      try{int elevated,returned;if(!GetTokenInformation(token,20,out elevated,4,out returned)||elevated!=0)throw new Exception("DESKTOP_ELEVATED: no se controlan aplicaciones elevadas");}finally{CloseHandle(token);}
      StringBuilder title=new StringBuilder(2001);GetWindowText(hwnd,title,title.Capacity);RECT rect;if(!GetWindowRect(hwnd,out rect))throw new Exception("DESKTOP_BOUNDS: no se puede leer la ventana");
      return new Dictionary<string,object>{{"handle",raw.ToString(CultureInfo.InvariantCulture)},{"pid",(int)pid},{"startedAt",p.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture)},{"executable",p.MainModule.FileName},{"title",title.ToString()},{"visible",IsWindowVisible(hwnd)},{"minimized",IsIconic(hwnd)},{"left",rect.Left},{"top",rect.Top},{"width",rect.Right-rect.Left},{"height",rect.Bottom-rect.Top}};
    }
  }
  private static object Request(Dictionary<string,object> r){
    string op=Convert.ToString(r["op"]);
    if(op=="list"){
      List<object> windows=new List<object>();EnumWindows((h,l)=>{try{if(IsWindowVisible(h)){var d=Describe(h.ToInt64());if(Convert.ToString(d["title"]).Length>0)windows.Add(d);}}catch{}return true;},IntPtr.Zero);return new {windows=windows};
    }
    long handle=long.Parse(Convert.ToString(r["handle"]),CultureInfo.InvariantCulture);var descriptor=Describe(handle);
    if(op=="describe")return descriptor;
    string nonce=Convert.ToString(r["nonce"]);string property=Property(nonce);
    if(op=="bind"){
      if(!SetProp(new IntPtr(handle),property,new IntPtr(1)))throw new Exception("DESKTOP_BIND: Windows rechazó la vinculación");return descriptor;
    }
    if(op=="unbind"){RemoveProp(new IntPtr(handle),property);return new {released=true};}
    if(op!="check")throw new Exception("DESKTOP_OPERATION: operación no permitida");
    if(GetProp(new IntPtr(handle),property)!=new IntPtr(1)||Convert.ToInt32(r["pid"])!=Convert.ToInt32(descriptor["pid"])||Convert.ToString(r["startedAt"])!=Convert.ToString(descriptor["startedAt"])||!String.Equals(Convert.ToString(r["executable"]),Convert.ToString(descriptor["executable"]),StringComparison.OrdinalIgnoreCase))throw new Exception("DESKTOP_IDENTITY_CHANGED: la ventana no corresponde a la autorización original");
    if(!Convert.ToBoolean(descriptor["visible"])||Convert.ToBoolean(descriptor["minimized"]))throw new Exception("DESKTOP_WINDOW_HIDDEN: restaurá la ventana autorizada antes de continuar");
    return descriptor;
  }
  private sealed class EmergencyWindow:NativeWindow,IDisposable {
    private readonly string stopFile;
    [DllImport("user32.dll",SetLastError=true)] private static extern bool RegisterHotKey(IntPtr hwnd,int id,uint modifiers,uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hwnd,int id);
    public EmergencyWindow(string path){stopFile=path;CreateHandle(new CreateParams(){Caption="Perfect parada de emergencia",Parent=new IntPtr(-3)});if(!RegisterHotKey(Handle,1,0x4003,0x79))throw new Exception("DESKTOP_HOTKEY: Ctrl+Alt+F10 no está disponible; no se habilitará el control");}
    protected override void WndProc(ref Message m){if(m.Msg==0x0312){File.WriteAllText(stopFile,"stopped");Application.ExitThread();}base.WndProc(ref m);}
    public void Dispose(){UnregisterHotKey(Handle,1);DestroyHandle();}
  }
  [STAThread] public static int Main(string[] args){
    Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
    try{
      if(args.Length==4&&args[0]=="watch"){
        string path=Path.GetFullPath(args[1]);int parent=int.Parse(args[2],CultureInfo.InvariantCulture);long expiration=long.Parse(args[3],CultureInfo.InvariantCulture);
        if(File.Exists(path))throw new Exception("DESKTOP_STOPPED: autorización revocada");
        long parentStart=Process.GetProcessById(parent).StartTime.ToUniversalTime().Ticks;
        using(Mutex mutex=new Mutex(false,"Local\\PerfectHarness.DesktopControl")){
          bool owned=false;try{owned=mutex.WaitOne(0);}catch(AbandonedMutexException){owned=true;}
          if(!owned)throw new Exception("DESKTOP_BUSY: otro agente controla el escritorio");
          try{using(EmergencyWindow window=new EmergencyWindow(path))using(System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer()){
            timer.Interval=200;timer.Tick+=(s,e)=>{bool stop=File.Exists(path)||DateTime.UtcNow.Ticks>=expiration;try{stop=stop||Process.GetProcessById(parent).StartTime.ToUniversalTime().Ticks!=parentStart;}catch{stop=true;}if(stop)Application.ExitThread();};timer.Start();
            Console.WriteLine("{\"ready\":true,\"hotkey\":\"Ctrl+Alt+F10\"}");Console.Out.Flush();Application.Run();
            Console.WriteLine("{\"stopped\":true}");Console.Out.Flush();
          }}finally{mutex.ReleaseMutex();}
        }
        return 0;
      }
      if(args.Length!=0)throw new Exception("DESKTOP_ARGUMENTS: argumentos inválidos");
      string line=Console.ReadLine();if(line==null||line.Length>100000)throw new Exception("DESKTOP_INPUT: solicitud inválida");
      Console.WriteLine(json.Serialize(new {ok=true,result=Request(json.Deserialize<Dictionary<string,object>>(line))}));return 0;
    }catch(Exception e){Console.WriteLine(json.Serialize(new {ok=false,error=e.Message}));return 2;}
  }
}
