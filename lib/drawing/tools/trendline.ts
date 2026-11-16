import type { DrawingTool } from "../types";

export const trendLine: DrawingTool = {
  id: "trendline",
  label: "추세선",
  group: "line",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing) {
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.width;
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    if (px[1]) ctx.lineTo(px[1].x, px[1].y);
    ctx.stroke();
  },
};
