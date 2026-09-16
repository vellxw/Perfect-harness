using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;

// Test-only standard-user launch from an elevated hosted runner. This does not
// alter filesystem ACLs, the account or any production Electron security setting.
public static class PerfectProbeEntry {
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string value,uint revision,out IntPtr descriptor,out uint size);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorDacl(IntPtr descriptor,out bool present,out IntPtr dacl,out bool defaulted);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int type,IntPtr information,int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
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
      return PerfectV5Probe.Main(args);
    } catch(Exception error) { Console.Error.WriteLine(error);return 2; }
    finally {
      try{CopyStartupEvidence(args);}catch(Exception error){Console.Error.WriteLine("Startup evidence could not be collected: "+error.Message);}
      if(information!=IntPtr.Zero)Marshal.FreeHGlobal(information);
      if(descriptor!=IntPtr.Zero)LocalFree(descriptor);
      if(token!=IntPtr.Zero)CloseHandle(token);
    }
  }
}
