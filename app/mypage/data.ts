"use client";
// 마이페이지에서 쓰는 매매 기록 집계 (lib/records 의 확정 노트)
import { useEffect, useMemo } from "react";
import { initRecordSource, useRecords, useRecordsReady, type TradeRecord } from "../../lib/records";

export function isBuy(side?: string) {
  return side === "매수" || side === "BUY";
}
export function isSell(side?: string) {
  return side === "매도" || side === "SELL";
}

/** 기록을 서버(로그인)에서 한 번 읽고 집계 */
export function useActivity() {
  useEffect(() => {
    void initRecordSource();
  }, []);
  const records = useRecords();
  // 기록을 다 읽기 전에는 '기록이 없어요' 대신 불러오는 중으로
  const ready = useRecordsReady();
  return useMemo(() => {
    const trades = records.filter((r) => r.executionTime && r.symbol);
    const symbols = [...new Set(trades.map((r) => r.symbolName ?? r.symbol ?? ""))].filter(Boolean);
    return {
      ready,
      records,
      trades,
      symbols,
      buys: trades.filter((r) => isBuy(r.side)).length,
      sells: trades.filter((r) => isSell(r.side)).length,
    };
  }, [records, ready]);
}

/** 최근 순 */
export function newestFirst(list: TradeRecord[]) {
  return [...list].sort((a, b) => (a.date === b.date ? b.noteTime.localeCompare(a.noteTime) : b.date.localeCompare(a.date)));
}
