// 화면 드로잉(Drawing) · 차트 노트 ↔ 백엔드 주석(ChartDrawing) 변환
import type { ChartNote } from "../mock/workshop";
import type { ChartDrawing, ChartDrawingType } from "../types/chart";
import type { Drawing } from "./types";

/** 툴 id → 백엔드 AnnotationType. 목록에 없는 툴(피보나치 등)은 OTHER */
const TYPE_BY_TOOL: Record<string, ChartDrawingType> = {
  trendline: "LINE",
  "horizontal-line": "HORIZONTAL_LINE",
  "vertical-line": "VERTICAL_LINE",
  arrow: "ARROW",
  rectangle: "RECTANGLE",
  marker: "MARKER",
  // price-range(측정)는 OTHER
};

export function drawingToAnnotation(d: Drawing): ChartDrawing {
  return {
    id: d.id,
    type: TYPE_BY_TOOL[d.toolId] ?? "OTHER",
    payload: { toolId: d.toolId, schemaVersion: d.schemaVersion, points: d.points, style: d.style },
  };
}

/** 차트 노트는 TEXT 주석 */
export function noteToAnnotation(n: ChartNote): ChartDrawing {
  return { id: n.id, type: "TEXT", payload: { text: n.text, time: n.time, price: n.price, createdAt: n.createdAt } };
}

/** 저장된 주석을 다시 화면 드로잉·노트로 */
export function fromAnnotations<T extends ChartDrawing>(list: T[], idOf: (a: T) => string) {
  const drawings: Drawing[] = [];
  const notes: ChartNote[] = [];
  for (const a of list) {
    const p = a.payload;
    if (a.type === "TEXT" && typeof p.text === "string") {
      notes.push({ id: idOf(a), text: p.text, time: Number(p.time), price: Number(p.price), createdAt: String(p.createdAt ?? "") });
    } else if (typeof p.toolId === "string" && Array.isArray(p.points)) {
      drawings.push({
        id: idOf(a),
        toolId: p.toolId,
        schemaVersion: Number(p.schemaVersion ?? 1),
        points: p.points as Drawing["points"],
        style: (p.style as Drawing["style"]) ?? { color: "#2962ff", width: 1.5 },
      });
    }
  }
  return { drawings, notes };
}
