using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Automation;

// Read the real UIA IsPassword property. WinApp 0.6.0 incorrectly labels every Edit as a password.
// https://github.com/microsoft/winappCli/blob/v0.6.0/src/winapp-CLI/WinApp.Cli/Services/UiAutomationService.cs
public static class DesktopElementGuard {
  [STAThread] public static int Main() {
    Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
    var json=new JavaScriptSerializer(){MaxJsonLength=100000};
    try {
      string input=Console.ReadLine();if(input==null||input.Length>50000)throw new Exception("Invalid input");
      var request=json.Deserialize<Dictionary<string,object>>(input);
      long hwnd=long.Parse(Convert.ToString(request["handle"]),CultureInfo.InvariantCulture);
      int pid=Convert.ToInt32(request["pid"]);
      string name=Convert.ToString(request["name"]);
      double x=Convert.ToDouble(request["x"]),y=Convert.ToDouble(request["y"]),width=Convert.ToDouble(request["width"]),height=Convert.ToDouble(request["height"]);
      var root=AutomationElement.FromHandle(new IntPtr(hwnd));
      if(root==null||root.Current.ProcessId!=pid)throw new Exception("Window identity changed");
      var elements=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);
      if(elements.Count>2000)throw new Exception("UIA tree limit exceeded");
      AutomationElement found=null;int matches=0;
      foreach(AutomationElement item in elements){
        var current=item.Current;var r=current.BoundingRectangle;
        if(current.ProcessId!=pid||current.Name!=name||Math.Abs(r.Left-x)>1||Math.Abs(r.Top-y)>1||Math.Abs(r.Width-width)>1||Math.Abs(r.Height-height)>1)continue;
        found=item;matches++;
      }
      if(matches!=1||found==null)throw new Exception("The observed control is no longer unique in this window");
      var c=found.Current;
      Console.WriteLine(json.Serialize(new {ok=true,element=new {isPassword=c.IsPassword,isEnabled=c.IsEnabled,isOffscreen=c.IsOffscreen,automationId=c.AutomationId,processId=c.ProcessId,name=c.Name}}));return 0;
    }catch(Exception e){Console.WriteLine(json.Serialize(new {ok=false,error=e.Message}));return 2;}
  }
}
