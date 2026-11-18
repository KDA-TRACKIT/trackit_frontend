// 피보나치 되돌림 (트레이딩뷰처럼: 레벨마다 다른 색 선 + 레벨 사이 반투명 띠 + 왼쪽 가격 글자)
import type { DrawingTool } from "../types";
import { fibColor, lvText, tint, won } from "./draw-utils";

const LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];

export const fibRetracement: DrawingTool = {
  id: "fib-retracement",
  label: "피보나치 되돌림",
  group: "fib",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, drawing) {
    if (px.length < 2) return;
    const [a, b] = px;
    const priceA = Number(drawing.points[0].price);
    const priceB = Number(drawing.points[1].price);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    // 0 = 끝점(b), 1 = 시작점(a)
    const yOf = (lv: number) => b.y + (a.y - b.y) * lv;
    const priceOf = (lv: number) => priceB + (priceA - priceB) * lv;

    // 레벨 사이 띠
    for (let i = 0; i < LEVELS.length - 1; i++) {
      const y1 = yOf(LEVELS[i]);
      const y2 = yOf(LEVELS[i + 1]);
      ctx.fillStyle = tint(fibColor(LEVELS[i + 1]), 0.12);
      ctx.fillRect(left, Math.min(y1, y2), right - left, Math.abs(y2 - y1));
    }
    // 레벨 선 + 글자
    ctx.setLineDash([]);
    ctx.font = "500 11px Pretendard, sans-serif";
    ctx.textBaseline = "middle";
    // 왼쪽 바깥에 자리가 없으면(차트 왼쪽 끝) 상자 안쪽에 글자
    const widest = Math.max(...LEVELS.map((lv) => ctx.measureText(`${lvText(lv)} (${won(priceOf(lv))})`).width));
    const outside = left - 6 - widest > 2;
    ctx.textAlign = outside ? "right" : "left";
    for (const lv of LEVELS) {
      const y = yOf(lv);
      const color = fibColor(lv);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, drawing.style.width - 0.5);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = color;
      if (outside) ctx.fillText(`${lvText(lv)} (${won(priceOf(lv))})`, left - 6, y);
      else ctx.fillText(`${lvText(lv)} (${won(priceOf(lv))})`, left + 4, y - 7);
    }
    ctx.textAlign = "left";
    // 시작-끝 추세선 (점선)
    ctx.strokeStyle = tint(drawing.style.color, 0.8);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  },
};
