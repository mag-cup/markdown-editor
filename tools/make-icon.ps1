# アプリアイコン (app.ico) を生成する。PNG 圧縮のマルチサイズ ICO を出力。
param([string]$Out = (Join-Path $PSScriptRoot '..\src\app.ico'))

Add-Type -AssemblyName System.Drawing
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = @()

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Transparent)

    # 角丸の背景
    $r = [Math]::Max(2, [int]($s * 0.18))
    $m = [Math]::Max(0, [int]($s * 0.04))
    $w = $s - 2 * $m
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($m, $m, 2 * $r, 2 * $r, 180, 90)
    $path.AddArc($m + $w - 2 * $r, $m, 2 * $r, 2 * $r, 270, 90)
    $path.AddArc($m + $w - 2 * $r, $m + $w - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $path.AddArc($m, $m + $w - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $path.CloseFigure()
    $rect = New-Object System.Drawing.RectangleF 0, 0, $s, $s
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, `
        ([System.Drawing.Color]::FromArgb(255, 33, 136, 255)), `
        ([System.Drawing.Color]::FromArgb(255, 9, 80, 190)), 45.0
    $g.FillPath($brush, $path)

    # "M↓" マーク
    $white = [System.Drawing.Brushes]::White
    $fontSize = [single]($s * 0.50)
    $font = New-Object System.Drawing.Font 'Segoe UI', $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'
    $fmt.LineAlignment = 'Center'
    $textRect = New-Object System.Drawing.RectangleF ([single](-$s * 0.12)), ([single]0), ([single]$s), ([single]$s)
    $g.DrawString('M', $font, $white, $textRect, $fmt)

    # 下向き矢印
    $ax = $s * 0.74; $aw = $s * 0.13; $top = $s * 0.30; $bottom = $s * 0.70
    $g.FillRectangle($white, [single]($ax - $aw / 2), [single]$top, [single]$aw, [single]($bottom - $top - $s * 0.08))
    $tri = @(
        (New-Object System.Drawing.PointF ([single]($ax - $s * 0.16)), ([single]($bottom - $s * 0.14))),
        (New-Object System.Drawing.PointF ([single]($ax + $s * 0.16)), ([single]($bottom - $s * 0.14))),
        (New-Object System.Drawing.PointF ([single]$ax), ([single]($bottom + $s * 0.04)))
    )
    $g.FillPolygon($white, $tri)

    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngs += , $ms.ToArray()
}

# ICO 形式で書き出し
$ico = New-Object System.IO.MemoryStream
$bw = [System.IO.BinaryWriter]::new($ico)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $b = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$b); $bw.Write([byte]$b); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Flush()
[System.IO.File]::WriteAllBytes([System.IO.Path]::GetFullPath($Out), $ico.ToArray())
$bw.Close()
Write-Host "icon: $Out"
