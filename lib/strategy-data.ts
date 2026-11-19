"use client";
// 전략 마켓 월별 전략 내용 받기: /strategy-data/{트레이더}/{달} (서버가 열람권을 확인하고 그 달 것만 보냄)
//   로그인 토큰을 같이 보내야 연 전략을 받을 수 있음. 못 받으면(안 연 달 · 로그인 전) null
import { accessToken } from "./api/client";
import type { SimDetail } from "../app/marketplace/GuessFirst";

export async function fetchStrategyMonth(id: string, month: string): Promise<SimDetail | null> {
  const token = await accessToken().catch(() => null);
  const res = await fetch(`/strategy-data/${encodeURIComponent(id)}/${encodeURIComponent(month)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  return res.ok ? ((await res.json()) as SimDetail) : null;
}
