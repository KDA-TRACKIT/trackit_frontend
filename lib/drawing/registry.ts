import type { Drawing, DrawingTool, ToolGroup } from "./types";

const tools = new Map<string, DrawingTool>();

/** 같은 id로 다시 등록하면 덮어쓴다 (개발 중 핫 리로드 대응) */
export function registerTool(tool: DrawingTool) {
  tools.set(tool.id, tool);
}

export function getTool(id: string) {
  return tools.get(id);
}

export function toolsByGroup(group: ToolGroup) {
  return [...tools.values()].filter((tool) => tool.group === group);
}

/** 해시 입력용 직렬화: 키 순서를 고정해 같은 드로잉이면 항상 같은 문자열이 나오게 한다 */
export function serializeDrawings(drawings: Drawing[]) {
  return JSON.stringify(
    drawings.map((d) => ({
      id: d.id,
      toolId: d.toolId,
      schemaVersion: d.schemaVersion,
      points: d.points.map((p) => ({ time: p.time, price: p.price })),
      style: { color: d.style.color, width: d.style.width },
    })),
  );
}
