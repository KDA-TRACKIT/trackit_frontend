import type { DrawingTool } from "../types";

export const horizontalLine: DrawingTool = {
  id: "horizontal-line",
  label: "수평선",
  group: "line",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, drawing, view) {
    const y = px[0].y;
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.width;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
    // 오른쪽 끝 가격 표시
    const text = Number(drawing.points[0].price).toLocaleString("ko-KR");
    ctx.font = "11px Pretendard, sans-serif";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = drawing.style.color;
    ctx.fillRect(view.width - w - 4, y - 9, w, 18);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, view.width - w + 1, y);
  },
};
