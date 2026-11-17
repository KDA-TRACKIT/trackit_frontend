// 예측·측정·거래량 기반: 롱/숏 포지션, 예측, 가격·날짜 범위, 고정 VWAP, 고정 범위 매물대
import type { DrawingTool } from "../types";
import { DOWN, UP, anchor, barsBetween, changeText, dots, label, line, priceOf, spanText, stroke, won, tint } from "./draw-utils";

/** 진입(A) → 목표(B, 오른쪽 끝도 정함) → 손절(C) */
function position(long: boolean): DrawingTool {
  return {
    id: long ? "long-position" : "short-position",
    label: long ? "롱 포지션" : "숏 포지션",
    group: "measure",
    section: "예측",
    pointCount: 3,
    schemaVersion: 1,
    draw(ctx, px, d) {
      const [a, b, c] = px;
      if (!b) return dots(ctx, px, d.style.color);
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x, left + 40);
      const w = right - left;
      const entry = priceOf(d, 0);
      const target = priceOf(d, 1);
      const profit = { y: Math.min(a.y, b.y), h: Math.abs(b.y - a.y) };
      ctx.fillStyle = "rgba(18,184,134,0.18)";
      ctx.fillRect(left, profit.y, w, profit.h);
      if (c) {
        ctx.fillStyle = "rgba(240,62,62,0.16)";
        ctx.fillRect(left, Math.min(a.y, c.y), w, Math.abs(c.y - a.y));
      }
      stroke(ctx, "#495057", 1);
      line(ctx, { x: left, y: a.y }, { x: right, y: a.y });
      const sign = long ? 1 : -1;
      const tgtPct = ((target - entry) / entry) * 100 * sign;
      label(ctx, `목표 ${won(target)} (${tgtPct >= 0 ? "+" : ""}${tgtPct.toFixed(2)}%)`, left + w / 2, b.y + (b.y < a.y ? -9 : 9), { align: "center", bg: "#12b886", color: "#fff", size: 10 });
      if (c) {
        const stop = priceOf(d, 2);
        const stopPct = ((stop - entry) / entry) * 100 * sign;
        const rr = Math.abs(stop - entry) ? Math.abs(target - entry) / Math.abs(stop - entry) : 0;
        label(ctx, `손절 ${won(stop)} (${stopPct >= 0 ? "+" : ""}${stopPct.toFixed(2)}%)`, left + w / 2, c.y + (c.y < a.y ? -9 : 9), { align: "center", bg: "#f03e3e", color: "#fff", size: 10 });
        label(ctx, `${long ? "롱" : "숏"} 진입 ${won(entry)} · 손익비 ${rr.toFixed(2)}`, left + w / 2, a.y, { align: "center", bg: "#495057", color: "#fff", size: 10 });
      }
    },
  };
}

export const longPosition = position(true);
export const shortPosition = position(false);

export const forecast: DrawingTool = {
  id: "forecast",
  label: "예측",
  group: "measure",
  section: "예측",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const up = priceOf(d, 1) >= priceOf(d, 0);
    const color = up ? UP : DOWN;
    stroke(ctx, color, 2, [6, 4]);
    line(ctx, a, b);
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, `${changeText(priceOf(d, 0), priceOf(d, 1))} · ${spanText(d.points[1].time - d.points[0].time)}`, b.x + 10, b.y, { bg: color, color: "#fff", size: 10 });
    anchor(ctx, a, color);
  },
};

export const priceRangeOnly: DrawingTool = {
  id: "price-range-only",
  label: "가격 범위",
  group: "measure",
  section: "측정",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const up = priceOf(d, 1) >= priceOf(d, 0);
    const color = up ? UP : DOWN;
    ctx.fillStyle = up ? "rgba(8,153,129,0.08)" : "rgba(242,54,69,0.08)";
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    stroke(ctx, color, 1);
    const mx = (a.x + b.x) / 2;
    line(ctx, { x: mx, y: a.y }, { x: mx, y: b.y });
    line(ctx, { x: Math.min(a.x, b.x), y: a.y }, { x: Math.max(a.x, b.x), y: a.y });
    line(ctx, { x: Math.min(a.x, b.x), y: b.y }, { x: Math.max(a.x, b.x), y: b.y });
    label(ctx, changeText(priceOf(d, 0), priceOf(d, 1)), mx, b.y + (up ? -12 : 12), { align: "center", bg: color, color: "#fff", size: 10 });
  },
};

export const dateRange: DrawingTool = {
  id: "date-range",
  label: "날짜 범위",
  group: "measure",
  section: "측정",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    ctx.fillStyle = tint(d.style.color, 0.12);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    stroke(ctx, d.style.color, 1);
    const my = (a.y + b.y) / 2;
    line(ctx, { x: a.x, y: my }, { x: b.x, y: my });
    line(ctx, { x: a.x, y: Math.min(a.y, b.y) }, { x: a.x, y: Math.max(a.y, b.y) });
    line(ctx, { x: b.x, y: Math.min(a.y, b.y) }, { x: b.x, y: Math.max(a.y, b.y) });
    const [t1, t2] = [d.points[0].time, d.points[1].time];
    label(ctx, `${barsBetween(view, t1, t2)}봉 · ${spanText(t2 - t1)}`, (a.x + b.x) / 2, Math.max(a.y, b.y) + 12, { align: "center", bg: d.style.color, color: "#fff", size: 10 });
  },
};

export const anchoredVwap: DrawingTool = {
  id: "anchored-vwap",
  label: "고정 VWAP",
  group: "measure",
  section: "거래량 기반",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const from = d.points[0].time;
    let pv = 0;
    let vol = 0;
    const pts: { x: number; y: number }[] = [];
    for (const bar of view.bars) {
      if (bar.time < from) continue;
      pv += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
      vol += bar.volume;
      if (!vol) continue;
      const x = view.timeToX(bar.time);
      const y = view.priceToY(pv / vol);
      if (x !== null && y !== null) pts.push({ x, y });
    }
    stroke(ctx, "#c2255c", 1.6);
    if (pts.length > 1) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      const last = pts[pts.length - 1];
      label(ctx, `VWAP ${won(view.yToPrice(last.y) ?? 0)}`, last.x + 6, last.y, { bg: "#c2255c", color: "#fff", size: 10 });
    }
    anchor(ctx, px[0], "#c2255c");
  },
};

export const volumeProfile: DrawingTool = {
  id: "fixed-range-volume-profile",
  label: "고정 범위 매물대",
  group: "measure",
  section: "거래량 기반",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const [t1, t2] = [d.points[0].time, d.points[1].time].sort((x, y) => x - y);
    const bars = view.bars.filter((bar) => bar.time >= t1 && bar.time <= t2);
    const left = Math.min(a.x, b.x);
    const width = Math.abs(b.x - a.x);
    stroke(ctx, "#868e96", 1, [3, 3]);
    line(ctx, { x: left, y: 0 }, { x: left, y: view.height });
    line(ctx, { x: left + width, y: 0 }, { x: left + width, y: view.height });
    if (bars.length < 1 || width < 4) return;
    const hi = Math.max(...bars.map((bar) => bar.high));
    const lo = Math.min(...bars.map((bar) => bar.low));
    const bins = 24;
    const size = (hi - lo) / bins || 1;
    const vols = new Array(bins).fill(0);
    // 봉 거래량을 그 봉의 고저 범위 칸에 고르게 나눠 담는다
    for (const bar of bars) {
      const from = Math.max(0, Math.floor((bar.low - lo) / size));
      const to = Math.min(bins - 1, Math.floor((bar.high - lo) / size));
      for (let i = from; i <= to; i++) vols[i] += bar.volume / (to - from + 1);
    }
    const max = Math.max(...vols) || 1;
    const poc = vols.indexOf(max);
    vols.forEach((v, i) => {
      const yTop = view.priceToY(lo + size * (i + 1));
      const yBot = view.priceToY(lo + size * i);
      if (yTop === null || yBot === null) return;
      ctx.fillStyle = i === poc ? "rgba(240,62,62,0.55)" : "rgba(41,98,255,0.32)";
      ctx.fillRect(left, yTop + 0.5, (v / max) * width * 0.7, Math.max(1, yBot - yTop - 1));
    });
    const pocY = view.priceToY(lo + size * (poc + 0.5));
    if (pocY !== null) {
      stroke(ctx, "#f03e3e", 1);
      line(ctx, { x: left, y: pocY }, { x: left + width, y: pocY });
      label(ctx, `POC ${won(lo + size * (poc + 0.5))}`, left + width + 4, pocY, { bg: "#f03e3e", color: "#fff", size: 10 });
    }
  },
};
