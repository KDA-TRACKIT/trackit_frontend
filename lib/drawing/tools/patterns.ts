// 차트 패턴 · 엘리엇 파동 · 사이클
import type { Drawing, DrawingTool, PixelPoint } from "../types";
import { dots, extendTo, fillPoly, label, line, poly, priceOf, stroke, tint } from "./draw-utils";

/** 점마다 이름표 (위로 튄 점은 위에, 아래로 꺼진 점은 아래에) */
function tagPoints(ctx: CanvasRenderingContext2D, px: PixelPoint[], names: string[], color: string) {
  px.forEach((p, i) => {
    if (!names[i]) return;
    const prev = px[i - 1] ?? px[i + 1];
    const next = px[i + 1] ?? px[i - 1];
    const high = !prev || !next ? p.y <= (prev ?? next ?? p).y : p.y <= prev.y && p.y <= next.y;
    label(ctx, names[i], p.x, p.y + (high ? -12 : 12), { align: "center", color: "#fff", bg: color, bold: true, size: 10 });
  });
}

const ratio = (d: Drawing, from: [number, number], over: [number, number]) => {
  const num = Math.abs(priceOf(d, from[1]) - priceOf(d, from[0]));
  const den = Math.abs(priceOf(d, over[1]) - priceOf(d, over[0]));
  return den ? (num / den).toFixed(3) : "-";
};

function harmonic(id: string, name: string, names: string[]): DrawingTool {
  return {
    id,
    label: name,
    group: "pattern",
    section: "패턴",
    pointCount: 5,
    schemaVersion: 1,
    draw(ctx, px, d) {
      const [x, a, b, c, e] = px;
      if (b) fillPoly(ctx, [x, a, b], tint(d.style.color, 0.12));
      if (e) fillPoly(ctx, [b, c, e], tint(d.style.color, 0.12));
      stroke(ctx, d.style.color, d.style.width);
      poly(ctx, px);
      stroke(ctx, d.style.color, 1, [4, 3]);
      if (b) line(ctx, x, b);
      if (c) line(ctx, a, c);
      if (e) {
        line(ctx, b, e);
        line(ctx, x, e);
      }
      // 되돌림 비율: AB/XA, BC/AB, CD/BC, AD/XA
      const mid = (p: PixelPoint, q: PixelPoint) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      if (b) label(ctx, ratio(d, [1, 2], [0, 1]), mid(x, b).x, mid(x, b).y, { align: "center", bg: "#fff", color: d.style.color, size: 10 });
      if (c) label(ctx, ratio(d, [2, 3], [1, 2]), mid(a, c).x, mid(a, c).y, { align: "center", bg: "#fff", color: d.style.color, size: 10 });
      if (e) {
        label(ctx, ratio(d, [3, 4], [2, 3]), mid(b, e).x, mid(b, e).y, { align: "center", bg: "#fff", color: d.style.color, size: 10 });
        label(ctx, ratio(d, [1, 4], [0, 1]), mid(x, e).x, mid(x, e).y, { align: "center", bg: "#fff", color: d.style.color, size: 10 });
      }
      tagPoints(ctx, px, names, d.style.color);
    },
  };
}

export const xabcd = harmonic("xabcd", "XABCD 패턴", ["X", "A", "B", "C", "D"]);
export const cypher = harmonic("cypher", "사이퍼 패턴", ["X", "A", "B", "C", "D"]);

export const headShoulders: DrawingTool = {
  id: "head-shoulders",
  label: "헤드 앤 숄더",
  group: "pattern",
  section: "패턴",
  pointCount: 7,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    poly(ctx, px);
    if (px[2] && px[4]) {
      // 넥라인: 두 골짜기를 잇고 오른쪽으로 연장
      stroke(ctx, d.style.color, 1, [5, 4]);
      line(ctx, px[2], extendTo(px[2], px[4], view));
      if (px[1] && px[3] && px[5]) fillPoly(ctx, [px[2], px[3], px[4]], tint(d.style.color, 0.12));
    }
    tagPoints(ctx, px, ["", "왼어깨", "", "머리", "", "오른어깨", ""], d.style.color);
  },
};

export const trianglePattern: DrawingTool = {
  id: "triangle-pattern",
  label: "삼각형 패턴",
  group: "pattern",
  section: "패턴",
  pointCount: 4,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    poly(ctx, px);
    stroke(ctx, d.style.color, 1, [5, 4]);
    if (px[2]) line(ctx, px[0], extendTo(px[0], px[2], view));
    if (px[3]) line(ctx, px[1], extendTo(px[1], px[3], view));
    tagPoints(ctx, px, ["A", "B", "C", "D"], d.style.color);
  },
};

export const threeDrives: DrawingTool = {
  id: "three-drives",
  label: "쓰리 드라이브",
  group: "pattern",
  section: "패턴",
  pointCount: 7,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    poly(ctx, px);
    tagPoints(ctx, px, ["", "1", "", "2", "", "3", ""], d.style.color);
  },
};

function elliott(id: string, name: string, names: string[]): DrawingTool {
  return {
    id,
    label: name,
    group: "pattern",
    section: "엘리엇 파동",
    pointCount: names.length,
    schemaVersion: 1,
    draw(ctx, px, d) {
      stroke(ctx, d.style.color, d.style.width);
      poly(ctx, px);
      tagPoints(ctx, px, names, d.style.color);
    },
  };
}

export const elliottImpulse = elliott("elliott-impulse", "엘리엇 충격파 (12345)", ["0", "1", "2", "3", "4", "5"]);
export const elliottCorrection = elliott("elliott-correction", "엘리엇 조정파 (ABC)", ["0", "A", "B", "C"]);
export const elliottTriangle = elliott("elliott-triangle", "엘리엇 삼각파 (ABCDE)", ["0", "A", "B", "C", "D", "E"]);
export const elliottDouble = elliott("elliott-double", "엘리엇 이중 조합 (WXY)", ["0", "W", "X", "Y"]);
export const elliottTriple = elliott("elliott-triple", "엘리엇 삼중 조합 (WXYXZ)", ["0", "W", "X", "Y", "X", "Z"]);

export const cyclicLines: DrawingTool = {
  id: "cyclic-lines",
  label: "주기선",
  group: "pattern",
  section: "사이클",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const unit = b.x - a.x;
    if (Math.abs(unit) < 2) return;
    stroke(ctx, d.style.color, 1, [4, 3]);
    for (let x = a.x, k = 0; k < 400 && x > -unit * 2 && x < view.width + Math.abs(unit); x += unit, k++) line(ctx, { x, y: 0 }, { x, y: view.height });
  },
};

export const timeCycles: DrawingTool = {
  id: "time-cycles",
  label: "시간 주기",
  group: "pattern",
  section: "사이클",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const unit = b.x - a.x;
    if (Math.abs(unit) < 2) return;
    stroke(ctx, d.style.color, 1);
    for (let x = a.x, k = 0; k < 200 && x < view.width + Math.abs(unit); x += unit, k++) {
      ctx.beginPath();
      ctx.arc(x + unit / 2, a.y, Math.abs(unit) / 2, Math.PI, 0);
      ctx.stroke();
    }
  },
};

export const sineLine: DrawingTool = {
  id: "sine-line",
  label: "사인선",
  group: "pattern",
  section: "사이클",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const half = b.x - a.x;
    if (Math.abs(half) < 2) return;
    const mid = (a.y + b.y) / 2;
    const amp = (a.y - b.y) / 2;
    stroke(ctx, d.style.color, d.style.width);
    ctx.beginPath();
    for (let x = 0; x <= view.width; x += 2) {
      const y = mid + amp * Math.cos(((x - a.x) / half) * Math.PI);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    dots(ctx, px, d.style.color);
  },
};
