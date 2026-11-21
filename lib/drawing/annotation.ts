// 화면 드로잉(Drawing) · 차트 노트 ↔ 백엔드 주석(ChartDrawing) 변환
import type { ChartNote } from "../mock/workshop";
import type { ChartDrawing, ChartDrawingType } from "../types/chart";
import type { Drawing } from "./types";

/** 툴 id → 백엔드 AnnotationType. 목록에 없는 툴(피보나치 등)은 OTHER */
const TYPE_BY_TOOL: Record<string, ChartDrawingType> = {
  trendline: "LINE",
  ray: "LINE",
  "extended-line": "LINE",
  "horizontal-ray": "HORIZONTAL_LINE",
  "arrow-up": "MARKER",
  "arrow-down": "MARKER",
  "cross-line": "OTHER",
  "info-line": "LINE",
  "trend-angle": "LINE",
  "rotated-rectangle": "RECTANGLE",
  text: "TEXT",
  note: "TEXT",
  callout: "TEXT",
  pin: "MARKER",
  flag: "MARKER",
  "arrow-marker": "ARROW",
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
    payload: { toolId: d.toolId, schemaVersion: d.schemaVersion, points: d.points, style: d.style, ...(d.text ? { text: d.text } : {}), ...(d.locked ? { locked: true } : {}), ...(d.hidden ? { hidden: true } : {}), ...(d.intervals?.length ? { intervals: d.intervals } : {}) },
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
    // 차트 노트는 toolId 가 없는 TEXT (텍스트·노트 드로잉은 toolId 가 있어 드로잉으로 되살린다)
    if (a.type === "TEXT" && typeof p.text === "string" && typeof p.toolId !== "string") {
      notes.push({ id: idOf(a), text: p.text, time: Number(p.time), price: Number(p.price), createdAt: String(p.createdAt ?? "") });
    } else if (typeof p.toolId === "string" && Array.isArray(p.points)) {
      drawings.push({
        id: idOf(a),
        toolId: p.toolId,
        schemaVersion: Number(p.schemaVersion ?? 1),
        points: p.points as Drawing["points"],
        style: (p.style as Drawing["style"]) ?? { color: "#2962ff", width: 1.5 },
        ...(typeof p.text === "string" ? { text: p.text } : {}),
        ...(p.locked === true ? { locked: true } : {}),
        ...(p.hidden === true ? { hidden: true } : {}),
        ...(Array.isArray(p.intervals) && p.intervals.length ? { intervals: (p.intervals as unknown[]).filter((x): x is string => typeof x === "string") } : {}),
      });
    }
  }
  return { drawings, notes };
}
