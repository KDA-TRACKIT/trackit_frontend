// 매매 기록 (AI 노트에서 확정하거나 기록 + 버튼으로 남긴 메모)
// 로그인했으면 백엔드(→ Supabase DB)의 확정 노트로 저장·조회, 로그인 전이면 이 브라우저 localStorage
// 확정된 기록은 고치거나 지우지 않는다 (서버에서는 내용 해시로 잠김)
import { useSyncExternalStore } from "react";
import { accessToken } from "./api/client";
import { MARKET_SYMBOL, listNotes, saveNote, hideNote } from "./api/notes";
import { uuid } from "./uuid";
import type { NoteLine } from "../app/workshop/lineLadder";

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
  /** 종목 기록이면 종목코드·이름. 시장·뉴스·거시경제 같은 생각 메모는 null */
  symbol: string | null;
  symbolName: string | null;
  /** 종목 없는 메모의 주제 (뉴스, 거시경제, 시장 흐름, 기타) */
  topic?: string;
  text: string;
  /** 차트에 그린 선 · 도형 수 (있으면 차트 노트) */
  drawings?: number;
  /** 그은 선의 지지 · 저항 분류 (종목 전략에 누적) */
  lines?: NoteLine[];
  /** 뉴스 · 경제 지표 메모에 적은 정량 전략의 종목 (예: 삼성전자 21만원에 매도). 그 종목 전략에 같이 쌓임 */
  target?: { code: string; name: string };
  /** 고친 메모면 고치기 전 메모 id (확정 메모는 못 고쳐서 새 메모로 남김, 예전 것은 기록에 그대로) */
  replaces?: string;
  /** 종목 전략 정리본이면 합친 예전 메모 id 들 (화면엔 정리본 하나만 보임) */
  consolidates?: string[];
  /** 노트 종류: 일반 · 전략(아직 매매 없음) · 매매 노트 (이후 관련 매매가 생긴 전략 노트) */
  noteType?: "general" | "strategy" | "trade";
};

/** 종목 없는 메모의 주제 */
export const RECORD_TOPICS = ["뉴스", "거시경제", "시장 흐름", "업종·테마", "기타"] as const;

export type RecordKind = "pre" | "post" | "pending" | "thought";

/** 체결 전에 확정된 메모 = 사전, 체결 뒤 = 사후, 연결된 체결 없음 = 검증 대기, 종목 없는 메모 = 생각 */
export function classify(r: Pick<TradeRecord, "noteTime" | "executionTime" | "symbol">): RecordKind {
  if (!r.symbol) return "thought";
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

/** 어디에 저장하는지: 로그인 전 = 이 브라우저, 로그인 = 서버 */
let source: "local" | "server" = "local";
let serverList: TradeRecord[] = EMPTY;
const notify = () => listeners.forEach((l) => l());

function read(): TradeRecord[] {
  return source === "server" ? serverList : readLocal();
}

const KST_MS = 9 * 3600 * 1000;
/** 서버 확정 노트 → 화면 기록 */
function fromServer(): Promise<TradeRecord[]> {
  return listNotes().then((groups) =>
    groups.flatMap(({ journal, notes }) =>
      notes.map((n) => {
        const kst = new Date(new Date(n.confirmedAt).getTime() + KST_MS).toISOString();
        const s = n.aiSummary ?? {};
        const market = n.symbol === MARKET_SYMBOL;
        return {
          id: n.id,
          date: kst.slice(0, 10),
          noteTime: s.noteTime ?? kst.slice(11, 19),
          executionTime: s.execution?.time ?? null,
          side: s.execution?.side,
          quantity: s.execution?.quantity,
          symbol: market ? null : n.symbol,
          symbolName: market ? null : (s.symbolName ?? journal.title),
          topic: market ? (s.topic ?? "시장 전반") : undefined,
          text: s.summary ?? "",
          drawings: Array.isArray(n.drawings) ? n.drawings.length : 0,
          ...(Array.isArray(s.lines) ? { lines: s.lines } : {}),
          ...(s.target ? { target: s.target } : {}),
          ...(s.replaces ? { replaces: s.replaces } : {}),
          ...(n.noteType ? { noteType: n.noteType } : {}),
          ...(Array.isArray(s.consolidates) ? { consolidates: s.consolidates.filter((x: unknown): x is string => typeof x === "string") } : {}),
        } satisfies TradeRecord;
      }),
    ),
  );
}

/** 서버에서 기록을 다시 읽는다 */
export async function refreshServerRecords() {
  serverList = await fromServer();
  source = "server";
  notify();
}

/** 로그인했으면 서버 기록으로 바꾼다 (기록 화면을 열 때 한 번) */
export async function initRecordSource() {
  if (!(await accessToken())) {
    source = "local";
    notify();
    return;
  }
  try {
    await refreshServerRecords();
  } catch {
    // 서버가 꺼져 있으면 일단 이 브라우저 기록을 보여 준다
    source = "local";
    notify();
  }
}

export function recordSource() {
  return source;
}

function readLocal(): TradeRecord[] {
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

/**
 * 새 기록. 같은 메모·체결 조합이 이미 있으면 그대로 둔다.
 * 로그인했으면 서버에 확정 노트로 저장 (drawings 는 서버에만 같이 남김). 실패하면 error 를 돌려준다
 */
export async function addRecord(
  input: Omit<TradeRecord, "id" | "drawings"> & { drawings?: unknown; plan?: Parameters<typeof saveNote>[0]["plan"] },
): Promise<{ ok: boolean; error?: string }> {
  const { drawings, plan, ...record } = input;
  const list = read();
  // 같은 노트·체결 조합은 한 번만. 고친 메모(replaces)는 같은 초에 여러 개 고쳐도 다 남김
  if (!record.replaces && list.some((r) => r.symbol === record.symbol && r.date === record.date && r.noteTime === record.noteTime && r.executionTime === record.executionTime)) return { ok: true };
  if (source === "server") {
    try {
      await saveNote({
        symbol: record.symbol,
        symbolName: record.symbolName,
        text: record.text,
        noteTime: record.noteTime,
        topic: record.topic,
        execution: record.executionTime ? { time: record.executionTime, side: record.side ?? "", quantity: record.quantity ?? 0 } : null,
        drawings,
        lines: record.lines,
        target: record.target,
        replaces: record.replaces,
        consolidates: record.consolidates,
        plan,
      });
      await refreshServerRecords();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "기록을 저장하지 못했어요." };
    }
  }
  const drawn = Array.isArray(drawings) ? drawings.length : 0;
  localStorage.setItem(KEY, JSON.stringify([{ ...record, ...(drawn ? { drawings: drawn } : {}), id: uuid() }, ...readLocal()]));
  notify();
  return { ok: true };
}

/**
 * 기록 지우기. 로그인했으면 서버 기록을 숨김(원본은 DB 에 남음), 아니면 이 브라우저 기록에서 뺀다
 */
export async function removeRecord(id: string): Promise<{ ok: boolean; error?: string }> {
  if (source === "server") {
    try {
      await hideNote(id);
      serverList = serverList.filter((r) => r.id !== id);
      notify();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "기록을 지우지 못했어요." };
    }
  }
  localStorage.setItem(KEY, JSON.stringify(readLocal().filter((r) => r.id !== id)));
  notify();
  return { ok: true };
}

/**
 * 체결이 생기면 같은 종목·같은 날의 검증 대기 메모 중 체결보다 먼저 쓴 것을 그 체결에 잇는다 (사전 기록).
 * 메모가 체결보다 앞서므로 판정이 분명한 경우만 자동으로 한다. 이어 붙인 건수를 돌려준다
 */
export function linkPending(symbol: string, date: string, execution: { time: string; side: string; quantity: number }) {
  // 서버 확정 노트는 잠겨 있어 나중에 체결을 붙일 수 없다 (확정할 때 연결한 체결만 남음)
  if (source === "server") return 0;
  let linked = 0;
  const next = readLocal().map((r) => {
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

/**
 * 화면에 보일 메모 글: 앞에 붙던 꼬리표를 뺌
 *   - [관찰 메모] (예전 계획 점검)
 *   - 빠른 메모로 종목을 골랐을 때 붙던 출처 · 등락 ([전기/전자 0.00%] · [오늘의 종목 · …] · [뉴스]) — 지금은 안 붙임
 */
// 예전에 저장된 메모의 '[AI 정리]' 머리표는 보여 줄 때 뺌
// 예전 노트에 자동으로 붙던 계획 줄([노트 종류] 매매 계획 · [매수 조건] … · [목표] …)은 투자자가 적은 게 아니라 보여 줄 때 뺌 (2026-11-19)
const AUTO_PLAN_LINE = /^\[(?:노트 종류|방향|진입 근거|매수 조건|현재 판단|변경 사유|손절 기준|목표|비중|기준값|기한|계획 대비 차이|원인|다음에 바꿀 점)\][^\n]*(?:\n|$)/gm;
export const memoText = (t: string) => t.replace(AUTO_PLAN_LINE, "").replace(/\n{3,}/g, "\n\n").trim().replace(/^\[관찰 메모\]\s*/, "").replace(/^\[AI 정리\]\s*/gm, "").replace(/^\[(?:[^\]]*?[+\-−]?\d+(?:\.\d+)?%|오늘의 종목[^\]]*|뉴스)\]\s*/, "");
