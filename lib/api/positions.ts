// 내 보유 포지션. 로그인 전이면 없음
//   1) 연결한 증권사 계좌의 보유 종목 (Supabase 에 저장된 잔고, 1분 넘으면 백엔드가 증권사에서 새로 받음)
//   2) 없으면 매매일지 포지션 (GET /positions?status=OPEN)
import { accessToken, apiRequest } from "./client";
import { freshPortfolio, orderAccounts } from "./orders";

/** 연결한 증권사 계좌들에서 이 종목 보유 수량·평균 단가 (계좌 여러 개면 수량 가중 평균) */
export async function brokerHolding(symbol: string, force = false): Promise<{ quantity: number; avgPrice: number } | null> {
  const accounts = await orderAccounts();
  let qty = 0;
  let cost = 0;
  for (const a of accounts) {
    try {
      const pf = await freshPortfolio(a.id, force);
      for (const p of pf.positions) {
        if (p.symbol !== symbol) continue;
        const q = Number(p.quantity);
        const avg = Number(p.avgPrice);
        if (!(q > 0) || !(avg > 0)) continue;
        qty += q;
        cost += q * avg;
      }
    } catch {
      // 이 계좌 잔고를 못 받으면 건너뜀
    }
  }
  return qty > 0 ? { quantity: qty, avgPrice: cost / qty } : null;
}

/** 차트 평단: 증권사 계좌 보유 → 없으면 매매일지 포지션 */
export async function heldPosition(symbol: string, force = false): Promise<{ quantity: number; avgPrice: number } | null> {
  return (await brokerHolding(symbol, force).catch(() => null)) ?? openPosition(symbol);
}

type PositionRow = { symbol: string; status: string; quantity: string | number; avgEntryPrice: string | number | null };

/** 이 종목의 보유 수량·평균 단가 (일지 여러 개면 수량 가중 평균). 없거나 로그인 전이면 null */
export async function openPosition(symbol: string): Promise<{ quantity: number; avgPrice: number } | null> {
  if (!(await accessToken())) return null;
  const rows = await apiRequest<PositionRow[]>("/positions?status=OPEN");
  let qty = 0;
  let cost = 0;
  for (const r of rows) {
    if (r.symbol !== symbol || r.avgEntryPrice === null) continue;
    const q = Number(r.quantity);
    qty += q;
    cost += q * Number(r.avgEntryPrice);
  }
  return qty > 0 ? { quantity: qty, avgPrice: cost / qty } : null;
}
