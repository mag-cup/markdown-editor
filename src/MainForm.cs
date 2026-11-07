using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MarkdownEditor
{
    public class MainForm : Form
    {
        const string AppName = "Markdown Editor";
        const string AppOrigin = "https://app.local/";
        const string DocHost = "doc.local";
        const long LargeFileBytes = 50L * 1024 * 1024;
        const string FileFilter = "Markdown (*.md;*.markdown)|*.md;*.markdown;*.mdown;*.mkd|テキスト (*.txt)|*.txt|すべてのファイル (*.*)|*.*";

        static readonly string[] ImageExts = { ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".ico" };
        static readonly string[] MarkdownExts = { ".md", ".markdown", ".mdown", ".mkd", ".txt" };

        static readonly string AppDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MarkdownEditor");

        readonly WebView2 web;
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        CoreWebView2Environment env;
        CoreWebView2 core;

        string startupPath;
        string currentPath;
        Encoding currentEncoding = new UTF8Encoding(false);
        bool useCrlf;
        bool dirty;
        bool closeConfirmed;

        public MainForm(string path)
        {
            startupPath = path;
            Text = AppName;
            StartPosition = FormStartPosition.Manual;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            RestoreWindowState();

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            Controls.Add(web);

            Load += OnFormLoad;
            FormClosing += OnFormClosing;
        }

        string DocName
        {
            get { return currentPath == null ? "無題" : Path.GetFileName(currentPath); }
        }

        // ------------------------------------------------------------------ 初期化

        async void OnFormLoad(object sender, EventArgs e)
        {
            try
            {
                CoreWebView2Environment.SetLoaderDllFolderPath(Program.LibDir);
                env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(AppDataDir, "WebView2"), null);
                await web.EnsureCoreWebView2Async(env);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                MessageBox.Show(this,
                    "Microsoft Edge WebView2 ランタイムが見つかりません。\n" +
                    "https://developer.microsoft.com/microsoft-edge/webview2/ からインストールしてください。",
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                closeConfirmed = true;
                Close();
                return;
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "WebView2 の初期化に失敗しました。\n\n" + ex.Message, AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                closeConfirmed = true;
                Close();
                return;
            }

            core = web.CoreWebView2;
            CoreWebView2Settings s = core.Settings;
            s.AreDevToolsEnabled = Environment.GetEnvironmentVariable("MDEDIT_DEVTOOLS") == "1";
            s.AreBrowserAcceleratorKeysEnabled = false; // F5 リロード等で編集内容が消えるのを防ぐ
            s.IsZoomControlEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsGeneralAutofillEnabled = false;
            s.IsPasswordAutosaveEnabled = false;

            core.AddWebResourceRequestedFilter(AppOrigin + "*", CoreWebView2WebResourceContext.All);
            core.AddWebResourceRequestedFilter("https://" + DocHost + "/*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += OnWebResourceRequested;
            core.WebMessageReceived += OnWebMessageReceived;
            core.NavigationStarting += OnNavigationStarting;
            core.NewWindowRequested += OnNewWindowRequested;
            core.ContextMenuRequested += OnContextMenuRequested;

            core.Navigate(AppOrigin + "index.html");
        }

        // アプリ本体の HTML/JS/CSS は exe の埋め込みリソースから配信する
        void OnWebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            Uri uri = new Uri(e.Request.Uri);
            if (string.Equals(uri.Host, DocHost, StringComparison.OrdinalIgnoreCase))
            {
                ServeDocFile(uri, e);
                return;
            }
            string path = uri.AbsolutePath.TrimStart('/');
            if (path.Length == 0) path = "index.html";
            Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("web/" + path);
            if (stream == null)
            {
                e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", "");
                return;
            }
            string headers = "Content-Type: " + MimeOf(path) + "\r\nCache-Control: no-store";
            if (path == "index.html")
            {
                headers += "\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; " +
                           "style-src 'self' 'unsafe-inline'; img-src * data: blob:; media-src *; " +
                           "object-src 'none'; base-uri 'none'; form-action 'none'";
            }
            e.Response = env.CreateWebResourceResponse(stream, 200, "OK", headers);
        }

        // https://doc.local/C/dir/file.png → C:\dir\file.png（画像・動画・音声のみ配信）
        void ServeDocFile(Uri uri, CoreWebView2WebResourceRequestedEventArgs e)
        {
            try
            {
                string[] parts = uri.AbsolutePath.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(Uri.UnescapeDataString).ToArray();
                string root = DocServeRoot();
                if (root != null && parts.Length >= 2 &&
                    parts.All(p => p != ".." && p.IndexOfAny(Path.GetInvalidFileNameChars()) < 0))
                {
                    string file = Path.GetFullPath(parts[0] + ":\\" + string.Join("\\", parts.Skip(1)));
                    string mime = MimeOf(file);
                    if (file.StartsWith(root, StringComparison.OrdinalIgnoreCase) &&
                        Regex.IsMatch(mime, "^(image|video|audio)/") && File.Exists(file))
                    {
                        Stream fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                        e.Response = env.CreateWebResourceResponse(fs, 200, "OK",
                            "Content-Type: " + mime + "\r\nCache-Control: no-cache");
                        return;
                    }
                }
            }
            catch { }
            e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", "");
        }

        // doc.local で配信してよい範囲（文書フォルダの 1 つ上のフォルダ配下）。末尾は必ず '\'
        string DocServeRoot()
        {
            if (currentPath == null) return null;
            string dir = Path.GetDirectoryName(Path.GetFullPath(currentPath));
            if (dir == null) return null;
            string parent = Path.GetDirectoryName(dir);
            string root = parent ?? dir; // 文書がドライブ直下にある場合はドライブ全体
            return root.EndsWith("\\") ? root : root + "\\";
        }

        static string MimeOf(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".bmp": return "image/bmp";
                case ".webp": return "image/webp";
                case ".ico": return "image/x-icon";
                case ".avif": return "image/avif";
                case ".mp4": return "video/mp4";
                case ".webm": return "video/webm";
                case ".mp3": return "audio/mpeg";
                case ".wav": return "audio/wav";
                case ".ogg": return "audio/ogg";
                default: return "application/octet-stream";
            }
        }

        void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (e.Uri.StartsWith(AppOrigin, StringComparison.OrdinalIgnoreCase)) return;
            e.Cancel = true;
            OpenExternalUrl(e.Uri);
        }

        void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            OpenExternalUrl(e.Uri);
        }

        // リロード・戻る等、編集内容を失う／不要なメニュー項目を除去
        static readonly HashSet<string> RemovedMenuItems = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "back", "forward", "reload", "saveAs", "print", "createQrCode", "share", "inspectElement",
            "webCapture", "sendTabToDevices", "openLinkInNewWindow", "saveLinkAs", "saveImageAs",
            "copyImageLocation", "openImageInNewWindow", "copyLinkLocation", "other",
        };

        void OnContextMenuRequested(object sender, CoreWebView2ContextMenuRequestedEventArgs e)
        {
            IList<CoreWebView2ContextMenuItem> items = e.MenuItems;
            for (int i = items.Count - 1; i >= 0; i--)
            {
                if (RemovedMenuItems.Contains(items[i].Name)) items.RemoveAt(i);
            }
            // 先頭・末尾・連続する区切り線を整理
            for (int i = items.Count - 1; i >= 0; i--)
            {
                bool sep = items[i].Kind == CoreWebView2ContextMenuItemKind.Separator;
                if (sep && (i == 0 || i == items.Count - 1 ||
                            items[i - 1].Kind == CoreWebView2ContextMenuItemKind.Separator))
                    items.RemoveAt(i);
            }
        }

        // ------------------------------------------------------------------ JS との通信

        void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            // アプリ本体のページ以外からのメッセージは受け付けない
            if (e.Source == null || !e.Source.StartsWith(AppOrigin, StringComparison.OrdinalIgnoreCase)) return;
            string msgJson = e.WebMessageAsJson;
            List<string> files = new List<string>();
            if (e.AdditionalObjects != null)
            {
                foreach (object o in e.AdditionalObjects)
                {
                    CoreWebView2File f = o as CoreWebView2File;
                    if (f != null) files.Add(f.Path);
                }
            }
            // モーダルダイアログをイベントハンドラ内で出さないよう、処理を後回しにする
            BeginInvoke(new Action(() => HandleMessage(msgJson, files)));
        }

        async void HandleMessage(string msgJson, List<string> files)
        {
            try
            {
                Dictionary<string, object> m = json.Deserialize<Dictionary<string, object>>(msgJson);
                string type = GetString(m, "type");
                switch (type)
                {
                    case "ready":
                        if (startupPath != null) OpenFile(startupPath);
                        else SendDocInfo("load", "");
                        startupPath = null;
                        break;
                    case "dirty":
                        dirty = m.ContainsKey("value") && (bool)m["value"];
                        UpdateTitle();
                        break;
                    case "new":
                        if (await ConfirmDiscardAsync(GetString(m, "text")))
                        {
                            currentPath = null;
                            currentEncoding = new UTF8Encoding(false);
                            useCrlf = false;
                            dirty = false;
                            SendDocInfo("load", "");
                            UpdateTitle();
                        }
                        break;
                    case "open":
                        if (await ConfirmDiscardAsync(GetString(m, "text")))
                        {
                            string p = ShowOpenDialog();
                            if (p != null) OpenFile(p);
                        }
                        break;
                    case "save":
                        SaveDocument(GetString(m, "text"), false);
                        break;
                    case "saveAs":
                        SaveDocument(GetString(m, "text"), true);
                        break;
                    case "exportHtml":
                        ExportHtml(GetString(m, "html"));
                        break;
                    case "exportPdf":
                        await ExportPdfAsync();
                        break;
                    case "print":
                        core.ShowPrintUI(CoreWebView2PrintDialogKind.Browser);
                        break;
                    case "openLink":
                        await OpenLinkAsync(GetString(m, "href"));
                        break;
                    case "drop":
                        await HandleDropAsync(files);
                        break;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static string GetString(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) ? v as string : null;
        }

        void Post(Dictionary<string, object> msg)
        {
            if (core != null) core.PostWebMessageAsJson(json.Serialize(msg));
        }

        void SendDocInfo(string type, string text)
        {
            Post(new Dictionary<string, object>
            {
                { "type", type },
                { "path", currentPath },
                { "name", DocName },
                { "text", text },
                { "enc", EncodingLabel(currentEncoding) },
                { "eol", useCrlf ? "CRLF" : "LF" },
                { "base", MapDocFolder() },
            });
        }

        async Task<string> GetEditorTextAsync()
        {
            string r = await core.ExecuteScriptAsync("window.getEditorText()");
            return json.Deserialize<string>(r);
        }

        // 相対パス画像の解決用ベース URL（https://doc.local/<ドライブ>/<フォルダ>/）。配信は ServeDocFile
        string MapDocFolder()
        {
            if (currentPath == null) return null;
            string dir = Path.GetDirectoryName(Path.GetFullPath(currentPath));
            if (!Regex.IsMatch(dir, @"^[a-zA-Z]:\\")) return null; // ネットワークパスは非対応
            string[] parts = dir.Split(new[] { '\\' }, StringSplitOptions.RemoveEmptyEntries);
            string url = "https://" + DocHost + "/" + dir.Substring(0, 1) + "/";
            foreach (string part in parts.Skip(1)) url += Uri.EscapeDataString(part) + "/";
            return url;
        }

        // ------------------------------------------------------------------ ファイル操作

        string ShowOpenDialog()
        {
            using (OpenFileDialog dlg = new OpenFileDialog())
            {
                dlg.Filter = FileFilter;
                if (currentPath != null) dlg.InitialDirectory = Path.GetDirectoryName(currentPath);
                return dlg.ShowDialog(this) == DialogResult.OK ? dlg.FileName : null;
            }
        }

        void OpenFile(string path)
        {
            try
            {
                path = Path.GetFullPath(path);
                long size = new FileInfo(path).Length;
                if (size > LargeFileBytes)
                {
                    DialogResult r = MessageBox.Show(this,
                        "ファイルが大きいため、開くと応答しなくなる可能性があります（" + (size / 1024 / 1024) + " MB）。\n" +
                        path + "\n\n開きますか？",
                        AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
                    if (r != DialogResult.Yes) return;
                }
                Encoding enc;
                bool crlf;
                string text = ReadText(path, out enc, out crlf);
                currentPath = path;
                currentEncoding = enc;
                useCrlf = crlf;
                dirty = false;
                SendDocInfo("load", text);
                UpdateTitle();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "ファイルを開けませんでした。\n" + path + "\n\n" + ex.Message, AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static string ReadText(string path, out Encoding enc, out bool crlf)
        {
            byte[] b = File.ReadAllBytes(path);
            string text;
            if (b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF)
            {
                enc = new UTF8Encoding(true);
                text = Encoding.UTF8.GetString(b, 3, b.Length - 3);
            }
            else if (b.Length >= 2 && b[0] == 0xFF && b[1] == 0xFE)
            {
                enc = new UnicodeEncoding(false, true);
                text = Encoding.Unicode.GetString(b, 2, b.Length - 2);
            }
            else if (b.Length >= 2 && b[0] == 0xFE && b[1] == 0xFF)
            {
                enc = new UnicodeEncoding(true, true);
                text = Encoding.BigEndianUnicode.GetString(b, 2, b.Length - 2);
            }
            else
            {
                try
                {
                    text = new UTF8Encoding(false, true).GetString(b);
                    enc = new UTF8Encoding(false);
                }
                catch (DecoderFallbackException)
                {
                    enc = Encoding.GetEncoding(932); // Shift_JIS
                    text = enc.GetString(b);
                }
            }
            crlf = text.Contains("\r\n");
            text = text.Replace("\r\n", "\n").Replace('\r', '\n');
            return text;
        }

        static string EncodingLabel(Encoding enc)
        {
            if (enc.CodePage == 932) return "Shift_JIS";
            if (enc.CodePage == 1200) return "UTF-16 LE";
            if (enc.CodePage == 1201) return "UTF-16 BE";
            return enc.GetPreamble().Length > 0 ? "UTF-8 (BOM)" : "UTF-8";
        }

        bool SaveDocument(string text, bool saveAs)
        {
            if (text == null) return false;
            string path = currentPath;
            if (saveAs || path == null)
            {
                using (SaveFileDialog dlg = new SaveFileDialog())
                {
                    dlg.Filter = FileFilter;
                    dlg.DefaultExt = "md";
                    dlg.AddExtension = true;
                    dlg.FileName = currentPath == null ? "無題.md" : Path.GetFileName(currentPath);
                    if (currentPath != null) dlg.InitialDirectory = Path.GetDirectoryName(currentPath);
                    if (dlg.ShowDialog(this) != DialogResult.OK) return false;
                    path = dlg.FileName;
                }
            }

            Encoding enc = currentEncoding;
            if (enc.CodePage != 65001 && enc.CodePage != 1200 && enc.CodePage != 1201)
            {
                // Shift_JIS で表現できない文字があれば UTF-8 への切り替えを提案
                string roundTrip = enc.GetString(enc.GetBytes(text));
                if (roundTrip != text)
                {
                    DialogResult r = MessageBox.Show(this,
                        "Shift_JIS で保存できない文字が含まれています。UTF-8 で保存しますか？\n" +
                        "（「いいえ」を選ぶと該当文字は '?' に置き換わります）",
                        AppName, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
                    if (r == DialogResult.Cancel) return false;
                    if (r == DialogResult.Yes) enc = new UTF8Encoding(false);
                }
            }

            string output = useCrlf ? text.Replace("\n", "\r\n") : text;
            try
            {
                File.WriteAllText(path, output, enc);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "保存できませんでした。\n" + path + "\n\n" + ex.Message, AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }

            currentPath = path;
            currentEncoding = enc;
            dirty = false;
            SendDocInfo("saved", text);
            UpdateTitle();
            return true;
        }

        // 未保存の変更がある場合に保存確認。続行してよければ true
        async Task<bool> ConfirmDiscardAsync(string text)
        {
            if (!dirty) return true;
            DialogResult r = MessageBox.Show(this, "\"" + DocName + "\" への変更を保存しますか？", AppName,
                MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
            if (r == DialogResult.Cancel) return false;
            if (r == DialogResult.No) return true;
            if (text == null) text = await GetEditorTextAsync();
            return SaveDocument(text, false);
        }

        string AskExportPath(string filter, string ext)
        {
            using (SaveFileDialog dlg = new SaveFileDialog())
            {
                dlg.Filter = filter;
                dlg.DefaultExt = ext;
                dlg.AddExtension = true;
                string baseName = currentPath == null ? "無題" : Path.GetFileNameWithoutExtension(currentPath);
                dlg.FileName = baseName + "." + ext;
                if (currentPath != null) dlg.InitialDirectory = Path.GetDirectoryName(currentPath);
                return dlg.ShowDialog(this) == DialogResult.OK ? dlg.FileName : null;
            }
        }

        void ExportHtml(string html)
        {
            if (html == null) return;
            string path = AskExportPath("HTML ファイル (*.html)|*.html;*.htm", "html");
            if (path == null) return;
            File.WriteAllText(path, html, new UTF8Encoding(false));
        }

        async Task ExportPdfAsync()
        {
            string path = AskExportPath("PDF ファイル (*.pdf)|*.pdf", "pdf");
            if (path == null) return;
            CoreWebView2PrintSettings ps = env.CreatePrintSettings();
            ps.ShouldPrintBackgrounds = true;
            ps.ShouldPrintHeaderAndFooter = false;
            bool ok = await core.PrintToPdfAsync(path, ps);
            if (!ok)
            {
                MessageBox.Show(this, "PDF の出力に失敗しました。", AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ------------------------------------------------------------------ リンク・ドロップ

        static bool IsWebUrl(string url)
        {
            return Regex.IsMatch(url ?? "", @"^(https?:|mailto:)", RegexOptions.IgnoreCase);
        }

        void OpenExternalUrl(string url)
        {
            if (!IsWebUrl(url) || url.StartsWith("https://" + DocHost, StringComparison.OrdinalIgnoreCase)) return;
            try { Process.Start(url); } catch { }
        }

        async Task OpenLinkAsync(string href)
        {
            if (string.IsNullOrEmpty(href)) return;
            if (IsWebUrl(href))
            {
                OpenExternalUrl(href);
                return;
            }
            if (Regex.IsMatch(href, @"^[a-z][a-z0-9+.\-]*:", RegexOptions.IgnoreCase) && !Regex.IsMatch(href, @"^[a-z]:[\\/]", RegexOptions.IgnoreCase))
                return; // その他のスキームは無視

            // 文書からの相対パス（フラグメント・クエリは除去）
            string rel = href;
            int cut = rel.IndexOfAny(new[] { '#', '?' });
            if (cut >= 0) rel = rel.Substring(0, cut);
            if (rel.Length == 0) return;
            rel = Uri.UnescapeDataString(rel).Replace('/', '\\');

            string full;
            if (Path.IsPathRooted(rel) && Regex.IsMatch(rel, @"^[a-z]:\\", RegexOptions.IgnoreCase))
                full = rel;
            else if (currentPath != null)
                full = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(currentPath), rel.TrimStart('\\')));
            else
            {
                MessageBox.Show(this, "相対リンクを開くには、先に文書を保存してください。", AppName);
                return;
            }

            if (File.Exists(full))
            {
                if (MarkdownExts.Contains(Path.GetExtension(full).ToLowerInvariant()))
                {
                    if (await ConfirmDiscardAsync(null)) OpenFile(full);
                }
                else
                {
                    // 任意ファイルの実行は避け、エクスプローラーで場所を表示する
                    Process.Start("explorer.exe", "/select,\"" + full + "\"");
                }
            }
            else if (Directory.Exists(full))
            {
                Process.Start("explorer.exe", "\"" + full + "\"");
            }
            else
            {
                MessageBox.Show(this, "リンク先が見つかりません。\n" + full, AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        async Task HandleDropAsync(List<string> files)
        {
            if (files.Count == 0) return;
            List<string> images = files.Where(f => ImageExts.Contains(Path.GetExtension(f).ToLowerInvariant())).ToList();
            if (images.Count > 0)
            {
                // 画像はリンクとして挿入
                StringBuilder sb = new StringBuilder();
                foreach (string img in images)
                {
                    sb.Append("![").Append(Path.GetFileNameWithoutExtension(img)).Append("](")
                      .Append(ToMarkdownPath(img)).Append(")\n");
                }
                Post(new Dictionary<string, object> { { "type", "insert" }, { "text", sb.ToString() } });
                return;
            }
            if (await ConfirmDiscardAsync(null)) OpenFile(files[0]);
        }

        string ToMarkdownPath(string file)
        {
            string p = file;
            if (currentPath != null)
            {
                string dir = Path.GetDirectoryName(currentPath);
                if (!dir.EndsWith("\\")) dir += "\\";
                Uri baseUri = new Uri(dir);
                Uri target = new Uri(file);
                if (baseUri.IsBaseOf(target) || string.Equals(Path.GetPathRoot(dir), Path.GetPathRoot(file), StringComparison.OrdinalIgnoreCase))
                {
                    p = Uri.UnescapeDataString(baseUri.MakeRelativeUri(target).ToString());
                }
            }
            return p.Replace('\\', '/').Replace(" ", "%20").Replace("(", "%28").Replace(")", "%29");
        }

        // ------------------------------------------------------------------ ウィンドウ

        void UpdateTitle()
        {
            Text = (dirty ? "● " : "") + DocName + " - " + AppName;
        }

        void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (closeConfirmed || !dirty || core == null)
            {
                SaveWindowState();
                return;
            }
            e.Cancel = true;
            BeginInvoke(new Action(async () =>
            {
                try
                {
                    if (await ConfirmDiscardAsync(null))
                    {
                        closeConfirmed = true;
                        Close();
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }));
        }

        string WindowStateFile
        {
            get { return Path.Combine(AppDataDir, "window.txt"); }
        }

        void RestoreWindowState()
        {
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            Bounds = new Rectangle(wa.X + wa.Width / 8, wa.Y + wa.Height / 8, wa.Width * 3 / 4, wa.Height * 3 / 4);
            try
            {
                if (!File.Exists(WindowStateFile)) return;
                int[] v = File.ReadAllText(WindowStateFile).Split(',').Select(int.Parse).ToArray();
                Rectangle r = new Rectangle(v[0], v[1], v[2], v[3]);
                if (r.Width < 300 || r.Height < 200) return;
                if (!Screen.AllScreens.Any(sc => sc.WorkingArea.IntersectsWith(r))) return;
                Bounds = r;
                if (v.Length > 4 && v[4] == 1) WindowState = FormWindowState.Maximized;
            }
            catch { }
        }

        void SaveWindowState()
        {
            try
            {
                Rectangle r = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                Directory.CreateDirectory(AppDataDir);
                File.WriteAllText(WindowStateFile, string.Join(",", new[]
                {
                    r.X, r.Y, r.Width, r.Height, WindowState == FormWindowState.Maximized ? 1 : 0
                }));
            }
            catch { }
        }
    }
}
