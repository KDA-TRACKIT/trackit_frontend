// 매매 기록 (AI 노트에서 확정하거나 기록 + 버튼으로 남긴 메모)
// 아직 백엔드에 기록 API가 없어서 이 브라우저 localStorage 에 둔다. 확정된 기록은 고치거나 지우지 않는다
import { useSyncExternalStore } from "react";

export type TradeRecord = {
  id: string;
  /** KST 날짜 YYYY-MM-DD (일별 묶음 기준) */
  date: string;
  /** 메모 시각 KST HH:MM:SS */
  noteTime: string;
  /** 연결된 체결 시각. 없으면 검증 대기 */
  executionTime: string | null;
  side?: string;
  quantity?: number;
  symbol: string;
  symbolName: string;
  text: string;
};

export type RecordKind = "pre" | "post" | "pending";

/** 체결 전에 확정된 메모 = 사전, 체결 뒤 = 사후, 연결된 체결 없음 = 검증 대기 */
export function classify(r: Pick<TradeRecord, "noteTime" | "executionTime">): RecordKind {
  if (r.executionTime === null) return "pending";
  return r.noteTime < r.executionTime ? "pre" : "post";
}

/** 지금 KST 날짜·시각 */
export function kstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  };
}

const KEY = "trackit:records";
const EMPTY: TradeRecord[] = [];
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: TradeRecord[] = EMPTY;

function read(): TradeRecord[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as TradeRecord[]) : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 새 기록을 맨 앞에. 같은 메모·체결 조합이 이미 있으면 그대로 둔다 */
export function addRecord(input: Omit<TradeRecord, "id">) {
  const list = read();
  if (list.some((r) => r.symbol === input.symbol && r.date === input.date && r.noteTime === input.noteTime && r.executionTime === input.executionTime)) return;
  localStorage.setItem(KEY, JSON.stringify([{ ...input, id: crypto.randomUUID() }, ...list]));
  listeners.forEach((l) => l());
}

/**
 * 체결이 생기면 같은 종목·같은 날의 검증 대기 메모 중 체결보다 먼저 쓴 것을 그 체결에 잇는다 (사전 기록).
 * 메모가 체결보다 앞서므로 판정이 분명한 경우만 자동으로 한다. 이어 붙인 건수를 돌려준다
 */
export function linkPending(symbol: string, date: string, execution: { time: string; side: string; quantity: number }) {
  let linked = 0;
  const next = read().map((r) => {
    if (r.symbol !== symbol || r.date !== date || r.executionTime !== null || r.noteTime > execution.time) return r;
    linked++;
    return { ...r, executionTime: execution.time, side: execution.side, quantity: execution.quantity };
  });
  if (linked) {
    localStorage.setItem(KEY, JSON.stringify(next));
    listeners.forEach((l) => l());
  }
  return linked;
}

export type RecordQuery = { symbol: string | null; from: string; to: string };

/** 조회: 종목(null = 전체)과 날짜 범위(YYYY-MM-DD, 양끝 포함) */
export function queryRecords(list: TradeRecord[], q: RecordQuery) {
  return list.filter((r) => (!q.symbol || r.symbol === q.symbol) && r.date >= q.from && r.date <= q.to);
}

/** 오늘에서 days일 전 날짜 (KST) */
export function daysAgo(days: number) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 - days * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

export function useRecords() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** 날짜별로 묶음 (최근 날짜 먼저, 같은 날은 최근 메모 먼저) */
export function groupByDate(list: TradeRecord[]) {
  const map = new Map<string, TradeRecord[]>();
  for (const r of [...list].sort((a, b) => (a.date === b.date ? b.noteTime.localeCompare(a.noteTime) : b.date.localeCompare(a.date)))) {
    map.set(r.date, [...(map.get(r.date) ?? []), r]);
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }));
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 2026-11-12 → 2026.11.12 (목) */
export function dateLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${date.replaceAll("-", ".")} (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}
