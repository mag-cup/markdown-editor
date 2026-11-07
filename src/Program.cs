using System;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;

namespace MarkdownEditor
{
    static class Program
    {
        // 埋め込んでいる WebView2 SDK のバージョン（展開先フォルダ名に使用）
        const string WebView2SdkVersion = "1.0.4314.35";

        static readonly string[] EmbeddedLibs =
        {
            "Microsoft.Web.WebView2.Core.dll",
            "Microsoft.Web.WebView2.WinForms.dll",
            "WebView2Loader.dll",
        };

        internal static string LibDir;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                LibDir = ExtractLibs();
            }
            catch (Exception ex)
            {
                MessageBox.Show("ライブラリの展開に失敗しました。\n\n" + ex.Message, "Markdown Editor",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            AppDomain.CurrentDomain.AssemblyResolve += OnAssemblyResolve;
            Run(args);
        }

        // WebView2 の型を参照するコードは AssemblyResolve 登録後に JIT させるため別メソッドに分離
        [MethodImpl(MethodImplOptions.NoInlining)]
        static void Run(string[] args)
        {
            string path = args.Length > 0 ? args[0] : null;
            Application.Run(new MainForm(path));
        }

        static Assembly OnAssemblyResolve(object sender, ResolveEventArgs e)
        {
            string name = new AssemblyName(e.Name).Name;
            if (!name.StartsWith("Microsoft.Web.WebView2", StringComparison.OrdinalIgnoreCase)) return null;
            string path = Path.Combine(LibDir, name + ".dll");
            return File.Exists(path) ? Assembly.LoadFrom(path) : null;
        }

        // exe に埋め込んだ DLL を %LOCALAPPDATA%\MarkdownEditor\lib\<ver> に展開する
        static string ExtractLibs()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MarkdownEditor", "lib", WebView2SdkVersion);
            Directory.CreateDirectory(dir);

            Assembly asm = Assembly.GetExecutingAssembly();
            foreach (string name in EmbeddedLibs)
            {
                byte[] expected;
                using (Stream src = asm.GetManifestResourceStream("lib/" + name))
                {
                    if (src == null) throw new FileNotFoundException("埋め込みリソースが見つかりません: " + name);
                    expected = new byte[src.Length];
                    int read = 0;
                    while (read < expected.Length)
                    {
                        int n = src.Read(expected, read, expected.Length - read);
                        if (n <= 0) throw new EndOfStreamException(name);
                        read += n;
                    }
                }
                string path = Path.Combine(dir, name);

                // 既存ファイルは中身（SHA-256）が一致する場合だけ使う。差し替えられていれば書き直す
                for (int attempt = 0; ; attempt++)
                {
                    if (File.Exists(path) && SameHash(path, expected)) break;
                    try
                    {
                        File.WriteAllBytes(path, expected);
                        break;
                    }
                    catch (IOException)
                    {
                        // 別インスタンスが同時に書き込んでいる場合など。少し待って確認し直す
                        if (attempt >= 5) throw;
                        Thread.Sleep(200);
                    }
                }
            }
            return dir;
        }

        static bool SameHash(string path, byte[] expected)
        {
            try
            {
                using (SHA256 sha = SHA256.Create())
                {
                    byte[] a = sha.ComputeHash(expected);
                    byte[] b;
                    using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                        b = sha.ComputeHash(fs);
                    for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
                    return true;
                }
            }
            catch (IOException)
            {
                return false;
            }
        }
    }
}
