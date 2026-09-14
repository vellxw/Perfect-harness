using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

// CI-only helper: launches the owned fixture with a restricted medium-integrity token.
// The production guard is unchanged and still refuses elevated application windows.
public static class StartUnelevated {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct STARTUPINFO {
    public int cb;public string reserved;public string desktop;public string title;
    public int x,y,xSize,ySize,xChars,yChars,fill,flags;public short show,reserved2;
    public IntPtr reservedPtr,stdIn,stdOut,stdErr;
  }
  [StructLayout(LayoutKind.Sequential)] private struct PROCESS_INFORMATION {public IntPtr process,thread;public int pid,tid;}
  [StructLayout(LayoutKind.Sequential)] private struct SID_AND_ATTRIBUTES {public IntPtr sid;public uint attributes;}
  [DllImport("advapi32.dll",SetLastError=true)] private static extern bool OpenProcessToken(IntPtr p,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] private static extern bool CreateRestrictedToken(IntPtr token,uint flags,uint disableCount,IntPtr disable,uint deleteCount,IntPtr deletes,uint restrictCount,IntPtr restrictions,out IntPtr restricted);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool ConvertStringSidToSid(string value,out IntPtr sid);
  [DllImport("advapi32.dll",SetLastError=true)] private static extern bool SetTokenInformation(IntPtr token,int type,ref SID_AND_ATTRIBUTES info,int size);
  [DllImport("advapi32.dll")] private static extern uint GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool CreateProcessAsUser(IntPtr token,string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool CreateProcessWithTokenW(IntPtr token,uint logonFlags,string application,StringBuilder command,uint flags,IntPtr environment,string directory,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
  [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr h);
  [DllImport("kernel32.dll")] private static extern uint WaitForSingleObject(IntPtr h,uint milliseconds);
  [DllImport("kernel32.dll")] private static extern bool GetExitCodeProcess(IntPtr h,out uint code);
  public static int Main(string[] args){
    IntPtr token=IntPtr.Zero,restricted=IntPtr.Zero,sid=IntPtr.Zero;
    try {
      if(args.Length!=1)throw new Exception("Pass only the owned fixture executable");
      string exe=Path.GetFullPath(args[0]);
      if(!String.Equals(Path.GetFileName(exe),"PerfectDesktopFixture.exe",StringComparison.OrdinalIgnoreCase))throw new Exception("Only the test fixture may be launched");
      if(!OpenProcessToken(Process.GetCurrentProcess().Handle,0xF01FF,out token))throw new Win32Exception(Marshal.GetLastWin32Error());
      if(!CreateRestrictedToken(token,0x4,0,IntPtr.Zero,0,IntPtr.Zero,0,IntPtr.Zero,out restricted))throw new Win32Exception(Marshal.GetLastWin32Error());
      if(!ConvertStringSidToSid("S-1-16-8192",out sid))throw new Win32Exception(Marshal.GetLastWin32Error());
      SID_AND_ATTRIBUTES label=new SID_AND_ATTRIBUTES(){sid=sid,attributes=0x20};
      if(!SetTokenInformation(restricted,25,ref label,Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES))+(int)GetLengthSid(sid)))throw new Win32Exception(Marshal.GetLastWin32Error());
      STARTUPINFO startup=new STARTUPINFO();startup.cb=Marshal.SizeOf(typeof(STARTUPINFO));startup.desktop="winsta0\\default";
      PROCESS_INFORMATION process;
      if(!CreateProcessAsUser(restricted,exe,new StringBuilder("\""+exe+"\""),IntPtr.Zero,IntPtr.Zero,false,0,IntPtr.Zero,Environment.CurrentDirectory,ref startup,out process)&&!CreateProcessWithTokenW(restricted,0,exe,new StringBuilder("\""+exe+"\""),0,IntPtr.Zero,Environment.CurrentDirectory,ref startup,out process))throw new Win32Exception(Marshal.GetLastWin32Error());
      try{Console.WriteLine(process.pid);Console.Out.Flush();WaitForSingleObject(process.process,180000);uint code;GetExitCodeProcess(process.process,out code);return code==259?0:(int)code;}
      finally{CloseHandle(process.thread);CloseHandle(process.process);}
    }catch(Exception e){Console.Error.WriteLine(e.ToString());return 2;}
    finally{if(sid!=IntPtr.Zero)LocalFree(sid);if(restricted!=IntPtr.Zero)CloseHandle(restricted);if(token!=IntPtr.Zero)CloseHandle(token);}
  }
}
