"use client";
// 내 메모 화면용: 매매 기록(lib/records 의 TradeRecord)을 '메모 한 장'으로 바꾸고, 고정 · 그날 수익률을 계산
//   종류(참고 자료) 5가지는 Figma '메모 종류별 색 · 최종'(1935:55)과 같은 색 — 차트 · 시장 · 뉴스 · 경제 · 공시
//   - 종목을 고른 메모(트레이딩 로그 · 빠른 메모 종목) = 차트
//   - 증시 캘린더에서 남긴 메모는 주제로: 뉴스 · 거시경제(경제) · 공시, 그 밖(시장 흐름 · 업종·테마 · 시장 전반 · 기타) = 시장
import { useSyncExternalStore } from "react";
import { classify, memoText, type TradeRecord } from "../../../lib/records";
import type { Position } from "../../../lib/api/performance";

export type MemoKind = "chart" | "market" | "news" | "economy" | "disclosure";
export const KINDS: { key: MemoKind; label: string }[] = [
  { key: "chart", label: "차트" },
  { key: "market", label: "시장" },
  { key: "news", label: "뉴스" },
  { key: "economy", label: "경제" },
  { key: "disclosure", label: "공시" },
];
export const kindLabel = (k: MemoKind) => KINDS.find((x) => x.key === k)!.label;

export type Memo = {
  id: string;
  rec: TradeRecord;
  kind: MemoKind;
  /** 무엇에 대한 메모: 종목 이름, 없으면 '시장 전반' */
  subject: string;
  /** 종목 코드 (종목 메모만) */
  code: string | null;
  /** 연결된 참고 자료 한 줄 (증시 캘린더 항목 이름 · 종목 차트) */
  ref: string | null;
  body: string;
  /** KST YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  /** 정렬용 'YYYY-MM-DD HH:MM:SS' */
  at: string;
};

export function kindOf(r: TradeRecord): MemoKind {
  if (r.symbol) return "chart";
  switch (r.topic) {
    case "뉴스":
      return "news";
    case "거시경제":
      return "economy";
    case "공시":
      return "disclosure";
    default:
      return "market";
  }
}

export function toMemo(r: TradeRecord): Memo {
  const kind = kindOf(r);
  let body = memoText(r.text ?? "");
  let ref: string | null = null;
  // 빠른 메모로 증시 캘린더 항목을 골라 남긴 메모는 '[항목 이름] 내용' → 항목 이름이 참고 자료
  const tag = !r.symbol ? /^\[([^\]\n]{1,80})\]\s*/.exec(body) : null;
  if (tag) {
    ref = tag[1];
    body = body.slice(tag[0].length);
  }
  if (r.symbol) ref = `${r.symbolName ?? r.symbol} · 가격 및 거래량 차트`;
  // 공시 메모의 항목 이름은 '회사 제목' → 앞 낱말이 회사
  const company = kind === "disclosure" && ref ? ref.split(" ")[0] : null;
  const subject = r.symbolName ?? r.target?.name ?? company ?? "시장 전반";
  return { id: r.id, rec: r, kind, subject, code: r.symbol, ref, body: body.trim(), date: r.date, time: r.noteTime.slice(0, 5), at: `${r.date} ${r.noteTime}` };
}

/** 메모 시각과 체결 시각 (체결이 이어진 종목 메모만) */
export function execInfo(m: Memo) {
  const r = m.rec;
  if (!r.symbol || !r.executionTime) return null;
  const kind = classify(r);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const gap = Math.abs(toMin(r.executionTime) - toMin(r.noteTime));
  const span = gap >= 60 ? `${Math.floor(gap / 60)}시간${gap % 60 ? ` ${gap % 60}분` : ""}` : `${gap}분`;
  const side: "매수" | "매도" = r.side === "SELL" || r.side === "매도" ? "매도" : "매수";
  return {
    side,
    pre: kind === "pre",
    memoTime: r.noteTime.slice(0, 5),
    execTime: r.executionTime.slice(0, 5),
    text: kind === "pre" ? `체결 ${span} 전에 남긴 근거예요` : `체결 ${span} 뒤에 남긴 기록이에요`,
  };
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const parts = (d: string) => d.split("-").map(Number);
export const weekdayOf = (d: string) => {
  const [y, m, day] = parts(d);
  return WEEK[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
};
/** 2026-10-22 → 10월 22일 */
export const shortDate = (d: string) => `${parts(d)[1]}월 ${parts(d)[2]}일`;
/** 2026-10-22 → 10월 22일 목요일 */
export const longDate = (d: string) => `${shortDate(d)} ${weekdayOf(d)}요일`;
export const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
/** 날짜 더하기 (YYYY-MM-DD, n 일) */
export const addDays = (d: string, n: number) => {
  const [y, m, day] = parts(d);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
/** 2026-10 → 2026년 10월 */
export const monthLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
/** 2026-10 에 n 달 더하기 */
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
/** 그 달 달력: 일요일부터 한 주씩, 그 달이 아닌 칸은 null */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

// ── 고정한 메모 (이 브라우저) ──
const PIN_KEY = "trackit:memo-pins";
const NO_PINS: ReadonlySet<string> = new Set();
let pinRaw: string | null = null;
let pinSet: ReadonlySet<string> = NO_PINS;
const pinListeners = new Set<() => void>();
function readPins(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (raw !== pinRaw) {
      pinRaw = raw;
      pinSet = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    }
  } catch {
    // 저장소를 못 쓰면 고정 없이
  }
  return pinSet;
}
export function usePins() {
  return useSyncExternalStore(
    (l) => {
      pinListeners.add(l);
      return () => pinListeners.delete(l);
    },
    readPins,
    () => NO_PINS,
  );
}
export function togglePin(id: string) {
  const next = new Set(readPins());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify([...next]));
  } catch {
    return;
  }
  pinListeners.forEach((l) => l());
}

/**
 * 그날 수익률 = 그날 청산한 포지션의 실현 손익 ÷ 매수 금액 (KST 날짜). 'YYYY-MM' 키는 그 달 전체
 *   (계좌 전체 일간 수익률은 아직 서버에 없어서, 청산한 거래 기준)
 */
export function realizedReturns(positions: Position[]) {
  const acc = new Map<string, { pnl: number; cost: number }>();
  const add = (key: string, pnl: number, cost: number) => {
    const cur = acc.get(key) ?? { pnl: 0, cost: 0 };
    acc.set(key, { pnl: cur.pnl + pnl, cost: cur.cost + cost });
  };
  for (const p of positions) {
    if (p.status !== "CLOSED" || !p.closedAt || p.realizedPnl === null) continue;
    const cost = Number(p.avgEntryPrice) * Number(p.quantity);
    const pnl = Number(p.realizedPnl);
    if (!(cost > 0) || !Number.isFinite(pnl)) continue;
    const day = new Date(Date.parse(p.closedAt) + 9 * 3_600_000).toISOString().slice(0, 10);
    add(day, pnl, cost);
    add(day.slice(0, 7), pnl, cost);
  }
  return new Map([...acc].map(([k, v]) => [k, (v.pnl / v.cost) * 100]));
}

export const pctText = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;

/**
 * 수익률 → 칸 바탕색. Figma 달력 칸 색에서 맞춤: +0.15% #CAEFD8 · +0.42% #B8EBCC · +0.92% #9DE4BA (+1% 이상 #9AE3B9),
 *   −0.31% #FFD8D7 · −0.62% #FECDCC (−1% 이하 #FEC2C0). 0 근처에서 시작하는 색 → 끝 색으로 |수익률|만큼 (1%에서 끝)
 */
export function returnTint(v: number) {
  const t = Math.min(1, Math.abs(v));
  const mix = (a: number[], b: number[]) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(" ")})`;
  return v >= 0 ? mix([211, 241, 222], [154, 227, 185]) : mix([255, 227, 226], [254, 194, 192]);
}
