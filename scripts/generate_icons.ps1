Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public class IconGenerator
{
    private static GraphicsPath CreateRoundedRectangle(float x, float y, float width, float height, float radius)
    {
        GraphicsPath path = new GraphicsPath();
        float d = radius * 2;
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + width - d, y, d, d, 270, 90);
        path.AddArc(x + width - d, y + height - d, d, d, 0, 90);
        path.AddArc(x, y + height - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    public static void Generate(int size, string outputPath)
    {
        using (Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);

            float s = size / 128.0f;

            // 背景コンテナ (角丸ダークインディゴ)
            float bgMargin = 6.0f * s;
            float bgSize = 116.0f * s;
            float bgRadius = 24.0f * s;
            using (GraphicsPath bgPath = CreateRoundedRectangle(bgMargin, bgMargin, bgSize, bgSize, bgRadius))
            using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                new PointF(0, 0),
                new PointF(size, size),
                Color.FromArgb(255, 30, 27, 75),  // Indigo-950
                Color.FromArgb(255, 15, 23, 42))) // Slate-900
            {
                g.FillPath(bgBrush, bgPath);
                using (Pen borderPen = new Pen(Color.FromArgb(90, 99, 102, 241), Math.Max(1.0f, 2.0f * s)))
                {
                    g.DrawPath(borderPen, bgPath);
                }
            }

            // 上タブ (Tab 1)
            float tab1X = 16.0f * s;
            float tab1Y = 22.0f * s;
            float tabW = 56.0f * s;
            float tabH = 34.0f * s;
            float tabR = 7.0f * s;
            using (GraphicsPath tab1Path = CreateRoundedRectangle(tab1X, tab1Y, tabW, tabH, tabR))
            using (LinearGradientBrush tab1Brush = new LinearGradientBrush(
                new PointF(tab1X, tab1Y),
                new PointF(tab1X + tabW, tab1Y + tabH),
                Color.FromArgb(255, 99, 102, 241), // Indigo-500
                Color.FromArgb(255, 79, 70, 229))) // Indigo-600
            {
                g.FillPath(tab1Brush, tab1Path);
            }

            // 上タブ内テキストバーとファビコン
            using (Brush dotBrush = new SolidBrush(Color.FromArgb(255, 199, 210, 254)))
            {
                g.FillEllipse(dotBrush, tab1X + 8.0f * s, tab1Y + 12.0f * s, 10.0f * s, 10.0f * s);
            }
            using (GraphicsPath bar1Path = CreateRoundedRectangle(tab1X + 22.0f * s, tab1Y + 14.0f * s, 24.0f * s, 6.0f * s, 3.0f * s))
            using (Brush barBrush = new SolidBrush(Color.FromArgb(230, 255, 255, 255)))
            {
                g.FillPath(barBrush, bar1Path);
            }

            // 下タブ (Tab 2)
            float tab2X = 16.0f * s;
            float tab2Y = 72.0f * s;
            using (GraphicsPath tab2Path = CreateRoundedRectangle(tab2X, tab2Y, tabW, tabH, tabR))
            using (LinearGradientBrush tab2Brush = new LinearGradientBrush(
                new PointF(tab2X, tab2Y),
                new PointF(tab2X + tabW, tab2Y + tabH),
                Color.FromArgb(255, 56, 189, 248), // Sky-400
                Color.FromArgb(255, 14, 165, 233))) // Sky-500
            {
                g.FillPath(tab2Brush, tab2Path);
            }

            // 下タブ内テキストバーとファビコン
            using (Brush dotBrush2 = new SolidBrush(Color.FromArgb(255, 186, 230, 253)))
            {
                g.FillEllipse(dotBrush2, tab2X + 8.0f * s, tab2Y + 12.0f * s, 10.0f * s, 10.0f * s);
            }
            using (GraphicsPath bar2Path = CreateRoundedRectangle(tab2X + 22.0f * s, tab2Y + 14.0f * s, 24.0f * s, 6.0f * s, 3.0f * s))
            using (Brush barBrush2 = new SolidBrush(Color.FromArgb(230, 255, 255, 255)))
            {
                g.FillPath(barBrush2, bar2Path);
            }

            // ソート・入れ替え矢印 (右側)
            float penWidth = Math.Max(2.0f, 6.5f * s);
            float headSize = 8.5f * s;

            // 1. 上向き矢印 (エメラルドグリーン)
            float arrow1X = 87.0f * s;
            float arrow1Top = 26.0f * s;
            float arrow1Bottom = 68.0f * s;
            using (Pen arrow1Pen = new Pen(Color.FromArgb(255, 52, 211, 153), penWidth))
            {
                arrow1Pen.StartCap = LineCap.Round;
                arrow1Pen.EndCap = LineCap.Round;
                arrow1Pen.LineJoin = LineJoin.Round;

                // 縦の軸
                g.DrawLine(arrow1Pen, arrow1X, arrow1Bottom, arrow1X, arrow1Top);
                // 矢じり
                g.DrawLine(arrow1Pen, arrow1X, arrow1Top, arrow1X - headSize, arrow1Top + headSize);
                g.DrawLine(arrow1Pen, arrow1X, arrow1Top, arrow1X + headSize, arrow1Top + headSize);
            }

            // 2. 下向き矢印 (アンバーオレンジ)
            float arrow2X = 107.0f * s;
            float arrow2Top = 60.0f * s;
            float arrow2Bottom = 102.0f * s;
            using (Pen arrow2Pen = new Pen(Color.FromArgb(255, 251, 191, 36), penWidth))
            {
                arrow2Pen.StartCap = LineCap.Round;
                arrow2Pen.EndCap = LineCap.Round;
                arrow2Pen.LineJoin = LineJoin.Round;

                // 縦の軸
                g.DrawLine(arrow2Pen, arrow2X, arrow2Top, arrow2X, arrow2Bottom);
                // 矢じり
                g.DrawLine(arrow2Pen, arrow2X, arrow2Bottom, arrow2X - headSize, arrow2Bottom - headSize);
                g.DrawLine(arrow2Pen, arrow2X, arrow2Bottom, arrow2X + headSize, arrow2Bottom - headSize);
            }

            bmp.Save(outputPath, ImageFormat.Png);
        }
    }
}
"@

$sizes = @(16, 32, 48, 128)
$iconsDir = "d:\My Documents\Antigravity\Tab_Sorter\icons"

foreach ($size in $sizes) {
    $outPath = Join-Path $iconsDir "icon$size.png"
    [IconGenerator]::Generate($size, $outPath)
    Write-Output "Successfully generated: $outPath ($size x $size)"
}
