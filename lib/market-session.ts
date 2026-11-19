"use client";
// 지금 장 단계 (KST). 정규장은 KRX, 프리·애프터마켓은 넥스트레이드(NXT) 시간 기준
//   08:00~08:50 프리마켓 · 08:50~09:00 시가 동시호가 · 09:00~15:20 장 열림
//   15:20~15:30 종가 동시호가 · 15:30~20:00 애프터마켓 · 그 밖 장 마감 · 주말 휴장
// 공휴일은 모른다 (그날은 시세가 안 바뀌므로 화면엔 큰 문제 없음)
// 수능일 · 새해 첫 거래일처럼 늦게 여는 날은 lib/krx-hours 표대로 (수능일은 프리마켓부터 전부 1시간 밀림)
import { useEffect, useState } from "react";
import { krxHours } from "./krx-hours";

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
  const h = krxHours(now);
  if (m < 8 * 60 + h.shift) return "closed";
  if (m < h.open - 10) return "pre";
  if (m < h.open) return "auction-open";
  if (m < h.close - 10) return "open";
  if (m < h.close) return "auction-close";
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
