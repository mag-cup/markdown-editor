# CLAUDE.md

Windows 用の単体 exe の Markdown エディタ。C# (.NET Framework 4.8 / WinForms) が WebView2 をホストし、UI はすべて `web/` の HTML/CSS/JS で作る。利用者側にもビルド側にも、追加のインストールを求めないことが前提。

## ビルド・実行

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1   # → dist\MarkdownEditor.exe
dist\MarkdownEditor.exe path\to\file.md
```

- テストフレームワークはない。確認はビルドして起動し、目で見て行う。
- DevTools は既定で無効。環境変数 `MDEDIT_DEVTOOLS=1` を付けて起動すると有効になる。
- `web/` を変更した場合も再ビルドが必要（exe に埋め込んでいるため）。

## 守るべき制約

- **C# は C# 5 まで**：コンパイラは Windows 標準の `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`。文字列補間 `$""`、`?.`、`nameof`、式形式メンバー `=>`、`out var`、タプルなどは使えない。
- **NuGet / dotnet SDK は使わない**：外部依存は `lib/`（WebView2 の DLL）と `web/lib/`（marked, DOMPurify）に実ファイルで置いている。
- **`.ps1` は BOM 付き UTF-8 で保存する**：PowerShell 5.1 は BOM なしだと ANSI として読み、日本語が化ける。また `$args` は自動変数なので変数名に使わない。
- **x64 専用**（`/platform:x64`、同梱する `WebView2Loader.dll` も x64 用）。
- WebView2 SDK を更新したら、`src/Program.cs` の `WebView2SdkVersion` も合わせて変える（DLL の展開先フォルダ名に使っている）。

## 構成

- `src/Program.cs`：埋め込み DLL を `%LOCALAPPDATA%\MarkdownEditor\lib\<ver>\` に展開し、`AssemblyResolve` で読み込む。WebView2 の型を参照するコードは、`[NoInlining]` の `Run()` より後で初めて JIT されるようにしている。
- `src/MainForm.cs`：ファイル入出力、ダイアログ、文字コード判別と保存、ウィンドウ位置の保存、JS との通信。
- `web/app.js`：エディタ本体（textarea）、描画、スクロール同期、検索・置換、ショートカット。
- `build.ps1`：`lib/*.dll` をリソース名 `lib/<名前>` で、`web/**` を `web/<相対パス>` で埋め込む。

### 配信の仕組み

- `https://app.local/*`：`WebResourceRequested` で埋め込みリソースから配信する。`index.html` には CSP（`script-src 'self'`）を付けているので、インラインスクリプトは書けない。
- `https://doc.local/<ドライブ>/<パス>`：文書と同じフォルダにある画像などを配信する（`ServeDocFile`）。配信するのは image/video/audio の MIME の拡張子だけで、範囲は文書フォルダの 1 つ上のフォルダ配下に限る（`DocServeRoot`）。`SetVirtualHostNameToFolderMapping` はドライブルートを指定すると動かなかったので使っていない。
- 外部 URL の画像・動画・style の `url()` は、プレビューで既定でブロックする（`app.js` の `blockRemoteResources`）。上部のバーの「表示する」で、その文書に限って許可する。CSP の `img-src *` は、この許可のために残している。
- `WebMessageReceived` は、送信元が `app.local` でないメッセージを捨てる。
- `app.local` 以外へのページ遷移はキャンセルし、http/https/mailto は既定のブラウザで開く。

### JS ↔ C# のメッセージ（`{type, ...}` 形式の JSON）

- JS → C#：`ready`, `dirty{value}`, `new{text}`, `open{text}`, `save{text}`, `saveAs{text}`, `exportHtml{html}`, `exportPdf`, `print`, `openLink{href}`, `drop`（ファイルは `postMessageWithAdditionalObjects` で渡す）
- C# → JS：`load` / `saved`（`{path,name,text,enc,eol,base}`）、`insert{text}`
- C# から現在のテキストが必要なとき（閉じる前の保存確認など）は `ExecuteScriptAsync("window.getEditorText()")` で取る。
- C# 側の `WebMessageReceived` は `BeginInvoke` で処理を後回しにしている（イベントハンドラの中でモーダルダイアログを出さないため）。

## 実装上の注意

- 改行コードは JS 側では常に `\n`。CRLF/LF への変換と文字コードの扱いは C# 側が持つ（読み込みで正規化し、保存時に元へ戻す）。
- Markdown の方言（デフォルト / GitHub / Qiita）は `app.js` の `createMarked()` で、方言ごとに `marked.Marked` のインスタンスを作って切り替える（設定は `settings.dialect`）。独自のブロック要素を足したら、スクロール同期のために `BLOCK_TYPES` にも加える。絵文字の辞書は `web/emoji.js`。
- プレビューは必ず DOMPurify を通す（`SANITIZE_NAMED_PROPS`）。見出しの id には `md-` を付けて、アプリ UI の id と衝突しないようにしている。HTML 出力では接頭辞なし。
- `AreBrowserAcceleratorKeysEnabled = false` にしているので、F5 / Ctrl+F / Ctrl+P などはブラウザ側で処理されない。必要なキーは `app.js` の keydown で自前で実装する。
- エディタへの挿入は `document.execCommand('insertText')` を使う（Ctrl+Z で取り消せるようにするため）。キー処理では IME 変換中（`isComposing` / keyCode 229）を必ず除外する。
- `#mirror`（位置計測用）と `#backdrop`（検索ハイライト用）は textarea と同じフォント・パディング・折り返し設定でなければならない。`style.css` を変えるときは 3 つを一緒に変える。
- ブラウザの拡大縮小は無効にしてある。文字サイズは CSS 変数 `--font-size` で変える。
- 設定は `localStorage` の `mdedit.settings`、ウィンドウ位置は `%LOCALAPPDATA%\MarkdownEditor\window.txt` に保存する。
