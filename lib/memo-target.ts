// 빠른 메모의 "무엇에 대한 메모" (증시 캘린더에서 항목을 누르면 그 항목이 됨)
//   화면 요소에 data-memo 로 달아 두면, 메모 창이 열려 있을 때 그 요소를 누른 게 메모 대상이 된다
export type MemoTarget =
  | { kind: "stock"; code: string; name: string; note?: string }
  | { kind: "topic"; topic: string; label: string };

/** <div {...memoAttr({...})}> 처럼 쓴다 */
export function memoAttr(target: MemoTarget) {
  return { "data-memo": JSON.stringify(target) };
}

export function parseMemo(raw: string | undefined | null): MemoTarget | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as MemoTarget;
    return t && (t.kind === "stock" || t.kind === "topic") ? t : null;
  } catch {
    return null;
  }
}

export const targetLabel = (t: MemoTarget) => (t.kind === "stock" ? `${t.name} · ${t.code}${t.note ? ` · ${t.note}` : ""}` : `${t.topic} · ${t.label}`);
