// 브러시 · 도형 · 화살표 · 글(텍스트·노트·말풍선·가격 라벨 등)
import type { DrawingTool, PixelPoint } from "../types";
import { anchor, dots, fillPoly, label, line, poly, priceOf, stroke, textBox, won, tint } from "./draw-utils";

/** 점을 부드럽게 잇는 선 (중점을 지나는 2차 곡선) */
function smooth(ctx: CanvasRenderingContext2D, pts: PixelPoint[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
}

export const brush: DrawingTool = {
  id: "brush",
  label: "브러시",
  group: "brush",
  mode: "free",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    smooth(ctx, px);
  },
};

/**
 * 펜: 손으로 그린 그대로 (브러시처럼 곧은 획을 직선으로 바꾸거나 둥글게 다듬지 않음).
 *   꺾인 곳이 뾰족하게 남아서 기영이 머리 같은 모양도 그릴 수 있음
 */
export const pen: DrawingTool = {
  id: "pen",
  label: "펜",
  group: "brush",
  mode: "free",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    if (px.length < 2) return;
    stroke(ctx, d.style.color, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "miter";
    ctx.miterLimit = 6;
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    for (let i = 1; i < px.length; i++) ctx.lineTo(px[i].x, px[i].y);
    ctx.stroke();
  },
};

/** 지우개: 끄는 자리의 펜 잉크를 지움 (그리는 것은 없음, 지우는 일은 차트 쪽에서) */
export const eraser: DrawingTool = {
  id: "eraser",
  label: "지우개",
  group: "brush",
  mode: "free",
  pointCount: 2,
  schemaVersion: 1,
  draw() {},
};

/** 손으로 그린 잉크 (선택 · 손잡이 없이 그림처럼, 지우개로만 지움) */
export const INK_TOOLS = new Set(["pen", "brush", "highlighter"]);

export const highlighterFree: DrawingTool = {
  id: "highlighter",
  label: "형광펜",
  group: "brush",
  mode: "free",
  pointCount: 2,
  schemaVersion: 2,
  draw(ctx, px) {
    stroke(ctx, "rgba(255, 213, 0, 0.45)", 12);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    smooth(ctx, px);
  },
};

function arrowHead(ctx: CanvasRenderingContext2D, from: PixelPoint, to: PixelPoint, size: number, color: string) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 7), to.y - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 7), to.y - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

export const arrowMarker: DrawingTool = {
  id: "arrow-marker",
  label: "굵은 화살표",
  group: "arrow",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const w = 6;
    const head = Math.min(18, len * 0.45);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.moveTo(0, -w / 2);
    ctx.lineTo(len - head, -w / 2);
    ctx.lineTo(len - head, -w * 1.6);
    ctx.lineTo(len, 0);
    ctx.lineTo(len - head, w * 1.6);
    ctx.lineTo(len - head, w / 2);
    ctx.lineTo(0, w / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
};

export const rotatedRect: DrawingTool = {
  id: "rotated-rectangle",
  label: "회전 사각형",
  group: "shape",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b, c] = px;
    stroke(ctx, d.style.color, d.style.width);
    if (b && !c) line(ctx, a, b);
    if (b && c) {
      // A-B 변에 수직인 방향으로 C 까지의 거리만큼 폭
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const dist = (c.x - a.x) * nx + (c.y - a.y) * ny;
      const rect = [a, b, { x: b.x + nx * dist, y: b.y + ny * dist }, { x: a.x + nx * dist, y: a.y + ny * dist }];
      fillPoly(ctx, rect, tint(d.style.color, 0.12));
      poly(ctx, rect, true);
    }
    dots(ctx, px, d.style.color);
  },
};

export const path: DrawingTool = {
  id: "path",
  label: "경로 (더블클릭으로 끝)",
  group: "shape",
  mode: "multi",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    poly(ctx, px);
    if (px.length >= 2) arrowHead(ctx, px[px.length - 2], px[px.length - 1], 11, d.style.color);
  },
};

export const polyline: DrawingTool = {
  id: "polyline",
  label: "폴리라인 (더블클릭으로 끝)",
  group: "shape",
  mode: "multi",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    if (px.length >= 3) fillPoly(ctx, px, tint(d.style.color, 0.12));
    poly(ctx, px);
    dots(ctx, px, d.style.color);
  },
};

export const circle: DrawingTool = {
  id: "circle",
  label: "원",
  group: "shape",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return;
    stroke(ctx, d.style.color, d.style.width);
    ctx.beginPath();
    ctx.arc(a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y), 0, Math.PI * 2);
    ctx.fillStyle = tint(d.style.color, 0.12);
    ctx.fill();
    ctx.stroke();
  },
};

export const arc: DrawingTool = {
  id: "arc",
  label: "호",
  group: "shape",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b, c] = px;
    stroke(ctx, d.style.color, d.style.width);
    if (b && !c) line(ctx, a, b);
    if (b && c) {
      // C 를 지나도록 조절점을 잡은 2차 곡선
      const ctrl = { x: 2 * c.x - (a.x + b.x) / 2, y: 2 * c.y - (a.y + b.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, b.x, b.y);
      ctx.stroke();
    }
    dots(ctx, px, d.style.color);
  },
};

export const curve: DrawingTool = {
  id: "curve",
  label: "곡선",
  group: "shape",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b, c] = px;
    stroke(ctx, d.style.color, d.style.width);
    if (b && !c) line(ctx, a, b);
    if (b && c) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
      stroke(ctx, d.style.color, 1, [3, 3]);
      poly(ctx, [a, c, b]);
    }
    dots(ctx, px, d.style.color);
  },
};

export const doubleCurve: DrawingTool = {
  id: "double-curve",
  label: "이중 곡선",
  group: "shape",
  pointCount: 4,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b, c, e] = px;
    stroke(ctx, d.style.color, d.style.width);
    if (!e) poly(ctx, px);
    else {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(b.x, b.y, c.x, c.y, e.x, e.y);
      ctx.stroke();
    }
    dots(ctx, px, d.style.color);
  },
};

// ───────── 글

export const textTool: DrawingTool = {
  id: "text",
  label: "텍스트",
  group: "text",
  pointCount: 1,
  needsText: true,
  schemaVersion: 1,
  draw(ctx, px, d) {
    label(ctx, d.text || "텍스트", px[0].x, px[0].y, { color: d.style.color, size: 14, bold: true });
  },
};

export const noteTool: DrawingTool = {
  id: "note",
  label: "노트",
  group: "text",
  pointCount: 1,
  needsText: true,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const p = px[0];
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    textBox(ctx, d.text || "노트", p.x + 8, p.y - 30, { color: "#191919", bg: "#fff9db", border: "#f2d675" });
  },
};

export const calloutTool: DrawingTool = {
  id: "callout",
  label: "말풍선",
  group: "text",
  pointCount: 2,
  needsText: true,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return dots(ctx, px, d.style.color);
    const box = textBox(ctx, d.text || "말풍선", b.x, b.y, { color: "#fff", bg: d.style.color });
    // 상자에서 지점으로 꼬리
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.moveTo(b.x + box.w / 2 - 6, b.y + box.h / 2);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x + box.w / 2 + 6, b.y + box.h / 2);
    ctx.closePath();
    ctx.fill();
    textBox(ctx, d.text || "말풍선", b.x, b.y, { color: "#fff", bg: d.style.color });
  },
};

export const pinTool: DrawingTool = {
  id: "pin",
  label: "핀",
  group: "text",
  pointCount: 1,
  needsText: true,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const { x, y } = px[0];
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.arc(x, y - 18, 8, Math.PI, 0);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y - 18, 3, 0, Math.PI * 2);
    ctx.fill();
    if (d.text) label(ctx, d.text, x, y - 34, { align: "center", bg: "rgba(255,255,255,0.95)", color: "#191919" });
  },
};

export const priceNote: DrawingTool = {
  id: "price-note",
  label: "가격 노트",
  group: "text",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    stroke(ctx, d.style.color, 1);
    if (b) line(ctx, a, b);
    anchor(ctx, a, d.style.color);
    if (b) label(ctx, `${won(priceOf(d, 0))}원`, b.x, b.y, { bg: d.style.color, color: "#fff", bold: true });
  },
};

export const priceLabel: DrawingTool = {
  id: "price-label",
  label: "가격 라벨",
  group: "text",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const { x, y } = px[0];
    const text = `${won(priceOf(d, 0))}`;
    ctx.font = "700 11px Pretendard, sans-serif";
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8, y - 10);
    ctx.lineTo(x + 8 + w, y - 10);
    ctx.lineTo(x + 8 + w, y + 10);
    ctx.lineTo(x + 8, y + 10);
    ctx.closePath();
    ctx.fill();
    label(ctx, text, x + 15, y, { color: "#fff", bold: true });
  },
};

export const flagTool: DrawingTool = {
  id: "flag",
  label: "깃발",
  group: "text",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const { x, y } = px[0];
    stroke(ctx, "#495057", 1.5);
    line(ctx, { x, y }, { x, y: y - 26 });
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.moveTo(x, y - 26);
    ctx.lineTo(x + 16, y - 21);
    ctx.lineTo(x, y - 15);
    ctx.closePath();
    ctx.fill();
  },
};

export const signpost: DrawingTool = {
  id: "signpost",
  label: "안내판",
  group: "text",
  pointCount: 1,
  needsText: true,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const { x, y } = px[0];
    stroke(ctx, d.style.color, 1, [3, 3]);
    line(ctx, { x, y }, { x, y: Math.max(18, y - 70) });
    anchor(ctx, { x, y }, d.style.color);
    label(ctx, d.text || "안내판", x, Math.max(18, y - 70), { align: "center", bg: d.style.color, color: "#fff", bold: true });
  },
};
