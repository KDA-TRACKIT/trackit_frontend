import type { DrawingTool } from "../types";

const LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const fibRetracement: DrawingTool = {
  id: "fib-retracement",
  label: "피보나치 되돌림",
  group: "fib",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing) {
    // 미리보기에서 점이 하나뿐이면 선만 그린다
    if (px.length < 2) return;
    const [a, b] = px;
    const priceA = Number(drawing.points[0].price);
    const priceB = Number(drawing.points[1].price);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);

    ctx.font = "11px Pretendard, sans-serif";
    ctx.textBaseline = "bottom";
    for (const level of LEVELS) {
      // 0 = 끝점(b), 1 = 시작점(a)
      const y = b.y + (a.y - b.y) * level;
      const price = priceB + (priceA - priceB) * level;
      ctx.strokeStyle = drawing.style.color;
      ctx.globalAlpha = level === 0 || level === 1 ? 1 : 0.6;
      ctx.lineWidth = drawing.style.width;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = drawing.style.color;
      ctx.fillText(`${level} (${Math.round(price).toLocaleString("ko-KR")})`, left + 4, y - 2);
    }
    // 시작-끝 대각선 (점선)
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  },
};
