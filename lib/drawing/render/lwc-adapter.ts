// 등록된 드로잉 툴을 lightweight-charts에 그리는 어댑터.
// 차트 라이브러리를 바꾸면 이 파일만 다시 작성하면 된다.
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { getTool } from "../registry";
import type { Drawing, PixelPoint, ViewBar, ViewInfo } from "../types";

// 차트는 KST 벽시계 기준 시각(UTC+9 만큼 민 값)으로 그린다 (lightweight-charts 공식 권장 방식).
// 저장 포맷은 실제 시각이므로 경계에서만 변환한다.
const KST_OFFSET = 9 * 60 * 60;
export const toChartTime = (utcSeconds: number) => (utcSeconds + KST_OFFSET) as UTCTimestamp;
export const fromChartTime = (chartTime: Time) => (chartTime as number) - KST_OFFSET;

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export class DrawingLayer implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time> | null = null;
  private drawings: Drawing[] = [];
  private preview: Drawing | null = null;
  private bars: ViewBar[] = [];
  private selectedId: string | null = null;
  /** 마우스가 올라간 드로잉 (누를 수 있다는 표시) */
  private hoveredId: string | null = null;
  // 라이브러리가 배열 참조로 캐시하므로 같은 배열을 계속 돌려준다
  private readonly views: IPrimitivePaneView[] = [new DrawingPaneView(this)];

  attached(param: SeriesAttachedParameter<Time>) {
    this.param = param;
  }

  detached() {
    this.param = null;
  }

  paneViews() {
    return this.views;
  }

  setDrawings(drawings: Drawing[]) {
    this.drawings = drawings;
    this.param?.requestUpdate();
  }

  setPreview(preview: Drawing | null) {
    this.preview = preview;
    this.param?.requestUpdate();
  }

  /** 선택한 드로잉 (끝점에 손잡이를 그린다) */
  setSelected(id: string | null) {
    this.selectedId = id;
    this.param?.requestUpdate();
  }

  selected() {
    return this.selectedId;
  }

  setHovered(id: string | null) {
    if (this.hoveredId === id) return;
    this.hoveredId = id;
    this.param?.requestUpdate();
  }

  hovered() {
    return this.hoveredId;
  }

  /** 화면 좌표에 걸리는 드로잉 id (위에 그려진 것 먼저). 없으면 null */
  drawingAt(x: number, y: number): string | null {
    const cursor = { x, y };
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      const tool = getTool(d.toolId);
      const px = this.toPixels(d);
      if (!tool || !px) continue;
      if (tool.hitTest ? tool.hitTest(px, cursor) : defaultHit(px, cursor, tool.group)) return d.id;
    }
    return null;
  }

  /** 선택한 드로잉의 점 중 커서 가까이 있는 점 번호 (점 하나만 옮길 때) */
  handleAt(id: string, x: number, y: number): number | null {
    const d = this.drawings.find((it) => it.id === id);
    const px = d ? this.toPixels(d) : null;
    if (!px) return null;
    const i = px.findIndex((p) => Math.hypot(p.x - x, p.y - y) <= HANDLE_PX);
    return i >= 0 ? i : null;
  }

  /** 캔들 시리즈와 같은 봉 배열 (논리 인덱스 = 배열 인덱스) */
  setBars(bars: ViewBar[]) {
    this.bars = bars;
  }

  items() {
    return this.preview ? [...this.drawings, this.preview] : this.drawings;
  }

  /** 봉 간격(초): 최근 봉들의 간격 중앙값 */
  private step() {
    const b = this.bars;
    const diffs: number[] = [];
    for (let i = Math.max(1, b.length - 20); i < b.length; i++) diffs.push(b[i].time - b[i - 1].time);
    diffs.sort((x, y) => x - y);
    return diffs[Math.floor(diffs.length / 2)] || 86400;
  }

  /** 실제 시각 → 논리 인덱스 (봉 사이·앞·뒤도 이어서 계산) */
  timeToLogical(time: number): number | null {
    const b = this.bars;
    if (!b.length) return null;
    const last = b.length - 1;
    if (time >= b[last].time) return last + (time - b[last].time) / this.step();
    if (time <= b[0].time) return (time - b[0].time) / this.step();
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (b[mid].time <= time) lo = mid;
      else hi = mid;
    }
    const span = b[hi].time - b[lo].time;
    return lo + (span ? (time - b[lo].time) / span : 0);
  }

  timeToX(time: number): number | null {
    if (!this.param) return null;
    const logical = this.timeToLogical(time);
    return logical === null ? null : this.param.chart.timeScale().logicalToCoordinate(logical as Logical);
  }

  /** x → 실제 시각. 봉이 있는 구간은 가장 가까운 봉, 그 밖은 봉 간격으로 늘린 시각 */
  xToTime(x: number): number | null {
    if (!this.param || !this.bars.length) return null;
    const logical = this.param.chart.timeScale().coordinateToLogical(x);
    if (logical === null) return null;
    const i = Math.round(logical);
    const last = this.bars.length - 1;
    if (i >= 0 && i <= last) return this.bars[i].time;
    return i > last ? this.bars[last].time + (i - last) * this.step() : this.bars[0].time + i * this.step();
  }

  priceToY(price: number) {
    return this.param?.series.priceToCoordinate(price) ?? null;
  }

  yToPrice(y: number) {
    return this.param?.series.coordinateToPrice(y) ?? null;
  }

  /** 데이터 좌표 → 화면 좌표. 계산이 안 되면 null */
  toPixels(drawing: Drawing): PixelPoint[] | null {
    const result: PixelPoint[] = [];
    for (const point of drawing.points) {
      const x = this.timeToX(point.time);
      const y = this.priceToY(Number(point.price));
      if (x === null || y === null) return null;
      result.push({ x, y });
    }
    return result;
  }

  view(width: number, height: number): ViewInfo {
    return {
      width,
      height,
      bars: this.bars,
      timeToX: (t) => this.timeToX(t),
      priceToY: (p) => this.priceToY(p),
      yToPrice: (y) => this.yToPrice(y),
    };
  }
}

class DrawingPaneView implements IPrimitivePaneView {
  constructor(private readonly layer: DrawingLayer) {}

  zOrder() {
    return "top" as const;
  }

  renderer() {
    return new DrawingRenderer(this.layer);
  }
}

class DrawingRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly layer: DrawingLayer) {}

  draw(target: Target) {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const view = this.layer.view(mediaSize.width, mediaSize.height);
      const selected = this.layer.selected();
      const hovered = this.layer.hovered();
      for (const drawing of this.layer.items()) {
        const tool = getTool(drawing.toolId);
        const px = this.layer.toPixels(drawing);
        if (!tool || !px) continue;
        context.save();
        try {
          tool.draw(context, px, drawing, view);
        } catch {
          // 툴 하나가 잘못 그려도 나머지 드로잉은 계속 그린다
        }
        context.restore();
        if (drawing.id === "preview" || (drawing.id === hovered && drawing.id !== selected)) {
          // 마우스를 올리면 점마다 옅은 손잡이 → 누를 수 있다는 표시
          context.save();
          context.setLineDash([]);
          context.lineWidth = 1;
          context.strokeStyle = "rgba(41,98,255,0.7)";
          context.fillStyle = "rgba(255,255,255,0.9)";
          for (const p of px) {
            context.beginPath();
            context.arc(p.x, p.y, 4, 0, Math.PI * 2);
            context.fill();
            context.stroke();
          }
          context.restore();
        }
        if (drawing.id === selected) {
          // 선택 표시: 점마다 손잡이
          context.save();
          context.setLineDash([]);
          context.lineWidth = 1.5;
          context.strokeStyle = "#2962ff";
          context.fillStyle = "#fff";
          for (const p of px) {
            context.beginPath();
            context.rect(p.x - 4.5, p.y - 4.5, 9, 9);
            context.fill();
            context.stroke();
          }
          context.restore();
        }
      }
    });
  }
}

/** 선을 누른 것으로 보는 거리(px). 얇은 선도 확실히 잡히게 넉넉히 */
const HIT_PX = 9;
const HANDLE_PX = 9;

const distToSegment = (p: PixelPoint, a: PixelPoint, b: PixelPoint) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** 기본 판정: 점·선분 가까이, 면이 있는 툴(도형·측정·피보나치)은 점들을 감싼 사각형 안도 */
function defaultHit(px: PixelPoint[], c: PixelPoint, group: string) {
  if (px.length === 1) return Math.hypot(px[0].x - c.x, px[0].y - c.y) <= 18 || (c.x >= px[0].x - 4 && c.x <= px[0].x + 120 && Math.abs(c.y - px[0].y) <= 12 && group === "text");
  if (px.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= HANDLE_PX)) return true;
  for (let i = 1; i < px.length; i++) if (distToSegment(c, px[i - 1], px[i]) <= HIT_PX) return true;
  if (px.length >= 3 && distToSegment(c, px[px.length - 1], px[0]) <= HIT_PX && group === "shape") return true;
  if (group === "shape" || group === "measure" || group === "fib") {
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    return c.x >= Math.min(...xs) && c.x <= Math.max(...xs) && c.y >= Math.min(...ys) && c.y <= Math.max(...ys);
  }
  return false;
}
