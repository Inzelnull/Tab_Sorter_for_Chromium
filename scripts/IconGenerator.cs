using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

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

            // 1. 白基調のカード背景 (角丸・繊細なボーダー・軽いシャドウ)
            float bgMargin = 6.0f * s;
            float bgSize = 116.0f * s;
            float bgRadius = 24.0f * s;

            // わずかなドロップシャドウ (32px以上)
            if (size >= 32)
            {
                using (GraphicsPath shadowPath = CreateRoundedRectangle(bgMargin, bgMargin + 2.5f * s, bgSize, bgSize, bgRadius))
                using (Brush shadowBrush = new SolidBrush(Color.FromArgb(24, 0, 0, 0)))
                {
                    g.FillPath(shadowBrush, shadowPath);
                }
            }

            // 白基調カード本体
            using (GraphicsPath bgPath = CreateRoundedRectangle(bgMargin, bgMargin, bgSize, bgSize, bgRadius))
            using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                new PointF(0, bgMargin),
                new PointF(0, bgMargin + bgSize),
                Color.FromArgb(255, 255, 255, 255),
                Color.FromArgb(255, 248, 250, 252)))
            {
                g.FillPath(bgBrush, bgPath);

                // 外周ボーダー (Slate-300: ツールバーが暗くても明るくてもクリアに分離)
                float borderW = (size <= 16) ? 1.0f : Math.Max(1.0f, 1.8f * s);
                using (Pen borderPen = new Pen(Color.FromArgb(255, 203, 213, 225), borderW))
                {
                    g.DrawPath(borderPen, bgPath);
                }
            }

            // 2. 上タブ (Tab 1: 洗練されたロイヤルインディゴ)
            float tab1X = 15.0f * s;
            float tab1Y = 24.0f * s;
            float tabW = 46.0f * s;
            float tabH = 34.0f * s;
            float tabR = 7.0f * s;
            using (GraphicsPath tab1Path = CreateRoundedRectangle(tab1X, tab1Y, tabW, tabH, tabR))
            using (LinearGradientBrush tab1Brush = new LinearGradientBrush(
                new PointF(tab1X, tab1Y),
                new PointF(tab1X + tabW, tab1Y + tabH),
                Color.FromArgb(255, 99, 102, 241), // Indigo-500
                Color.FromArgb(255, 67, 56, 202)))  // Indigo-700
            {
                g.FillPath(tab1Brush, tab1Path);
            }

            if (size >= 32)
            {
                using (Brush dotBrush = new SolidBrush(Color.FromArgb(255, 224, 231, 255)))
                {
                    g.FillEllipse(dotBrush, tab1X + 8.0f * s, tab1Y + 12.0f * s, 10.0f * s, 10.0f * s);
                }
                using (GraphicsPath bar1Path = CreateRoundedRectangle(tab1X + 22.0f * s, tab1Y + 14.0f * s, 16.0f * s, 6.0f * s, 3.0f * s))
                using (Brush barBrush = new SolidBrush(Color.FromArgb(240, 255, 255, 255)))
                {
                    g.FillPath(barBrush, bar1Path);
                }
            }

            // 3. 下タブ (Tab 2: 爽やかなディープシアン/スカイブルー)
            float tab2X = 15.0f * s;
            float tab2Y = 70.0f * s;
            using (GraphicsPath tab2Path = CreateRoundedRectangle(tab2X, tab2Y, tabW, tabH, tabR))
            using (LinearGradientBrush tab2Brush = new LinearGradientBrush(
                new PointF(tab2X, tab2Y),
                new PointF(tab2X + tabW, tab2Y + tabH),
                Color.FromArgb(255, 14, 165, 233), // Sky-500
                Color.FromArgb(255, 3, 105, 161)))  // Sky-700
            {
                g.FillPath(tab2Brush, tab2Path);
            }

            if (size >= 32)
            {
                using (Brush dotBrush2 = new SolidBrush(Color.FromArgb(255, 224, 242, 254)))
                {
                    g.FillEllipse(dotBrush2, tab2X + 8.0f * s, tab2Y + 12.0f * s, 10.0f * s, 10.0f * s);
                }
                using (GraphicsPath bar2Path = CreateRoundedRectangle(tab2X + 22.0f * s, tab2Y + 14.0f * s, 16.0f * s, 6.0f * s, 3.0f * s))
                using (Brush barBrush2 = new SolidBrush(Color.FromArgb(240, 255, 255, 255)))
                {
                    g.FillPath(barBrush2, bar2Path);
                }
            }

            // 4. 強調されたダイナミックスワップ（位置入れ替え）矢印
            // 矢印A (昇順): エメラルドグリーン (#10B981) - 右下から立ち上がり左上へ向かう
            // 矢印B (降順): アンバーオレンジ (#EA580C) - 左上から降りて右下へ向かう
            Color colorUp = Color.FromArgb(255, 16, 185, 129);   // Emerald-500
            Color colorDown = Color.FromArgb(255, 234, 88, 12);  // Orange-600

            float stemW = (size <= 16) ? 1.8f :
                          (size <= 32) ? 2.8f :
                          (size <= 48) ? 3.8f : 7.0f * s;

            float headHalfW = (size <= 16) ? 2.8f :
                              (size <= 32) ? 4.5f :
                              (size <= 48) ? 6.2f : 9.5f * s;

            float headH     = (size <= 16) ? 3.5f :
                              (size <= 32) ? 5.5f :
                              (size <= 48) ? 7.5f : 12.0f * s;

            // (A) 昇順スワップ矢印 (緑: 上向き)
            float upStemX = 77.0f * s;
            float upHeadBaseY = 37.0f * s;
            float upPeakY = upHeadBaseY - headH;

            using (Pen penUp = new Pen(colorUp, stemW))
            {
                penUp.StartCap = LineCap.Round;
                penUp.EndCap = LineCap.Flat;
                penUp.LineJoin = LineJoin.Round;

                PointF pStart = new PointF(98.0f * s, 86.0f * s);
                PointF pCtrl1 = new PointF(86.0f * s, 86.0f * s);
                PointF pCtrl2 = new PointF(upStemX, 68.0f * s);
                PointF pEnd   = new PointF(upStemX, upHeadBaseY + 1.0f * s);

                g.DrawBezier(penUp, pStart, pCtrl1, pCtrl2, pEnd);
            }

            // 緑の矢尻
            using (Brush brushUp = new SolidBrush(colorUp))
            {
                PointF[] ptsUp = new PointF[] {
                    new PointF(upStemX, upPeakY),
                    new PointF(upStemX - headHalfW, upHeadBaseY),
                    new PointF(upStemX + headHalfW, upHeadBaseY)
                };
                g.FillPolygon(brushUp, ptsUp);
            }

            // (B) 降順スワップ矢印 (オレンジ: 下向き)
            float downStemX = 104.0f * s;
            float downHeadBaseY = 91.0f * s;
            float downPeakY = downHeadBaseY + headH;

            using (Pen penDown = new Pen(colorDown, stemW))
            {
                penDown.StartCap = LineCap.Round;
                penDown.EndCap = LineCap.Flat;
                penDown.LineJoin = LineJoin.Round;

                PointF pStart2 = new PointF(83.0f * s, 42.0f * s);
                PointF pCtrl21 = new PointF(95.0f * s, 42.0f * s);
                PointF pCtrl22 = new PointF(downStemX, 60.0f * s);
                PointF pEnd2   = new PointF(downStemX, downHeadBaseY - 1.0f * s);

                g.DrawBezier(penDown, pStart2, pCtrl21, pCtrl22, pEnd2);
            }

            // オレンジの矢尻
            using (Brush brushDown = new SolidBrush(colorDown))
            {
                PointF[] ptsDown = new PointF[] {
                    new PointF(downStemX, downPeakY),
                    new PointF(downStemX - headHalfW, downHeadBaseY),
                    new PointF(downStemX + headHalfW, downHeadBaseY)
                };
                g.FillPolygon(brushDown, ptsDown);
            }

            bmp.Save(outputPath, ImageFormat.Png);
        }
    }
}
