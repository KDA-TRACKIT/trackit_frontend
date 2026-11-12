// 내 보유 포지션 (백엔드 GET /positions?status=OPEN). 로그인 전이면 없음
import { accessToken, apiRequest } from "./client";

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
