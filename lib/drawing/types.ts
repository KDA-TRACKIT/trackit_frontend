// 드로잉 정본(canonical) 포맷.
// 노트 확정 시 이 구조 그대로 drawings에 들어가고 해시되므로, 필드 의미를 바꿀 땐 schemaVersion을 올린다.

/** 데이터 공간 좌표. time = 실제 시각(UTC 초), price = 원 단위 문자열(백엔드 숫자 규약) */
export type DrawingPoint = { time: number; price: string };

export type DrawingStyle = { color: string; width: number };

export type Drawing = {
  id: string;
  toolId: string;
  schemaVersion: number;
  points: DrawingPoint[];
  style: DrawingStyle;
  /** 텍스트·노트·말풍선처럼 글이 들어가는 툴만 */
  text?: string;
  /** 잠금: 고를 순 있지만 끌어서 옮기거나 점을 바꿀 수 없음 (선택 막대의 자물쇠로 풂) */
  locked?: boolean;
};

/** 왼쪽 도구 바의 그룹 */
/** hidden: 메뉴에는 없고 예전에 그린 것만 그리는 툴 (브러시 · 형광펜) */
export type ToolGroup = "line" | "fib" | "pattern" | "measure" | "brush" | "arrow" | "shape" | "text" | "hidden";

export type PixelPoint = { x: number; y: number };

/** 그릴 때 쓰는 봉 (봉 데이터가 필요한 툴: 회귀 채널·VWAP·매물대·날짜 범위) */
export type ViewBar = { time: number; open: number; high: number; low: number; close: number; volume: number };

/** 렌더 시점의 화면 정보 */
export type ViewInfo = {
  width: number;
  height: number;
  /** 차트에 올라간 봉 (오래된 것 → 최신) */
  bars: ViewBar[];
  /** 실제 시각(UTC 초) → x. 마지막 봉 뒤(미래)도 봉 간격으로 늘려 계산 */
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
  yToPrice: (y: number) => number | null;
};

export interface DrawingTool {
  /** 저장되는 값. 한 번 쓰이면 바꾸지 않는다 */
  id: string;
  label: string;
  group: ToolGroup;
  /** 메뉴 안 소제목 (예: 채널, 피치포크, 엘리엇 파동) */
  section?: string;
  /**
   * points(기본): pointCount 번 클릭하면 완성
   * multi: 클릭할 때마다 점 추가, 더블클릭·Enter 로 완성 (pointCount = 최소 점 수)
   * free: 누른 채 끌어서 그림 (브러시)
   */
  mode?: "points" | "multi" | "free";
  /** 몇 번 클릭하면 완성되는지 (multi 는 최소 점 수) */
  pointCount: number;
  /** 점을 다 찍으면 글 입력창을 띄운다 */
  needsText?: boolean;
  schemaVersion: number;
  /** px는 points와 같은 순서의 화면 좌표 */
  draw(ctx: CanvasRenderingContext2D, px: PixelPoint[], drawing: Drawing, view: ViewInfo): void;
  /** 선택·삭제용 (아직 미사용) */
  hitTest?(px: PixelPoint[], cursor: PixelPoint): boolean;
}
