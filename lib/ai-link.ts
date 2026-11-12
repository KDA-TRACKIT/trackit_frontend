// 메모 ↔ 체결 연결 추천 (AI 노트)
//   실제 연결 지점: 백엔드 AI가 메모 내용·시각과 체결 내역을 보고 추천 → POST /api/v1/ai/link-suggestions (아직 없음)
//   지금은 시각만 보는 규칙으로 대신한다.
//   - 사전: 메모 뒤에 처음 나온 체결 → 판정이 분명해서 "확실"
//   - 사후: 체결 뒤에 쓴 메모 → 어느 매매를 돌아본 건지 시각만으로는 애매해서 "확인 필요"
export type Execution = { id: string; time: string; side: string; quantity: number; price?: number };
export type LinkSuggestion = { execution: Execution; kind: "pre" | "post"; confidence: "high" | "low"; reason: string };

const minutes = (t: string) => {
  const [h, m, s] = t.split(":").map(Number);
  return h * 60 + m + (s || 0) / 60;
};

export function suggestLink(noteTime: string, executions: Execution[]): LinkSuggestion | null {
  const after = executions.filter((e) => e.time >= noteTime).sort((a, b) => a.time.localeCompare(b.time));
  if (after[0]) {
    const gap = Math.round(minutes(after[0].time) - minutes(noteTime));
    return { execution: after[0], kind: "pre", confidence: "high", reason: `메모 ${gap}분 뒤 첫 체결이에요.` };
  }
  const before = executions.filter((e) => e.time < noteTime).sort((a, b) => b.time.localeCompare(a.time));
  if (before[0]) {
    const gap = Math.round(minutes(noteTime) - minutes(before[0].time));
    return { execution: before[0], kind: "post", confidence: "low", reason: `체결 ${gap}분 뒤에 쓴 메모예요. 같은 매매를 돌아본 건지 확인해 주세요.` };
  }
  return null;
}
