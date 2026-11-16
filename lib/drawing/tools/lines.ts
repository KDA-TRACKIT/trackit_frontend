// 라인·채널·피치포크
import type { DrawingTool, PixelPoint } from "../types";
import { FILL, barsBetween, changeText, dots, extendTo, fillPoly, label, line, spanText, stroke } from "./draw-utils";

export const infoLine: DrawingTool = {
  id: "info-line",
  label: "정보선",
  group: "line",
  section: "라인",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    if (px[1]) {
      line(ctx, px[0], px[1]);
      const [a, b] = d.points;
      const angle = (Math.atan2(px[0].y - px[1].y, px[1].x - px[0].x) * 180) / Math.PI;
      const text = `${changeText(Number(a.price), Number(b.price))} · ${barsBetween(view, a.time, b.time)}봉 · ${spanText(b.time - a.time)} · ${angle.toFixed(1)}°`;
      label(ctx, text, (px[0].x + px[1].x) / 2, Math.min(px[0].y, px[1].y) - 14, { align: "center", bg: "rgba(255,255,255,0.92)", color: d.style.color });
    }
    dots(ctx, px, d.style.color);
  },
};

export const trendAngle: DrawingTool = {
  id: "trend-angle",
  label: "추세 각도",
  group: "line",
  section: "라인",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    const [a, b] = px;
    if (b) {
      line(ctx, a, b);
      const angle = Math.atan2(a.y - b.y, b.x - a.x);
      stroke(ctx, d.style.color, 1, [4, 3]);
      line(ctx, a, { x: a.x + 60, y: a.y });
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(a.x, a.y, 34, -angle, 0, angle < 0);
      ctx.stroke();
      label(ctx, `${((angle * 180) / Math.PI).toFixed(1)}°`, a.x + 40, a.y - 10, { color: d.style.color, bold: true });
    }
    dots(ctx, px, d.style.color);
  },
};

export const crossLine: DrawingTool = {
  id: "cross-line",
  label: "십자선",
  group: "line",
  section: "라인",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    line(ctx, { x: 0, y: px[0].y }, { x: view.width, y: px[0].y });
    line(ctx, { x: px[0].x, y: 0 }, { x: px[0].x, y: view.height });
  },
};

export const regression: DrawingTool = {
  id: "regression-trend",
  label: "회귀 추세 채널",
  group: "line",
  section: "채널",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    if (!px[1]) return dots(ctx, px, d.style.color);
    const [t1, t2] = [d.points[0].time, d.points[1].time].sort((x, y) => x - y);
    const bars = view.bars.filter((b) => b.time >= t1 && b.time <= t2);
    if (bars.length < 2) return;
    // 종가를 봉 순서(0,1,2…)에 대해 선형 회귀, 표준편차 2배 채널
    const n = bars.length;
    const xs = bars.map((_, i) => i);
    const mx = (n - 1) / 2;
    const my = bars.reduce((s, b) => s + b.close, 0) / n;
    let sxy = 0;
    let sxx = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * (bars[i].close - my);
      sxx += (x - mx) ** 2;
    });
    const slope = sxx ? sxy / sxx : 0;
    const at = (i: number) => my + slope * (i - mx);
    const sd = Math.sqrt(bars.reduce((s, b, i) => s + (b.close - at(i)) ** 2, 0) / n);
    const pt = (i: number, off: number) => ({ x: view.timeToX(bars[i].time) ?? 0, y: view.priceToY(at(i) + off) ?? 0 });
    const upper = [pt(0, 2 * sd), pt(n - 1, 2 * sd)];
    const lower = [pt(0, -2 * sd), pt(n - 1, -2 * sd)];
    fillPoly(ctx, [upper[0], upper[1], lower[1], lower[0]], FILL);
    stroke(ctx, d.style.color, d.style.width);
    line(ctx, pt(0, 0), pt(n - 1, 0));
    stroke(ctx, d.style.color, 1, [5, 4]);
    line(ctx, upper[0], upper[1]);
    line(ctx, lower[0], lower[1]);
  },
};

export const flatTopBottom: DrawingTool = {
  id: "flat-top-bottom",
  label: "평탄 상단/하단 채널",
  group: "line",
  section: "채널",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    const [a, b, c] = px;
    if (b) line(ctx, a, b);
    if (b && c) {
      const flatA = { x: a.x, y: c.y };
      const flatB = { x: b.x, y: c.y };
      fillPoly(ctx, [a, b, flatB, flatA], FILL);
      line(ctx, flatA, flatB);
    }
    dots(ctx, px, d.style.color);
  },
};

/** 피치포크: 손잡이(handle)에서 B·C 중점으로 가는 중앙선 + B·C 를 지나는 평행선 */
function pitchfork(id: string, labelText: string, handle: (a: PixelPoint, b: PixelPoint) => PixelPoint): DrawingTool {
  return {
    id,
    label: labelText,
    group: "line",
    section: "피치포크",
    pointCount: 3,
    schemaVersion: 1,
    draw(ctx, px, d, view) {
      stroke(ctx, d.style.color, d.style.width);
      const [a, b, c] = px;
      if (b && !c) line(ctx, a, b);
      if (b && c) {
        const h = handle(a, b);
        const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
        const dir = { x: m.x - h.x, y: m.y - h.y };
        const far = (p: PixelPoint) => extendTo(p, { x: p.x + dir.x, y: p.y + dir.y }, view);
        fillPoly(ctx, [b, far(b), far(c), c], FILL);
        line(ctx, h, far(h));
        line(ctx, b, far(b));
        line(ctx, c, far(c));
        stroke(ctx, d.style.color, 1, [4, 3]);
        line(ctx, b, c);
        if (h !== a) line(ctx, a, h);
      }
      dots(ctx, px, d.style.color);
    },
  };
}

export const andrewsPitchfork = pitchfork("pitchfork", "피치포크", (a) => a);
export const schiffPitchfork = pitchfork("schiff-pitchfork", "쉬프 피치포크", (a, b) => ({ x: a.x, y: (a.y + b.y) / 2 }));
export const modifiedSchiff = pitchfork("modified-schiff", "수정 쉬프 피치포크", (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));

