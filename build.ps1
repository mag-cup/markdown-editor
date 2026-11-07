# Markdown Editor ビルドスクリプト
# Windows 標準搭載の C# コンパイラ (.NET Framework 4.x) を使うため、追加インストールは不要。
# 使い方: powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe が見つかりません: $csc" }

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$icon = Join-Path $root 'src\app.ico'
if (-not (Test-Path $icon)) { & (Join-Path $root 'tools\make-icon.ps1') -Out $icon }

# 埋め込みリソース: WebView2 の DLL と web/ 以下のファイル
$resources = @()
foreach ($dll in 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll') {
    $resources += "/resource:$(Join-Path $root "lib\$dll"),lib/$dll"
}
$webDir = Join-Path $root 'web'
Get-ChildItem $webDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($webDir.Length + 1).Replace('\', '/')
    $resources += "/resource:$($_.FullName),web/$rel"
}

$out = Join-Path $dist 'MarkdownEditor.exe'
$cscArgs = @(
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output', '/codepage:65001',
    "/out:$out",
    "/win32icon:$icon",
    "/win32manifest:$(Join-Path $root 'src\app.manifest')",
    '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
    '/r:System.Web.Extensions.dll',
    "/r:$(Join-Path $root 'lib\Microsoft.Web.WebView2.Core.dll')",
    "/r:$(Join-Path $root 'lib\Microsoft.Web.WebView2.WinForms.dll')"
) + $resources + @("$(Join-Path $root 'src\*.cs')")

& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw "ビルド失敗 (exit $LASTEXITCODE)" }
$size = [Math]::Round((Get-Item $out).Length / 1KB)
Write-Host "ビルド成功: $out ($size KB)"

