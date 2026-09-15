using System;
using System.Text;
using System.Security.Cryptography;
public static class CredentialVault {
  public static int Main(string[] args){
    try {
      if(args.Length!=1||(args[0]!="protect"&&args[0]!="unprotect"))return 2;
      string line=Console.ReadLine();if(line==null||line.Length>100000)return 2;
      byte[] input=Convert.FromBase64String(line);
      byte[] entropy=Encoding.UTF8.GetBytes("PerfectHarness.LocalCredential.v1");
      byte[] output=args[0]=="protect"?ProtectedData.Protect(input,entropy,DataProtectionScope.CurrentUser):ProtectedData.Unprotect(input,entropy,DataProtectionScope.CurrentUser);
      Console.WriteLine(Convert.ToBase64String(output));Array.Clear(input,0,input.Length);Array.Clear(output,0,output.Length);return 0;
    } catch {Console.Error.WriteLine("No se pudo acceder a la credencial local de este usuario de Windows.");return 2;}
  }
}
