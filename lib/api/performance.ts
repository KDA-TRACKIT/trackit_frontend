// 홈 성과 리포트 · 포지션 · 체결 (백엔드 B 영역 API, 숫자는 모두 문자열로 옴)
//   GET /performance?from=&to=   기간 성과 (청산 포지션 기준) + 보유 중 + 수수료·세금 + 사전/사후 판정
//   GET /positions?status=CLOSED 청산 포지션 (누적 손익 그래프)
//   GET /journals → GET /journals/{id}/trades  내 체결 (최근 거래 표)
import { apiRequest } from "./client";
import type { Journal } from "../types/journal";

export type PerformanceReport = {
  range: { from: string; to: string };
  performance: {
    closedPositionCount: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    winRate: string | null;
    realizedPnl: string;
    avgRealizedPnl: string | null;
    avgReturnRate: string | null;
    profitLossRatio: string | null;
    maxDrawdownPnl: string;
    adherenceRate: string | null;
  };
  judgments: { PRE_ALGO: number; PRE_NOTE: number; NONE: number; total: number };
  open: { count: number; costBasis: string };
  costs: { feesAndTaxes: string; brokerTradeCount: number };
};

export type Position = {
  id: string;
  journalId: string | null;
  symbol: string;
  market: string;
  status: "OPEN" | "CLOSED";
  quantity: string;
  avgEntryPrice: string;
  avgExitPrice: string | null;
  realizedPnl: string | null;
  openedAt: string;
  closedAt: string | null;
};

export type Trade = {
  id: string;
  journalId: string | null;
  symbol: string;
  market: string;
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  fee: string;
  executedAt: string;
  sourceBroker: string | null;
};

/** KST 날짜 YYYY-MM-DD (days 일 전) */
export function kstDate(daysAgo = 0) {
  return new Date(Date.now() + 9 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export function getPerformance(from: string, to: string) {
  return apiRequest<PerformanceReport>(`/performance?from=${from}&to=${to}`);
}

export function getPositions(status?: "OPEN" | "CLOSED") {
  return apiRequest<Position[]>(`/positions${status ? `?status=${status}` : ""}`);
}

/**
 * 내 체결 최근 순. 체결 전용 목록 API 가 없어 일지별로 모은다 (최근 일지 limitJournals 개)
 * 일지에 안 묶인 체결(/trades/unlinked)도 함께
 */
export async function recentTrades(limitJournals = 30): Promise<(Trade & { journalTitle: string | null })[]> {
  const [journals, unlinked] = await Promise.all([
    apiRequest<Journal[]>(`/journals?limit=${limitJournals}`),
    apiRequest<Trade[]>(`/trades/unlinked`).catch(() => [] as Trade[]),
  ]);
  const perJournal = await Promise.all(
    journals.map((j) =>
      apiRequest<Trade[]>(`/journals/${j.id}/trades`)
        .then((list) => list.map((t) => ({ ...t, journalTitle: j.title })))
        .catch(() => []),
    ),
  );
  return [...perJournal.flat(), ...unlinked.map((t) => ({ ...t, journalTitle: null }))].sort((a, b) => b.executedAt.localeCompare(a.executedAt));
}
