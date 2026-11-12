// 등록된 드로잉 툴을 lightweight-charts에 그리는 어댑터.
// 차트 라이브러리를 바꾸면 이 파일만 다시 작성하면 된다.
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { getTool } from "../registry";
import type { Drawing, PixelPoint } from "../types";

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

  items() {
    return this.preview ? [...this.drawings, this.preview] : this.drawings;
  }

  /** 데이터 좌표 → 화면 좌표. 화면 밖이라 계산이 안 되면 null */
  toPixels(drawing: Drawing): PixelPoint[] | null {
    if (!this.param) return null;
    const timeScale = this.param.chart.timeScale();
    const result: PixelPoint[] = [];
    for (const point of drawing.points) {
      const x = timeScale.timeToCoordinate(toChartTime(point.time));
      const y = this.param.series.priceToCoordinate(Number(point.price));
      if (x === null || y === null) return null;
      result.push({ x, y });
    }
    return result;
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
      for (const drawing of this.layer.items()) {
        const tool = getTool(drawing.toolId);
        const px = this.layer.toPixels(drawing);
        if (!tool || !px) continue;
        context.save();
        tool.draw(context, px, drawing, { width: mediaSize.width, height: mediaSize.height });
        context.restore();
      }
    });
  }
}
