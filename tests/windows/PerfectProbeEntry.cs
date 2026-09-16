using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// Test-only standard-user launch from an elevated hosted runner. Never shipped.
public static class PerfectProbeEntry {
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string value,uint revision,out IntPtr descriptor,out uint size);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorDacl(IntPtr descriptor,out bool present,out IntPtr dacl,out bool defaulted);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int type,IntPtr information,int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  static object PathState() {
    var receipts=new Dictionary<string,object>();
    using(var own=Registry.CurrentUser.OpenSubKey("Software\\PerfectHarness")) {
      foreach(var key in new[]{"PathAdded","PathBeforeOwn","PathAfterOwn","PathOriginallyPresent"})receipts[key]=own==null?null:own.GetValue(key,null,RegistryValueOptions.DoNotExpandEnvironmentNames);
    }
    using(var env=Registry.CurrentUser.OpenSubKey("Environment")) {
      var raw=env==null?null:env.GetValue("Path",null,RegistryValueOptions.DoNotExpandEnvironmentNames);
      return new {raw=raw,dotnetUserValue=Environment.GetEnvironmentVariable("Path",EnvironmentVariableTarget.User),kind=raw==null?null:env.GetValueKind("Path").ToString(),receipts=receipts};
    }
  }
  static void CopyStartupEvidence(string[] args) {
    if(args.Length<5 || args[0]!="journey")return;
    string allowed=Path.GetFullPath(Environment.GetEnvironmentVariable("PERFECT_TEST_ROOT")).TrimEnd('\\')+"\\";
    string home=Path.GetFullPath(args[2]),output=Path.GetFullPath(args[4]);
    if(!home.StartsWith(allowed,StringComparison.OrdinalIgnoreCase)||!output.StartsWith(allowed,StringComparison.OrdinalIgnoreCase))return;
    if(!Directory.Exists(home)||!Directory.Exists(output))return;
    foreach(string file in Directory.GetFiles(home,"desktop-startup-*.jsonl",SearchOption.TopDirectoryOnly)){
      var info=new FileInfo(file);
      if((info.Attributes&FileAttributes.ReparsePoint)!=0||info.Length>100000)continue;
      string content=File.ReadAllText(file);
      File.WriteAllText(Path.Combine(output,Path.GetFileName(file)),content);
      Console.WriteLine("Owned synthetic engine startup evidence: "+content);
    }
  }
  [STAThread] public static int Main(string[] args) {
    IntPtr token=IntPtr.Zero,descriptor=IntPtr.Zero,information=IntPtr.Zero;
    try {
      if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true" || String.IsNullOrEmpty(Environment.GetEnvironmentVariable("PERFECT_TEST_ROOT"))) throw new Exception("This entry is restricted to the owned CI probe");
      string user=WindowsIdentity.GetCurrent().User.Value;
      if(!user.StartsWith("S-1-5-21-",StringComparison.Ordinal)) throw new Exception("Expected a normal hosted-runner account SID");
      if(!OpenProcessToken(Process.GetCurrentProcess().Handle,0x88,out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
      uint size;
      if(!ConvertStringSecurityDescriptorToSecurityDescriptor("D:P(A;;GA;;;SY)(A;;GA;;;"+user+")",1,out descriptor,out size)) throw new Win32Exception(Marshal.GetLastWin32Error());
      bool present,defaulted;IntPtr dacl;
      if(!GetSecurityDescriptorDacl(descriptor,out present,out dacl,out defaulted)||!present||dacl==IntPtr.Zero) throw new Exception("No explicit user-scoped DACL");
      information=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(information,dacl);
      if(!SetTokenInformation(token,6,information,IntPtr.Size)) throw new Win32Exception(Marshal.GetLastWin32Error());
      Console.Error.WriteLine("CI object defaults: current user and SYSTEM only; child must prove medium integrity, not elevated and not administrator.");
      bool pathOperation=args.Length>0&&(args[0]=="install"||args[0]=="uninstall");
      var before=pathOperation?PathState():null;
      int result=PerfectV5Probe.Main(args);
      if(pathOperation)Console.WriteLine("Owned CI PATH receipt comparison: "+new JavaScriptSerializer().Serialize(new{operation=args[0],before=before,after=PathState()}));
      return result;
    } catch(Exception error) { Console.Error.WriteLine(error);return 2; }
    finally {
      try{CopyStartupEvidence(args);}catch(Exception error){Console.Error.WriteLine("Startup evidence could not be collected: "+error.Message);}
      if(information!=IntPtr.Zero)Marshal.FreeHGlobal(information);
      if(descriptor!=IntPtr.Zero)LocalFree(descriptor);
      if(token!=IntPtr.Zero)CloseHandle(token);
    }
  }
}
