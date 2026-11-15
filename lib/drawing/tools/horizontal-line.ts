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
    // 가격은 오른쪽 가격 축에 칸으로 표시 (lwc-adapter 의 priceAxisViews — 현재가·평단가 칸과 같은 크기)
  },
};
