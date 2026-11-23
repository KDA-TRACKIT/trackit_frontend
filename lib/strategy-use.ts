// 내 체결을 한 번의 매매(매수 → 매도)로 짝짓기 — 내 노트 복기형(ReviewView) · 자기 복기(self-review)에서 씀
//   (2026-11-23: '구독한 전략 활용하기'를 없애면서 그 기능에서만 쓰던 상황 비교 · 겹치기 · 같은 상황 알림은 뺌)

/** entry.at = 첫 매수 체결 시각 (KST "YYYY-MM-DD HH:MM:SS") — 그 전에 쓴 노트만 계획으로 치려고 */
export type MyRound = { symbol: string; entry: { d: string; px: number; at?: string }; exit: { d: string; px: number } | null; ret: number | null; days: number | null };

/** 내 체결(매수 · 매도)을 종목마다 먼저 산 것부터 짝지어 한 번의 매매로 */
export function pairTrades(trades: { symbol: string; side: "BUY" | "SELL"; price: string; quantity: string; executedAt: string }[]): MyRound[] {
  const kst = (s: string) => new Date(Date.parse(s) + 9 * 3_600_000).toISOString().slice(0, 10);
  const kstAt = (s: string) => new Date(Date.parse(s) + 9 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
  const bySym = new Map<string, typeof trades>();
  for (const t of [...trades].sort((a, b) => a.executedAt.localeCompare(b.executedAt))) bySym.set(t.symbol, [...(bySym.get(t.symbol) ?? []), t]);
  const out: MyRound[] = [];
  for (const [symbol, list] of bySym) {
    let open = null as { d: string; at: string; px: number; qty: number; cost: number } | null;
    for (const t of list) {
      const px = Number(t.price);
      const qty = Number(t.quantity);
      if (t.side === "BUY") {
        open = open ? { ...open, qty: open.qty + qty, cost: open.cost + px * qty } : { d: kst(t.executedAt), at: kstAt(t.executedAt), px, qty, cost: px * qty };
      } else if (open) {
        const avg: number = open.cost / open.qty;
        const d = kst(t.executedAt);
        out.push({ symbol, entry: { d: open.d, px: avg, at: open.at }, exit: { d, px }, ret: (px / avg - 1) * 100, days: Math.round((Date.parse(d) - Date.parse(open.d)) / 86_400_000) });
        open = open.qty - qty > 0 ? { ...open, qty: open.qty - qty, cost: avg * (open.qty - qty) } : null;
      }
    }
    if (open) out.push({ symbol, entry: { d: open.d, px: open.cost / open.qty, at: open.at }, exit: null, ret: null, days: null });
  }
  return out.sort((a, b) => b.entry.d.localeCompare(a.entry.d));
}
