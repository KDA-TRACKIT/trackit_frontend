// 월 구독 계산 (2026-11-20, 구독 대체). 화면(lib/purchases)과 서버(/strategy-data)가 같이 씀
//   결제가 승인된 때부터 30일 동안 그 트레이더의 모든 전략을 봄. 기간 중에 또 결제하면 끝나는 날부터 30일 이어짐
//   결제 기록은 예전 구독과 같은 곳(서버 strategy_passes)에 쌓임
export type PaidRecord = { traderId: string; approvedAt: string | null; used?: { month: string } | null };

/** 서버 구독 (GET /me/subscriptions, author_subscriptions 표) */
export type Subscription = { id: string; traderId: string; traderName: string; startsAt: string; endsAt: string; amount: number; orderId: string; receiptUrl: string | null; active: boolean };

/**
 * 구독 · 예전 결제 기록 → 화면에서 쓰는 기록 목록
 *   구독 한 건은 30일마다 한 줄 (시작 시각부터 이어 붙이면 끝나는 날이 그대로 나옴)
 *   예전 결제 기록은 이미 구독 표로 옮겨졌으므로 '예전에 연 달'만 남김 (기간을 두 번 세지 않게 approvedAt 을 비움)
 */
export function toRecords<T extends { id: string; traderId: string; traderName: string; orderId: string; amount: number; approvedAt: string | null; receiptUrl: string | null; used: { month: string; title: string; at: string } | null }>(
  subs: Subscription[],
  legacy: T[],
) {
  const fromSubs = subs.flatMap((s) => {
    const n = Math.max(1, Math.round((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / (SUB_DAYS * 86_400_000)));
    return Array.from({ length: n }, (_, k) => ({ id: `${s.id}#${k}`, traderId: s.traderId, traderName: s.traderName, orderId: s.orderId, amount: k ? 0 : s.amount, approvedAt: s.startsAt, receiptUrl: s.receiptUrl, used: null }));
  });
  return [...fromSubs, ...legacy.filter((p) => p.used).map((p) => ({ ...p, approvedAt: null }))];
}

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

/** 이 트레이더의 이 전략(전략 번호 s1 … 또는 달)을 볼 수 있는지: 구독 중이거나, 예전 구독으로 연 달 */
export const canView = (passes: PaidRecord[], traderId: string, month: string) =>
  subscribed(passes, traderId) || passes.some((p) => p.traderId === traderId && p.used?.month === month);
