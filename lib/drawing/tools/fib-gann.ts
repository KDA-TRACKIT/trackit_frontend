// 피보나치·갠
import type { DrawingTool, PixelPoint } from "../types";
import { FILL, dots, extendTo, label, line, stroke } from "./draw-utils";

const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];

export const fibChannel: DrawingTool = {
  id: "fib-channel",
  label: "피보나치 채널",
  group: "fib",
  section: "피보나치",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    const [a, b, c] = px;
    if (b) line(ctx, a, b);
    if (b && c) {
      // 기준선(A-B)에서 C 까지의 세로 간격을 레벨만큼 평행 이동
      const off = c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / (b.x - a.x || 1));
      for (const lv of FIB) {
        const a2 = { x: a.x, y: a.y + off * lv };
        const b2 = { x: b.x, y: b.y + off * lv };
        ctx.globalAlpha = lv === 0 || lv === 1 ? 1 : 0.55;
        stroke(ctx, d.style.color, 1);
        line(ctx, a2, extendTo(a2, b2, view));
        ctx.globalAlpha = 1;
        label(ctx, String(lv), a2.x - 4, a2.y, { align: "right", color: d.style.color });
      }
    }
    dots(ctx, px, d.style.color);
  },
};

const SEQ = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];

export const fibTimeZone: DrawingTool = {
  id: "fib-time-zone",
  label: "피보나치 시간대",
  group: "fib",
  section: "피보나치",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const unit = b.x - a.x;
    if (!unit) return;
    SEQ.forEach((k) => {
      const x = a.x + unit * k;
      stroke(ctx, d.style.color, 1, k <= 1 ? [] : [4, 3]);
      line(ctx, { x, y: 0 }, { x, y: view.height });
      label(ctx, String(k), x + 3, 12, { color: d.style.color });
    });
  },
};

export const fibSpeedFan: DrawingTool = {
  id: "fib-speed-fan",
  label: "피보나치 속도 저항 팬",
  group: "fib",
  section: "피보나치",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    for (const lv of [0.25, 0.382, 0.5, 0.618, 0.75, 1]) {
      const target = { x: b.x, y: a.y + (b.y - a.y) * lv };
      stroke(ctx, d.style.color, 1, lv === 1 ? [] : [5, 3]);
      line(ctx, a, extendTo(a, target, view));
      label(ctx, String(lv), b.x + 4, target.y, { color: d.style.color });
    }
    stroke(ctx, d.style.color, 1, [2, 3]);
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    dots(ctx, px, d.style.color);
  },
};

export const fibTrendTime: DrawingTool = {
  id: "fib-trend-time",
  label: "추세 기반 피보나치 시간",
  group: "fib",
  section: "피보나치",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b, c] = px;
    stroke(ctx, d.style.color, 1, [4, 3]);
    if (b) line(ctx, a, b);
    if (b && c) {
      line(ctx, b, c);
      const unit = b.x - a.x;
      for (const lv of [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.618]) {
        const x = c.x + unit * lv;
        stroke(ctx, d.style.color, 1, lv === 0 || lv === 1 ? [] : [4, 3]);
        line(ctx, { x, y: 0 }, { x, y: view.height });
        label(ctx, String(lv), x + 3, 12, { color: d.style.color });
      }
    }
    dots(ctx, px, d.style.color);
  },
};

export const fibCircles: DrawingTool = {
  id: "fib-circles",
  label: "피보나치 원",
  group: "fib",
  section: "피보나치",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    for (const lv of [0.382, 0.5, 0.618, 1, 1.618, 2.618]) {
      stroke(ctx, d.style.color, 1, lv === 1 ? [] : [4, 3]);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r * lv, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, String(lv), a.x + r * lv + 3, a.y, { color: d.style.color });
    }
    dots(ctx, px, d.style.color);
  },
};

export const fibSpeedArcs: DrawingTool = {
  id: "fib-speed-arcs",
  label: "피보나치 속도 저항 호",
  group: "fib",
  section: "피보나치",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    stroke(ctx, d.style.color, 1, [4, 3]);
    line(ctx, a, b);
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    // B 를 중심으로 A 쪽으로 열린 반원
    const toward = Math.atan2(a.y - b.y, a.x - b.x);
    for (const lv of [0.382, 0.5, 0.618, 1]) {
      stroke(ctx, d.style.color, 1);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * lv, toward - Math.PI / 2, toward + Math.PI / 2);
      ctx.stroke();
    }
    dots(ctx, px, d.style.color);
  },
};

const GANN_LEVELS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];

export const gannBox: DrawingTool = {
  id: "gann-box",
  label: "갠 박스",
  group: "fib",
  section: "갠",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    ctx.fillStyle = FILL;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (const lv of GANN_LEVELS) {
      const x = a.x + (b.x - a.x) * lv;
      const y = a.y + (b.y - a.y) * lv;
      stroke(ctx, d.style.color, 1, lv === 0 || lv === 1 ? [] : [3, 3]);
      line(ctx, { x, y: a.y }, { x, y: b.y });
      line(ctx, { x: a.x, y }, { x: b.x, y });
      label(ctx, String(lv), b.x + 4, y, { color: d.style.color, size: 10 });
    }
    stroke(ctx, d.style.color, 1);
    line(ctx, a, b);
    line(ctx, { x: a.x, y: b.y }, { x: b.x, y: a.y });
  },
};

export const gannSquare: DrawingTool = {
  id: "gann-square",
  label: "갠 스퀘어",
  group: "fib",
  section: "갠",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    // 가로·세로를 같은 길이로 맞춘 정사각형
    const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    const c = { x: a.x + Math.sign(b.x - a.x || 1) * side, y: a.y + Math.sign(b.y - a.y || 1) * side };
    stroke(ctx, d.style.color, 1);
    ctx.strokeRect(Math.min(a.x, c.x), Math.min(a.y, c.y), side, side);
    for (const lv of [1 / 3, 0.5, 2 / 3]) {
      stroke(ctx, d.style.color, 1, [3, 3]);
      line(ctx, { x: a.x + (c.x - a.x) * lv, y: a.y }, { x: a.x + (c.x - a.x) * lv, y: c.y });
      line(ctx, { x: a.x, y: a.y + (c.y - a.y) * lv }, { x: c.x, y: a.y + (c.y - a.y) * lv });
    }
    stroke(ctx, d.style.color, 1);
    line(ctx, a, c);
    line(ctx, { x: a.x, y: c.y }, { x: c.x, y: a.y });
  },
};

const GANN_RATIOS: [number, string][] = [
  [1 / 8, "1×8"],
  [1 / 4, "1×4"],
  [1 / 3, "1×3"],
  [1 / 2, "1×2"],
  [1, "1×1"],
  [2, "2×1"],
  [3, "3×1"],
  [4, "4×1"],
  [8, "8×1"],
];

export const gannFan: DrawingTool = {
  id: "gann-fan",
  label: "갠 팬",
  group: "fib",
  section: "갠",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const [ratio, name] of GANN_RATIOS) {
      const target: PixelPoint = { x: a.x + dx, y: a.y + dy * ratio };
      stroke(ctx, d.style.color, ratio === 1 ? 1.5 : 1, ratio === 1 ? [] : [5, 3]);
      const end = extendTo(a, target, view);
      line(ctx, a, end);
      label(ctx, name, target.x + 4, target.y, { color: d.style.color, size: 10 });
    }
    dots(ctx, px, d.style.color);
  },
};
