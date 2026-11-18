// 가격·기간 측정: 두 점 사이 등락(원·%)과 기간
import type { DrawingTool } from "../types";

/** 날짜·가격 범위: 빠른 측정(Shift + 클릭)과 같은 모양으로 남기는 드로잉 */
export const priceRange: DrawingTool = {
  id: "price-range",
  label: "가격·기간 측정",
  group: "measure",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing, view) {
    quickMeasure.draw(ctx, px, drawing, view);
  },
};

/** 빠른 측정 (Shift + 클릭): 저장하지 않고 화면에만. 반투명 상자 + 가로·세로 화살표 + 등락 · 봉 수 · 기간 */
export const quickMeasure: DrawingTool = {
  id: "quick-measure",
  label: "빠른 측정",
  group: "hidden",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing, view) {
    if (px.length < 2) return;
    const [a, b] = px;
    const from = Number(drawing.points[0].price);
    const to = Number(drawing.points[1].price);
    const diff = to - from;
    const rate = from ? (diff / from) * 100 : 0;
    const up = diff >= 0;
    const color = up ? "#089981" : "#f23645";
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.fillStyle = up ? "rgba(8,153,129,0.2)" : "rgba(242,54,69,0.2)";
    ctx.fillRect(x, y, w, h);

    const arrow = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 8) return;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2 - 7 * Math.cos(ang - 0.5), y2 - 7 * Math.sin(ang - 0.5));
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - 7 * Math.cos(ang + 0.5), y2 - 7 * Math.sin(ang + 0.5));
      ctx.stroke();
    };
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    arrow(mx, a.y, mx, b.y);
    arrow(a.x, my, b.x, my);

    const t1 = drawing.points[0].time;
    const t2 = drawing.points[1].time;
    const [lo, hi] = t1 <= t2 ? [t1, t2] : [t2, t1];
    const bars = Math.max(0, view.bars.filter((bar) => bar.time > lo && bar.time <= hi).length);
    const s = hi - lo;
    const span = s >= 86400 ? `${Math.round(s / 86400)}일` : s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분` : `${Math.round(s / 60)}분`;
    const sign = up ? "+" : "−";
    const line1 = `${sign}${Math.abs(Math.round(diff)).toLocaleString("ko-KR")} (${sign}${Math.abs(rate).toFixed(2)}%)`;
    const line2 = `${bars}봉 · ${span}`;
    ctx.font = "600 12.5px Pretendard, sans-serif";
    const tw = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 24;
    const th = 44;
    const lx = Math.min(Math.max(mx - tw / 2, 4), view.width - tw - 4);
    const below = b.y >= a.y;
    let ly = below ? Math.max(a.y, b.y) + 10 : y - th - 10;
    if (ly < 4) ly = Math.max(a.y, b.y) + 10;
    if (ly + th > view.height - 4) ly = y - th - 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(lx, ly, tw, th, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(line1, lx + tw / 2, ly + 14);
    ctx.fillText(line2, lx + tw / 2, ly + 31);
    ctx.textAlign = "left";
  },
};
