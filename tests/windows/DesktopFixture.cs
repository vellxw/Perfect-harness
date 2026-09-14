using System;
using System.Drawing;
using System.Windows.Forms;

public static class DesktopFixture {
  [STAThread] public static void Main() {
    Application.EnableVisualStyles();
    Form form = new Form(); form.Text="Perfect · prueba de escritorio"; form.Name="PerfectDesktopFixture"; form.Size=new Size(650,360); form.StartPosition=FormStartPosition.CenterScreen;
    TextBox input=new TextBox(); input.Name="MessageInput"; input.AccessibleName="Mensaje"; input.Location=new Point(30,60); input.Width=540;
    Label output=new Label(); output.Name="ResultLabel"; output.AccessibleName="Resultado"; output.Text="Todavía no se aplicó ningún mensaje"; output.Location=new Point(30,175); output.Width=570; output.Height=80;
    Button button=new Button(); button.Name="ApplyButton"; button.AccessibleName="Aplicar"; button.Text="Aplicar"; button.Location=new Point(30,115); button.Width=140; button.Click+=(s,e)=>{output.Text="Recibido: "+input.Text;};
    form.Controls.Add(input);form.Controls.Add(button);form.Controls.Add(output);Application.Run(form);
  }
}
