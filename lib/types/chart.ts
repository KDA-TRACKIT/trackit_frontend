// 차트 드로잉 · 주석 (백엔드 ChartAnnotation.type 과 같은 값)
export type ChartDrawingType = "LINE" | "ARROW" | "RECTANGLE" | "HORIZONTAL_LINE" | "VERTICAL_LINE" | "TEXT" | "MARKER" | "OTHER";

export type ChartDrawing = {
  id: string;
  type: ChartDrawingType;
  payload: Record<string, unknown>;
};

/** 백엔드 GET /journals/:id/annotations 한 건 */
export type ChartAnnotation = ChartDrawing & { journalId: string; createdAt: string; updatedAt?: string };
