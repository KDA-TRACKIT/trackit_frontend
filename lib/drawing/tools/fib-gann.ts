// 피보나치·갠 (트레이딩뷰처럼 레벨마다 색 + 레벨 사이 반투명 채우기)
import type { DrawingTool } from "../types";
import { dots, extendTo, fibColor, label, line, lvText, stroke, tint } from "./draw-utils";

const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];

export const fibChannel: DrawingTool = {
  id: "fib-channel",
  label: "피보나치 채널",
  group: "fib",
  section: "피보나치",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b, c] = px;
    if (b && !c) {
      stroke(ctx, d.style.color, d.style.width);
      line(ctx, a, b);
    }
    if (b && c) {
      // 기준선(A-B)에서 C 까지의 세로 간격을 레벨만큼 평행 이동
      const off = c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / (b.x - a.x || 1));
      const at = (lv: number) => {
        const a2 = { x: a.x, y: a.y + off * lv };
        return [a2, extendTo(a2, { x: b.x, y: b.y + off * lv }, view)] as const;
      };
      for (let i = 0; i < FIB.length - 1; i++) {
        const [p1, q1] = at(FIB[i]);
        const [p2, q2] = at(FIB[i + 1]);
        ctx.fillStyle = tint(fibColor(FIB[i + 1]), 0.1);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(q1.x, q1.y);
        ctx.lineTo(q2.x, q2.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
      }
      for (const lv of FIB) {
        const [p, q] = at(lv);
        stroke(ctx, fibColor(lv), 1);
        line(ctx, p, q);
        label(ctx, lvText(lv), p.x - 4, p.y, { align: "right", color: fibColor(lv) });
      }
    }
    dots(ctx, px, d.style.color);
  },
};

const SEQ = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
const SEQ_COLORS = ["#787b86", "#2962ff", "#2962ff", "#4caf50", "#089981", "#00bcd4", "#ff9800", "#f23645", "#9c27b0", "#e91e63", "#2962ff", "#4caf50"];

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
    SEQ.forEach((k, i) => {
      const x = a.x + unit * k;
      stroke(ctx, SEQ_COLORS[i], 1);
      line(ctx, { x, y: 0 }, { x, y: view.height });
      label(ctx, String(k), x + 4, 12, { color: SEQ_COLORS[i] });
    });
  },
};

const FAN = [0.25, 0.382, 0.5, 0.618, 0.75, 1];

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
    const end = (lv: number) => extendTo(a, { x: b.x, y: a.y + (b.y - a.y) * lv }, view);
    // 팬 사이 채우기 (0 = 수평선부터)
    const levels = [0, ...FAN];
    for (let i = 0; i < levels.length - 1; i++) {
      const e1 = levels[i] === 0 ? extendTo(a, { x: b.x, y: a.y }, view) : end(levels[i]);
      const e2 = end(levels[i + 1]);
      ctx.fillStyle = tint(fibColor(levels[i + 1]), 0.1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(e1.x, e1.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.closePath();
      ctx.fill();
    }
    for (const lv of FAN) {
      stroke(ctx, fibColor(lv), 1);
      line(ctx, a, end(lv));
      label(ctx, lvText(lv), b.x + 4, a.y + (b.y - a.y) * lv, { color: fibColor(lv) });
    }
    stroke(ctx, tint(d.style.color, 0.6), 1, [2, 3]);
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    dots(ctx, px, d.style.color);
  },
};

const TREND_TIME = [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.618];

export const fibTrendTime: DrawingTool = {
  id: "fib-trend-time",
  label: "추세 기반 피보나치 시간",
  group: "fib",
  section: "피보나치",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b, c] = px;
    stroke(ctx, tint(d.style.color, 0.8), 1, [4, 3]);
    if (b) line(ctx, a, b);
    if (b && c) {
      line(ctx, b, c);
      const unit = b.x - a.x;
      for (let i = 0; i < TREND_TIME.length; i++) {
        const lv = TREND_TIME[i];
        const x = c.x + unit * lv;
        if (i < TREND_TIME.length - 1) {
          const x2 = c.x + unit * TREND_TIME[i + 1];
          ctx.fillStyle = tint(fibColor(TREND_TIME[i + 1]), 0.07);
          ctx.fillRect(Math.min(x, x2), 0, Math.abs(x2 - x), view.height);
        }
        stroke(ctx, fibColor(lv), 1);
        line(ctx, { x, y: 0 }, { x, y: view.height });
        label(ctx, lvText(lv), x + 4, 12, { color: fibColor(lv) });
      }
    }
    dots(ctx, px, d.style.color);
  },
};

const CIRCLES = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];

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
    // 바깥 원부터 채워서 안쪽 띠가 위에 오게
    for (let i = CIRCLES.length - 1; i >= 0; i--) {
      ctx.fillStyle = tint(fibColor(CIRCLES[i]), 0.08);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r * CIRCLES[i], 0, Math.PI * 2);
      if (i > 0) ctx.arc(a.x, a.y, r * CIRCLES[i - 1], 0, Math.PI * 2, true);
      ctx.fill();
    }
    for (const lv of CIRCLES) {
      stroke(ctx, fibColor(lv), 1);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r * lv, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, lvText(lv), a.x + r * lv + 3, a.y, { color: fibColor(lv) });
    }
    stroke(ctx, tint(d.style.color, 0.7), 1, [4, 3]);
    line(ctx, a, b);
    dots(ctx, px, d.style.color);
  },
};

const ARCS = [0.236, 0.382, 0.5, 0.618, 0.786, 1];

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
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    // B 를 중심으로 A 쪽으로 열린 반원
    const toward = Math.atan2(a.y - b.y, a.x - b.x);
    const s = toward - Math.PI / 2;
    const e = toward + Math.PI / 2;
    for (let i = ARCS.length - 1; i >= 0; i--) {
      ctx.fillStyle = tint(fibColor(ARCS[i]), 0.08);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * ARCS[i], s, e);
      if (i > 0) ctx.arc(b.x, b.y, r * ARCS[i - 1], e, s, true);
      else ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.fill();
    }
    for (const lv of ARCS) {
      stroke(ctx, fibColor(lv), 1);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * lv, s, e);
      ctx.stroke();
    }
    stroke(ctx, tint(d.style.color, 0.7), 1, [4, 3]);
    line(ctx, a, b);
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
    // 가로 띠를 레벨 색으로 연하게
    for (let i = 0; i < GANN_LEVELS.length - 1; i++) {
      const y1 = a.y + (b.y - a.y) * GANN_LEVELS[i];
      const y2 = a.y + (b.y - a.y) * GANN_LEVELS[i + 1];
      ctx.fillStyle = tint(fibColor(GANN_LEVELS[i + 1]), 0.09);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(y1, y2), Math.abs(b.x - a.x), Math.abs(y2 - y1));
    }
    for (const lv of GANN_LEVELS) {
      const x = a.x + (b.x - a.x) * lv;
      const y = a.y + (b.y - a.y) * lv;
      stroke(ctx, fibColor(lv), 1);
      line(ctx, { x, y: a.y }, { x, y: b.y });
      line(ctx, { x: a.x, y }, { x: b.x, y });
      label(ctx, lvText(lv), Math.max(a.x, b.x) + 4, y, { color: fibColor(lv), size: 10 });
      label(ctx, lvText(lv), x, Math.max(a.y, b.y) + 10, { color: fibColor(lv), size: 10, align: "center" });
    }
    stroke(ctx, tint(d.style.color, 0.8), 1);
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
    ctx.fillStyle = tint(d.style.color, 0.06);
    ctx.fillRect(Math.min(a.x, c.x), Math.min(a.y, c.y), side, side);
    stroke(ctx, d.style.color, 1);
    ctx.strokeRect(Math.min(a.x, c.x), Math.min(a.y, c.y), side, side);
    const cols = ["#f23645", "#4caf50", "#2962ff"];
    [1 / 3, 0.5, 2 / 3].forEach((lv, i) => {
      stroke(ctx, cols[i], 1, [3, 3]);
      line(ctx, { x: a.x + (c.x - a.x) * lv, y: a.y }, { x: a.x + (c.x - a.x) * lv, y: c.y });
      line(ctx, { x: a.x, y: a.y + (c.y - a.y) * lv }, { x: c.x, y: a.y + (c.y - a.y) * lv });
    });
    stroke(ctx, d.style.color, 1);
    line(ctx, a, c);
    line(ctx, { x: a.x, y: c.y }, { x: c.x, y: a.y });
  },
};

const GANN_RATIOS: [number, string, string][] = [
  [1 / 8, "1×8", "#f23645"],
  [1 / 4, "1×4", "#ff9800"],
  [1 / 3, "1×3", "#4caf50"],
  [1 / 2, "1×2", "#089981"],
  [1, "1×1", "#2962ff"],
  [2, "2×1", "#089981"],
  [3, "3×1", "#4caf50"],
  [4, "4×1", "#ff9800"],
  [8, "8×1", "#f23645"],
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
    const ends = GANN_RATIOS.map(([ratio]) => extendTo(a, { x: a.x + dx, y: a.y + dy * ratio }, view));
    for (let i = 0; i < ends.length - 1; i++) {
      ctx.fillStyle = tint(GANN_RATIOS[i + 1][2], 0.07);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(ends[i].x, ends[i].y);
      ctx.lineTo(ends[i + 1].x, ends[i + 1].y);
      ctx.closePath();
      ctx.fill();
    }
    GANN_RATIOS.forEach(([ratio, name, color], i) => {
      stroke(ctx, color, ratio === 1 ? 1.5 : 1);
      line(ctx, a, ends[i]);
      label(ctx, name, a.x + dx + 4, a.y + dy * ratio, { color, size: 10 });
    });
    dots(ctx, px, d.style.color);
  },
};

