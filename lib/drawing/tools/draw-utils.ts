// 드로잉 툴 공통 그리기 함수
import type { Drawing, PixelPoint, ViewInfo } from "../types";

export const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
export const priceOf = (d: Drawing, i: number) => Number(d.points[i].price);

export function stroke(ctx: CanvasRenderingContext2D, color: string, width = 1.5, dash: number[] = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
}

export function line(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function poly(ctx: CanvasRenderingContext2D, pts: PixelPoint[], close = false) {
  if (pts.length < 2) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
  ctx.stroke();
}

export function fillPoly(ctx: CanvasRenderingContext2D, pts: PixelPoint[], fill: string) {
  if (pts.length < 3) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
}

/**
 * 끝점 표시는 그리지 않는다: 차트가 복잡해지지 않게, 끝점 손잡이는 마우스를 올렸을 때·고른 때·그리는 중에만
 * 렌더러(lwc-adapter)가 따로 그린다. (툴 코드는 그대로 두려고 함수만 남김)
 */
export function dots(_ctx: CanvasRenderingContext2D, _px: PixelPoint[], _color?: string) {}

/** 의미가 있는 기준점 (VWAP 시작점, 예측 출발점 등): 작게 칠한 점 */
export function anchor(ctx: CanvasRenderingContext2D, p: PixelPoint, color: string) {
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** a→b 방향으로 화면 밖까지 늘린 점 */
export function extendTo(a: PixelPoint, b: PixelPoint, view: Pick<ViewInfo, "width" | "height">): PixelPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  const big = (view.width + view.height) * 4;
  const len = Math.hypot(dx, dy);
  return { x: a.x + (dx / len) * big, y: a.y + (dy / len) * big };
}

/** 글자 (배경 상자 선택) */
export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { color?: string; bg?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; size?: number; bold?: boolean } = {},
) {
  const size = opts.size ?? 11;
  ctx.setLineDash([]);
  ctx.font = `${opts.bold ? 700 : 500} ${size}px Pretendard, sans-serif`;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = opts.baseline ?? "middle";
  if (opts.bg) {
    const w = ctx.measureText(text).width + 10;
    const h = size + 8;
    const left = opts.align === "center" ? x - w / 2 : opts.align === "right" ? x - w : x - 5;
    const top = opts.baseline === "top" ? y - 4 : opts.baseline === "bottom" ? y - h + 4 : y - h / 2;
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, 3);
    ctx.fill();
  }
  ctx.fillStyle = opts.color ?? "#191919";
  ctx.fillText(text, x, y);
}

/** 여러 줄 글이 든 상자 (노트·말풍선) */
export function textBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: { color: string; bg: string; border?: string; maxWidth?: number }) {
  const lines = (text || " ").split("\n").flatMap((ln) => wrap(ctx, ln, opts.maxWidth ?? 220));
  ctx.font = "500 12px Pretendard, sans-serif";
  const w = Math.max(...lines.map((ln) => ctx.measureText(ln).width)) + 16;
  const h = lines.length * 17 + 10;
  ctx.setLineDash([]);
  ctx.fillStyle = opts.bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = opts.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((ln, i) => ctx.fillText(ln, x + 8, y + 6 + i * 17));
  return { w, h };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  ctx.font = "500 12px Pretendard, sans-serif";
  if (ctx.measureText(text).width <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > max && cur) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** 두 점 사이 등락 문구: +1,200원 (+0.58%) */
export function changeText(from: number, to: number) {
  const diff = to - from;
  const rate = from ? (diff / from) * 100 : 0;
  return `${diff >= 0 ? "+" : ""}${won(diff)}원 (${diff >= 0 ? "+" : ""}${rate.toFixed(2)}%)`;
}

/** 두 시각 사이 봉 개수 (봉이 있는 구간만 셈) */
export function barsBetween(view: ViewInfo, t1: number, t2: number) {
  const [a, b] = t1 <= t2 ? [t1, t2] : [t2, t1];
  return view.bars.filter((bar) => bar.time >= a && bar.time <= b).length;
}

/** 기간 문구 (일봉이면 일, 분봉이면 시간·분) */
export function spanText(seconds: number) {
  const s = Math.abs(seconds);
  if (s >= 86400) return `${Math.round(s / 86400)}일`;
  if (s >= 3600) return `${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분`;
  return `${Math.round(s / 60)}분`;
}

export const FILL = "rgba(41,98,255,0.08)";
/** 오름 초록 · 내림 빨강 (차트 캔들 색과 같게) */
export const UP = "#089981";
export const DOWN = "#f23645";
