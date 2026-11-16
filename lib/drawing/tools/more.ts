// 추가 드로잉 툴: 반직선·연장선·수평 반직선·평행 채널 / 피보나치 확장 / 삼각형·ABCD /
// 상승·하락 표시 / 타원
// 미리보기 중에는 px 가 pointCount 보다 적게 올 수 있으니 있는 점까지만 그린다
import type { DrawingTool, PixelPoint, ViewInfo } from "../types";
import { anchor, dots } from "./draw-utils";

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
}


/** a→b 방향으로 화면 끝까지 늘린 점 */
function extendTo(a: PixelPoint, b: PixelPoint, view: ViewInfo): PixelPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  const big = (view.width + view.height) * 4;
  const len = Math.hypot(dx, dy);
  return { x: a.x + (dx / len) * big, y: a.y + (dy / len) * big };
}

function line(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

export const ray: DrawingTool = {
  id: "ray",
  label: "반직선",
  group: "line",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    if (px[1]) line(ctx, px[0], extendTo(px[0], px[1], view));
    dots(ctx, px);
  },
};

export const extendedLine: DrawingTool = {
  id: "extended-line",
  label: "연장선",
  group: "line",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    if (px[1]) line(ctx, extendTo(px[1], px[0], view), extendTo(px[0], px[1], view));
    dots(ctx, px);
  },
};

export const horizontalRay: DrawingTool = {
  id: "horizontal-ray",
  label: "수평 반직선",
  group: "line",
  pointCount: 1,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    line(ctx, px[0], { x: view.width, y: px[0].y });
    ctx.fillStyle = d.style.color;
    ctx.font = "11px Pretendard, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(won(Number(d.points[0].price)), px[0].x + 4, px[0].y - 3);
    anchor(ctx, px[0], d.style.color);
  },
};

export const parallelChannel: DrawingTool = {
  id: "parallel-channel",
  label: "평행 채널",
  group: "line",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    const [a, b, c] = px;
    if (!b) return dots(ctx, px);
    line(ctx, a, b);
    if (c) {
      // 세 번째 점은 평행선의 위치(세로 간격)만 정한다
      const off = c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / (b.x - a.x || 1));
      const a2 = { x: a.x, y: a.y + off };
      const b2 = { x: b.x, y: b.y + off };
      line(ctx, a2, b2);
      ctx.fillStyle = "rgba(41,98,255,0.07)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(a2.x, a2.y);
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([4, 4]);
      line(ctx, { x: a.x, y: a.y + off / 2 }, { x: b.x, y: b.y + off / 2 });
      ctx.setLineDash([]);
    }
    dots(ctx, px);
  },
};

const EXT_LEVELS = [0, 0.618, 1, 1.618, 2.618];

export const fibExtension: DrawingTool = {
  id: "fib-extension",
  label: "피보나치 확장",
  group: "fib",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d, view) {
    stroke(ctx, d.style.color, d.style.width);
    const [a, b, c] = px;
    if (b) line(ctx, a, b);
    if (b && c) {
      line(ctx, b, c);
      // A→B 움직임을 C에서 다시 투영
      const pa = Number(d.points[0].price);
      const pb = Number(d.points[1].price);
      const pc = Number(d.points[2].price);
      const pxPerWon = (b.y - a.y) / (pb - pa || 1);
      ctx.font = "11px Pretendard, sans-serif";
      ctx.textBaseline = "bottom";
      for (const lv of EXT_LEVELS) {
        const price = pc + (pb - pa) * lv;
        const y = c.y + (price - pc) * pxPerWon;
        ctx.globalAlpha = lv === 0 || lv === 1 ? 1 : 0.6;
        line(ctx, { x: c.x, y }, { x: view.width, y });
        ctx.globalAlpha = 1;
        ctx.fillStyle = d.style.color;
        ctx.fillText(`${lv} (${won(price)})`, c.x + 4, y - 2);
      }
    }
    dots(ctx, px);
  },
};

export const triangle: DrawingTool = {
  id: "triangle",
  label: "삼각형",
  group: "pattern",
  pointCount: 3,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    ctx.beginPath();
    px.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (px.length === 3) {
      ctx.closePath();
      ctx.fillStyle = "rgba(41,98,255,0.08)";
      ctx.fill();
    }
    ctx.stroke();
    dots(ctx, px);
  },
};

export const abcd: DrawingTool = {
  id: "abcd",
  label: "ABCD 패턴",
  group: "pattern",
  pointCount: 4,
  schemaVersion: 1,
  draw(ctx, px, d) {
    stroke(ctx, d.style.color, d.style.width);
    ctx.beginPath();
    px.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    dots(ctx, px);
    ctx.fillStyle = d.style.color;
    ctx.font = "700 12px Pretendard, sans-serif";
    ctx.textAlign = "center";
    px.forEach((p, i) => {
      const up = i === 0 ? p.y < (px[1]?.y ?? p.y) : p.y < px[i - 1].y;
      ctx.textBaseline = up ? "bottom" : "top";
      ctx.fillText("ABCD"[i], p.x, p.y + (up ? -7 : 7));
    });
  },
};

function signArrow(up: boolean): DrawingTool {
  return {
    id: up ? "arrow-up" : "arrow-down",
    label: up ? "상승 표시" : "하락 표시",
    group: "arrow",
    pointCount: 1,
    schemaVersion: 1,
    draw(ctx, px) {
      const { x, y } = px[0];
      const color = up ? "#089981" : "#f23645";
      const dir = up ? 1 : -1; // 상승: 점 아래에서 위를 가리킴
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + 4 * dir);
      ctx.lineTo(x - 8, y + 14 * dir);
      ctx.lineTo(x - 3, y + 14 * dir);
      ctx.lineTo(x - 3, y + 24 * dir);
      ctx.lineTo(x + 3, y + 24 * dir);
      ctx.lineTo(x + 3, y + 14 * dir);
      ctx.lineTo(x + 8, y + 14 * dir);
      ctx.closePath();
      ctx.fill();
    },
  };
}
export const arrowUp = signArrow(true);
export const arrowDown = signArrow(false);

export const ellipse: DrawingTool = {
  id: "ellipse",
  label: "원",
  group: "shape",
  pointCount: 2,
  schemaVersion: 1,
  draw(ctx, px, d) {
    const [a, b] = px;
    if (!b) return;
    stroke(ctx, d.style.color, d.style.width);
    ctx.beginPath();
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(41,98,255,0.08)";
    ctx.fill();
    ctx.stroke();
  },
};
