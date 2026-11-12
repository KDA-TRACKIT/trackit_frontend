// 수직선 · 화살표 · 사각형 · 마커
import type { DrawingTool } from "../types";

export const verticalLine: DrawingTool = {
  id: "vertical-line",
  label: "수직선",
  group: "line",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, drawing, view) {
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.width;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(px[0].x, 0);
    ctx.lineTo(px[0].x, view.height);
    ctx.stroke();
    ctx.setLineDash([]);
  },
};

export const arrow: DrawingTool = {
  id: "arrow",
  label: "화살표",
  group: "arrow",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing) {
    const [a, b] = px;
    if (!b) return;
    ctx.strokeStyle = drawing.style.color;
    ctx.fillStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.width + 0.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // 끝점 화살촉
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const size = 11;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - size * Math.cos(angle - Math.PI / 7), b.y - size * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(b.x - size * Math.cos(angle + Math.PI / 7), b.y - size * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  },
};

export const marker: DrawingTool = {
  id: "marker",
  label: "마커",
  group: "arrow",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, drawing) {
    const { x, y } = px[0];
    // 아래를 가리키는 핀
    ctx.fillStyle = drawing.style.color;
    ctx.beginPath();
    ctx.arc(x, y - 16, 7, Math.PI, 0);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y - 16, 2.6, 0, Math.PI * 2);
    ctx.fill();
  },
};

export const rectangle: DrawingTool = {
  id: "rectangle",
  label: "사각형",
  group: "shape",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing) {
    const [a, b] = px;
    if (!b) return;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.fillStyle = "rgba(41, 98, 255, 0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.width;
    ctx.strokeRect(x, y, w, h);
  },
};
