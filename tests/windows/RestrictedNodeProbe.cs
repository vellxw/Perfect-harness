using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

// CI-only: seed and inspect user data at the SAME integrity level as the GUI.
// Elevated fixture creation is not representative of an ordinary installation.
// No filesystem permission is broadened and no production guard is bypassed.
public static class RestrictedNodeProbe {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO {
    public int cb;public string reserved,desktop,title;public int x,y,w,h,cols,rows,fill,flags;public short show,reserved2;public IntPtr reservedPtr,stdIn,stdOut,stdErr;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {public IntPtr process,thread;public int pid,tid;}
  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES {public IntPtr sid;public uint attributes;}
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr p,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr token,uint flags,uint n1,IntPtr p1,uint n2,IntPtr p2,uint n3,IntPtr p3,out IntPtr restricted);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSidToSid(string value,out IntPtr sid);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string s,uint revision,out IntPtr d,out uint size);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorDacl(IntPtr d,out bool present,out IntPtr acl,out bool defaulted);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int type,IntPtr data,int size);
  [DllImport("advapi32.dll",SetLastError=true,EntryPoint="SetTokenInformation")] static extern bool SetLabel(IntPtr token,int type,ref SID_AND_ATTRIBUTES data,int size);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int type,IntPtr data,int size,out int length);
  [DllImport("advapi32.dll")] static extern uint GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessAsUser(IntPtr token,string app,StringBuilder command,IntPtr ps,IntPtr ts,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO startup,out PROCESS_INFORMATION child);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessWithTokenW(IntPtr token,uint flags,string app,StringBuilder command,uint creation,IntPtr env,string cwd,ref STARTUPINFO startup,out PROCESS_INFORMATION child);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr h);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint timeout);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
  static string Owned(string value,string root) {
    string full=Path.GetFullPath(value),prefix=root.TrimEnd('\\')+"\\";
    if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new Exception("Command path outside owned CI tree");
    string at=full;while(at!=null&&at.Length>=root.Length){if((File.Exists(at)||Directory.Exists(at))&&(File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new Exception("Reparse point in CI command path");at=Path.GetDirectoryName(at);}
    return full;
  }
  static string Quote(string value) {
    var b=new StringBuilder("\"");int slashes=0;
    foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);b.Append('"');return b.ToString();
  }
  public static int Main(string[] args) {
    IntPtr token=IntPtr.Zero,restricted=IntPtr.Zero,sid=IntPtr.Zero,descriptor=IntPtr.Zero,info=IntPtr.Zero;
    string oldOptions=Environment.GetEnvironmentVariable("NODE_OPTIONS"),oldPath=Environment.GetEnvironmentVariable("NODE_PATH");
    try {
      string root=Environment.GetEnvironmentVariable("PERFECT_TEST_ROOT");
      if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true"||String.IsNullOrEmpty(root)||args.Length<2)throw new Exception("Only an owned CI package may use this helper");
      root=Path.GetFullPath(root);string exe=Owned(args[0],root),script=Owned(args[1],root),name=Path.GetFileName(script);
      if(Path.GetFileName(exe)!="node.exe"||!exe.EndsWith("\\runtime\\node.exe",StringComparison.OrdinalIgnoreCase)||!File.Exists(exe))throw new Exception("Expected bundled Node, not a host executable");
      if(name!="desktop-cli-check.mjs"&&name!="upgrade-fixture.mjs")throw new Exception("Only the two reviewed fixture commands may run");
      if(!OpenProcessToken(Process.GetCurrentProcess().Handle,0xF01FF,out token))throw new Win32Exception(Marshal.GetLastWin32Error());
      string user=WindowsIdentity.GetCurrent().User.Value;uint bytes;
      if(!ConvertStringSecurityDescriptorToSecurityDescriptor("D:P(A;;GA;;;SY)(A;;GA;;;"+user+")",1,out descriptor,out bytes))throw new Win32Exception(Marshal.GetLastWin32Error());
      bool present,defaulted;IntPtr acl;
      if(!GetSecurityDescriptorDacl(descriptor,out present,out acl,out defaulted)||!present)throw new Exception("Default DACL missing");
      info=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(info,acl);
      if(!SetTokenInformation(token,6,info,IntPtr.Size))throw new Win32Exception(Marshal.GetLastWin32Error());
      if(!CreateRestrictedToken(token,0x4,0,IntPtr.Zero,0,IntPtr.Zero,0,IntPtr.Zero,out restricted))throw new Win32Exception(Marshal.GetLastWin32Error());
      if(!ConvertStringSidToSid("S-1-16-8192",out sid))throw new Win32Exception(Marshal.GetLastWin32Error());
      var label=new SID_AND_ATTRIBUTES{sid=sid,attributes=0x20};
      if(!SetLabel(restricted,25,ref label,Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES))+(int)GetLengthSid(sid)))throw new Win32Exception(Marshal.GetLastWin32Error());
      int needed;if(!GetTokenInformation(restricted,20,info,4,out needed)||Marshal.ReadInt32(info)!=0)throw new Exception("Fixture token remains elevated");
      using(var identity=new WindowsIdentity(restricted)){if(new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))throw new Exception("Fixture retained administrator membership");}
      Environment.SetEnvironmentVariable("NODE_OPTIONS",null);Environment.SetEnvironmentVariable("NODE_PATH",null);
      var command=new StringBuilder(Quote(exe));for(int i=1;i<args.Length;i++)command.Append(" ").Append(Quote(args[i]));
      var startup=new STARTUPINFO{cb=Marshal.SizeOf(typeof(STARTUPINFO)),desktop="winsta0\\default"};PROCESS_INFORMATION child;
      if(!CreateProcessAsUser(restricted,exe,new StringBuilder(command.ToString()),IntPtr.Zero,IntPtr.Zero,false,0,IntPtr.Zero,root,ref startup,out child)&&!CreateProcessWithTokenW(restricted,0,exe,new StringBuilder(command.ToString()),0,IntPtr.Zero,root,ref startup,out child))throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        Console.WriteLine("Standard-user fixture: "+name+" pid="+child.pid+" mediumIntegrity=true elevated=false administrator=false");
        if(WaitForSingleObject(child.process,180000)!=0)throw new Exception("Fixture did not finish; no result is accepted");uint code;if(!GetExitCodeProcess(child.process,out code))throw new Win32Exception(Marshal.GetLastWin32Error());return (int)code;
      }finally{CloseHandle(child.thread);CloseHandle(child.process);}
    }catch(Exception error){Console.Error.WriteLine(error);return 2;}
    finally {
      Environment.SetEnvironmentVariable("NODE_OPTIONS",oldOptions);Environment.SetEnvironmentVariable("NODE_PATH",oldPath);
      if(info!=IntPtr.Zero)Marshal.FreeHGlobal(info);if(descriptor!=IntPtr.Zero)LocalFree(descriptor);if(sid!=IntPtr.Zero)LocalFree(sid);if(restricted!=IntPtr.Zero)CloseHandle(restricted);if(token!=IntPtr.Zero)CloseHandle(token);
    }
  }
}
