"use client";
// 전략 마켓 전략 내용 받기: /strategy-data/{트레이더}/{전략 번호 s1 … 또는 달 YYYY-MM} (서버가 구독을 확인하고 그 전략 것만 보냄)
//   전략 번호로 물으면 그 전략 기간의 기록 전부, 달로 물으면 그 달 기록 하나 (전략보관함의 달 단위 차트)
//   로그인 토큰을 같이 보내야 구독한 전략을 받을 수 있음. 못 받으면(구독 전 · 로그인 전) null
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
