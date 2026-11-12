// 가격·기간 측정: 두 점 사이 등락(원·%)과 기간
import type { DrawingTool } from "../types";

export const priceRange: DrawingTool = {
  id: "price-range",
  label: "가격·기간 측정",
  group: "measure",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing) {
    if (px.length < 2) return;
    const [a, b] = px;
    const from = Number(drawing.points[0].price);
    const to = Number(drawing.points[1].price);
    const diff = to - from;
    const rate = from ? (diff / from) * 100 : 0;
    const up = diff >= 0;
    const color = up ? "#089981" : "#f23645";
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.fillStyle = up ? "rgba(8,153,129,0.08)" : "rgba(242,54,69,0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 기간 (일봉은 일, 분봉은 시간·분)
    const seconds = Math.abs(drawing.points[1].time - drawing.points[0].time);
    const span = seconds >= 86400 ? `${Math.round(seconds / 86400)}일` : seconds >= 3600 ? `${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분` : `${Math.round(seconds / 60)}분`;
    const label = `${up ? "+" : ""}${Math.round(diff).toLocaleString("ko-KR")}원 (${up ? "+" : ""}${rate.toFixed(2)}%) · ${span}`;
    ctx.font = "600 11.5px Pretendard, sans-serif";
    const tw = ctx.measureText(label).width + 12;
    const lx = x + w / 2 - tw / 2;
    const ly = up ? y - 24 : y + h + 4;
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly, tw, 20);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx + 6, ly + 10);
  },
};
