"use client";
// 지금 장 단계 (KST). 정규장은 KRX, 프리·애프터마켓은 넥스트레이드(NXT) 시간 기준
//   08:00~08:50 프리마켓 · 08:50~09:00 시가 동시호가 · 09:00~15:20 장 열림
//   15:20~15:30 종가 동시호가 · 15:30~20:00 애프터마켓 · 그 밖 장 마감 · 주말 휴장
// 공휴일은 모른다 (그날은 시세가 안 바뀌므로 화면엔 큰 문제 없음)
import { useEffect, useState } from "react";

export type MarketPhase = "pre" | "auction-open" | "open" | "auction-close" | "after" | "closed" | "holiday";

export const PHASE_LABEL: Record<MarketPhase, string> = {
  pre: "프리마켓",
  "auction-open": "장 시작 전",
  open: "장 열림",
  "auction-close": "마감 동시호가",
  after: "애프터마켓",
  closed: "장 마감",
  holiday: "휴장",
};

/** 정규장 시세(체결·호가)가 실시간으로 바뀌는 단계 */
export const isRegularPhase = (p: MarketPhase) => p === "auction-open" || p === "open" || p === "auction-close";

export function marketPhase(now = new Date()): MarketPhase {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const dow = kst.getUTCDay();
  if (dow === 0 || dow === 6) return "holiday";
  const m = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (m < 8 * 60) return "closed";
  if (m < 8 * 60 + 50) return "pre";
  if (m < 9 * 60) return "auction-open";
  if (m < 15 * 60 + 20) return "open";
  if (m < 15 * 60 + 30) return "auction-close";
  if (m < 20 * 60) return "after";
  return "closed";
}

/** 지금 장 단계. 20초마다 다시 본다 */
export function useMarketPhase(): MarketPhase {
  const [phase, setPhase] = useState<MarketPhase>(() => marketPhase());
  useEffect(() => {
    const timer = setInterval(() => setPhase(marketPhase()), 20_000);
    return () => clearInterval(timer);
  }, []);
  return phase;
}
