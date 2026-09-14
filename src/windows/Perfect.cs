using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
[assembly: AssemblyTitle("Perfect Harness")]
[assembly: AssemblyDescription("Evidence-driven coding agents · Glass TUI")]
[assembly: AssemblyCompany("Perfect Harness")]
[assembly: AssemblyProduct("Perfect Harness")]
[assembly: AssemblyCopyright("Perfect Harness contributors")]
[assembly: AssemblyVersion("0.2.0.0")]
[assembly: AssemblyFileVersion("0.2.0.0")]
[assembly: AssemblyInformationalVersion("0.2.0")]

internal static class Perfect {
 [DllImport("kernel32.dll")] static extern uint GetConsoleProcessList(uint[] list,uint count);
 [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
 [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action,uint param,ref ANIMATIONINFO info,uint flags);
 [StructLayout(LayoutKind.Sequential)] struct ANIMATIONINFO {public uint cbSize;public int iMinAnimate;}
 static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
 static string Exe {get{return Path.Combine(Root,"Perfect.exe");}}
 static string Fragment {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Microsoft","Windows Terminal","Fragments","PerfectHarness","PerfectHarness.json");}}
 static string Workspace {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"Perfect Projects","Workspace");}}
 [STAThread] static int Main(string[] args){
  try{
   try{Console.OutputEncoding=new UTF8Encoding(false);Console.Title="Perfect Harness";}catch{}
   if(args.Contains("--install-profile")){RegisterProfile();Console.WriteLine(Fragment);return 0;}
   if(args.Contains("--remove-profile")){RemoveProfile();return 0;}
   if(args.Contains("--print-profile")){Console.WriteLine(BuildProfile());return 0;}
   bool child=args.Contains("--tui-child"),window=args.Contains("--window");
   uint[] ids=new uint[4];bool explorer=!child&&args.Length==0&&GetConsoleProcessList(ids,4)==1;
   string[] forwarded=args.Where(a=>a!="--window"&&a!="--tui-child").ToArray();
   if(!child&&(window||explorer))return LaunchWindow(forwarded);
   return RunNode(forwarded);
  }catch(Exception error){Console.Error.WriteLine("Perfect: "+error.Message);return 1;}
 }
 static string EscapeJson(string value){return value.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","\\r").Replace("\n","\\n");}
 // Microsoft C runtime / CommandLineToArgvW-compatible argument quoting; never invokes cmd or PowerShell.
 internal static string Quote(string value){var b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);b.Append('"');return b.ToString();}
 static string BuildProfile(){
  string template=File.ReadAllText(Path.Combine(Root,"assets","windows","terminal-fragment.template.json"));
  return template.Replace("__COMMAND__",EscapeJson(Quote(Exe)+" --tui-child")).Replace("__WORKSPACE__",EscapeJson(Workspace)).Replace("__ICON__",EscapeJson(Path.Combine(Root,"assets","brand","perfect.ico"))).Replace("__BACKGROUND__",EscapeJson(Path.Combine(Root,"assets","brand","perfect-wallpaper.png")));
 }
 static void RegisterProfile(){Directory.CreateDirectory(Path.GetDirectoryName(Fragment));Directory.CreateDirectory(Workspace);File.WriteAllText(Fragment,BuildProfile(),new UTF8Encoding(false));}
 static void RemoveProfile(){if(File.Exists(Fragment)&&File.ReadAllText(Fragment).IndexOf(EscapeJson(Exe),StringComparison.OrdinalIgnoreCase)>=0){File.Delete(Fragment);if(!Directory.EnumerateFileSystemEntries(Path.GetDirectoryName(Fragment)).Any())Directory.Delete(Path.GetDirectoryName(Fragment));}}
 static string FindTerminal(){
  string custom=Environment.GetEnvironmentVariable("PERFECT_WT_PATH");
  if(!String.IsNullOrWhiteSpace(custom)){if(!Path.IsPathRooted(custom)||!File.Exists(custom))throw new IOException("PERFECT_WT_PATH must name an existing absolute Windows Terminal executable.");return custom;}
  string standard=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Microsoft","WindowsApps","wt.exe");
  return File.Exists(standard)?standard:null;
 }
 static int LaunchWindow(string[] args){
  string terminal=FindTerminal();
  if(terminal==null){MessageBox.Show("Perfect uses Windows Terminal for its visual interface. Install Windows Terminal from Microsoft, then open Perfect again.\n\nThe classic CLI also works from an existing terminal. Your project has not been modified.","Perfect Harness",MessageBoxButtons.OK,MessageBoxIcon.Information);return 2;}
  RegisterProfile();
  string work=Environment.CurrentDirectory;
  if(String.Equals(work.TrimEnd('\\'),Root.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)||!Directory.Exists(work))work=Workspace;
  var command=new StringBuilder("-w new new-tab -p ").Append(Quote("Perfect Harness")).Append(" -d ").Append(Quote(work)).Append(" --title ").Append(Quote("Perfect Harness")).Append(" ").Append(Quote(Exe)).Append(" --tui-child");
  foreach(string arg in args)command.Append(" ").Append(Quote(arg));
  var start=new ProcessStartInfo(terminal,command.ToString());start.UseShellExecute=false;start.WorkingDirectory=work;start.CreateNoWindow=true;
  using(var process=Process.Start(start)){if(process==null)throw new IOException("Windows Terminal did not start.");}
  IntPtr console=GetConsoleWindow();if(console!=IntPtr.Zero)ShowWindow(console,0);
  return 0;
 }
 static int RunNode(string[] args){
  string node=Path.Combine(Root,"runtime","node.exe"),entry=Path.Combine(Root,"app","dist","cli","index.js");
  if(!File.Exists(node)||!File.Exists(entry))throw new IOException("The package is incomplete. Extract/install the entire Perfect folder, not only Perfect.exe.");
  var command=new StringBuilder("--experimental-ffi ").Append(Quote(entry));foreach(string arg in args)command.Append(" ").Append(Quote(arg));
  var start=new ProcessStartInfo(node,command.ToString());start.UseShellExecute=false;start.WorkingDirectory=Environment.CurrentDirectory;
  // Application code cannot inject Node startup options through a project .env.
  start.EnvironmentVariables.Remove("NODE_OPTIONS");
  var animation=new ANIMATIONINFO();animation.cbSize=(uint)Marshal.SizeOf(typeof(ANIMATIONINFO));
  if(SystemParametersInfo(0x0048,animation.cbSize,ref animation,0)&&animation.iMinAnimate==0)start.EnvironmentVariables["PERFECT_REDUCED_MOTION"]="1";
  using(var process=Process.Start(start)){if(process==null)throw new IOException("Bundled runtime did not start.");ConsoleCancelEventHandler handler=(sender,e)=>{e.Cancel=true;};Console.CancelKeyPress+=handler;try{process.WaitForExit();return process.ExitCode;}finally{Console.CancelKeyPress-=handler;}}
 }
}
