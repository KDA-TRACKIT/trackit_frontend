"use client";
// 차트에 그릴 평균 단가: 계좌 보유(로그인) 우선, 없으면 이번에 낸 모의 주문 체결로 계산
import { useEffect, useMemo, useState } from "react";
import { openPosition } from "../lib/api/positions";

export type AvgPrice = { price: number; quantity: number; source: "계좌" | "모의" };
type Fill = { side: string; quantity: number; price?: number };

/** 매수는 평단에 섞고, 매도는 수량만 줄인다 (다 팔면 없음) */
export function averageOf(fills: Fill[]): { price: number; quantity: number } | null {
  let qty = 0;
  let avg = 0;
  for (const f of fills) {
    if (!f.price || f.quantity <= 0) continue;
    if (f.side === "매수") {
      avg = (avg * qty + f.price * f.quantity) / (qty + f.quantity);
      qty += f.quantity;
    } else {
      qty = Math.max(0, qty - f.quantity);
      if (qty === 0) avg = 0;
    }
  }
  return qty > 0 ? { price: avg, quantity: qty } : null;
}

export function useAvgPrice(symbol: string, fills: Fill[]): AvgPrice | null {
  const [account, setAccount] = useState<{ symbol: string; value: { quantity: number; avgPrice: number } | null } | null>(null);
  useEffect(() => {
    let alive = true;
    openPosition(symbol)
      .then((value) => alive && setAccount({ symbol, value }))
      .catch(() => alive && setAccount({ symbol, value: null }));
    return () => {
      alive = false;
    };
  }, [symbol]);
  const local = useMemo(() => averageOf(fills), [fills]);
  const held = account?.symbol === symbol ? account.value : null;
  if (held) return { price: held.avgPrice, quantity: held.quantity, source: "계좌" };
  return local ? { ...local, source: "모의" } : null;
}
