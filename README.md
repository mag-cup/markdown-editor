# Markdown Editor

Windows 用の単体 exe で動く Markdown エディタ。インストール不要で、`MarkdownEditor.exe` を 1 つ置くだけで動作します。

## 動作要件

- Windows 10 / 11（x64）
- .NET Framework 4.8（Windows 10 1903 以降・Windows 11 に標準搭載）
- Microsoft Edge WebView2 ランタイム（Windows 11 は標準搭載。Windows 10 でも Edge と一緒に入っていることがほとんど）

## 機能

- エディタ／分割／プレビューの表示切替（Ctrl+1 / 2 / 3）、分割幅のドラッグ調整
- リアルタイムプレビュー（GFM: 表・タスクリスト・取り消し線など）、スクロール同期
- 相対パスの画像の表示、プレビュー内リンク（外部リンクはブラウザで開き、.md へのリンクはエディタで開く）
- ファイル操作：新規 / 開く / 保存 / 別名保存、ドラッグ＆ドロップで開く、コマンドライン引数で開く
- 文字コード：UTF-8（BOM の有無）、UTF-16、Shift_JIS を自動判別し、元の文字コードと改行コード（CRLF/LF）を維持して保存
- 書式ボタンとショートカット：太字 Ctrl+B、斜体 Ctrl+I、取り消し線 Ctrl+Shift+X、リンク Ctrl+K、コード Ctrl+`
- リスト・引用の Enter 自動継続、Tab / Shift+Tab でインデント
- 検索・置換（Ctrl+F / Ctrl+H、F3）
- 画像ファイルをドロップすると Markdown の画像リンクを挿入
- HTML 出力・PDF 出力・印刷（Ctrl+P）
- ライト／ダークテーマ、文字サイズ変更（Ctrl+ホイール、Ctrl+ +/-/0）
- 未保存の変更があるときは終了時に確認

## ビルド

追加ツールは不要です（Windows 標準搭載の `csc.exe` を使用）。

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

`dist\MarkdownEditor.exe` が出力されます。

## 構成

| パス | 内容 |
| --- | --- |
| `src/Program.cs` | エントリポイント。埋め込み DLL を展開して読み込む |
| `src/MainForm.cs` | WebView2 ホスト。ファイル I/O、ダイアログ、JS との通信 |
| `web/` | エディタ UI（HTML/CSS/JS）。exe にリソースとして埋め込み |
| `web/lib/` | marked（Markdown パーサ）、DOMPurify（HTML 無害化） |
| `lib/` | WebView2 SDK の DLL（exe に埋め込み） |
| `tools/make-icon.ps1` | アプリアイコンを生成 |

実行時は、埋め込んだ WebView2 の DLL と WebView2 のキャッシュを `%LOCALAPPDATA%\MarkdownEditor\` に展開・保存します。

## ライセンス

- marked: MIT
- DOMPurify: Apache-2.0 / MPL-2.0
- Microsoft.Web.WebView2: `lib/WebView2-LICENSE.txt` を参照
