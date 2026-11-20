// 월 구독 계산 (2026-11-20, 구독 대체). 화면(lib/purchases)과 서버(/strategy-data)가 같이 씀
//   결제가 승인된 때부터 30일 동안 그 트레이더의 모든 전략을 봄. 기간 중에 또 결제하면 끝나는 날부터 30일 이어짐
//   결제 기록은 예전 구독과 같은 곳(서버 strategy_passes)에 쌓임
export type PaidRecord = { traderId: string; approvedAt: string | null; used?: { month: string } | null };

export const SUB_DAYS = 30;

export function subscriptionEnd(passes: PaidRecord[], traderId: string): Date | null {
  const paid = passes
    .filter((p) => p.traderId === traderId && p.approvedAt)
    .map((p) => Date.parse(p.approvedAt!))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  let end = 0;
  for (const t of paid) end = Math.max(end, t) + SUB_DAYS * 86_400_000;
  return end ? new Date(end) : null;
}

export const subscribed = (passes: PaidRecord[], traderId: string, now = Date.now()) => (subscriptionEnd(passes, traderId)?.getTime() ?? 0) > now;

/** 이 트레이더의 이 달 전략을 볼 수 있는지: 구독 중이거나, 예전 구독으로 연 달 */
export const canView = (passes: PaidRecord[], traderId: string, month: string) =>
  subscribed(passes, traderId) || passes.some((p) => p.traderId === traderId && p.used?.month === month);
