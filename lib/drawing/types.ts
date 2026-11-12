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
};

/** 왼쪽 도구 바의 그룹 (피그마 순서) */
export type ToolGroup = "line" | "fib" | "pattern" | "measure" | "brush" | "arrow" | "shape";

export type PixelPoint = { x: number; y: number };

/** 렌더 시점의 화면 정보 */
export type ViewInfo = { width: number; height: number };

export interface DrawingTool {
  /** 저장되는 값. 한 번 쓰이면 바꾸지 않는다 */
  id: string;
  label: string;
  group: ToolGroup;
  /** 몇 번 클릭하면 완성되는지 */
  pointCount: number;
  schemaVersion: number;
  /** px는 points와 같은 순서의 화면 좌표 */
  draw(ctx: CanvasRenderingContext2D, px: PixelPoint[], drawing: Drawing, view: ViewInfo): void;
  /** 선택·삭제용 (아직 미사용) */
  hitTest?(px: PixelPoint[], cursor: PixelPoint): boolean;
}
