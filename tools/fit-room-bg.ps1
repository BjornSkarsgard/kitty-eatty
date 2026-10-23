# Фон участка комнаты (2:3 из генератора) → экран 720×1280 JPG, без обрезки по бокам (дверные косяки остаются):
#   powershell -File tools/fit-room-bg.ps1 art-src/bg_room_home_raw.png src/assets/bg_room_home.jpg
# Картинка масштабируется по ширине (720), встаёт сверху; недостающий низ — продолжение пола:
# нижняя полоска картинки растягивается вниз (там кнопка и вкладки, пол у самой камеры).
# Координаты на картинке → на экране: умножить на 720 / ширина исходника (для 1024×1536 — 0.703).
param([string]$Src, [string]$Out, [int]$Strip = 90)
Add-Type -AssemblyName System.Drawing
$W = 720; $H = 1280
$img = [System.Drawing.Image]::FromFile((Resolve-Path $Src))
$k = $W / $img.Width
$h = [int]($img.Height * $k)
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
if ($h -lt $H) {
  # продолжение пола: нижние $Strip пикселей исходника растянуты на всё, что ниже картинки (с захлёстом, без шва)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, ($h - 20), $W, ($H - $h + 20)),
    (New-Object System.Drawing.Rectangle 0, ($img.Height - $Strip), $img.Width, $Strip), [System.Drawing.GraphicsUnit]::Pixel)
}
$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $W, $h), (New-Object System.Drawing.Rectangle 0, 0, $img.Width, $img.Height), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose(); $img.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 85L
$bmp.Save((Join-Path (Get-Location) $Out), $enc, $p)
$bmp.Dispose()
"$Out  масштаб $([math]::Round($k, 3)), картинка до y=$h"
