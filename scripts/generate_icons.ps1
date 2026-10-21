# Tab Sorter for Chromium - アイコン自動生成スクリプト
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$csPath = Join-Path $scriptDir "IconGenerator.cs"
$iconsDir = Join-Path $scriptDir "..\icons"

Add-Type -Path $csPath -ReferencedAssemblies System.Drawing

$sizes = @(16, 32, 48, 128)
foreach ($size in $sizes) {
    $outPath = Join-Path $iconsDir "icon$size.png"
    [IconGenerator]::Generate($size, $outPath)
    Write-Output "アイコン生成完了: $outPath ($size x $size)"
}
