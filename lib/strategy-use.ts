"use client";
// 산 전략 활용 (2026-11-20): 자연어 규칙이 아니어도 산 사람이 바로 쓸 수 있게
//   1) 내 차트에 겹치기: 트레이더가 매수한 자리 기준 선 위치(진입가 대비 %)를 내 종목 지금 가격에 옮겨 그림
//   2) 같은 상황 알림: 트레이더가 실제로 산 날의 상황(RSI · 20일선 거리 · 20일 수익률 · 거래량 · 60일 범위 위치)과
//      내 관심 종목의 오늘 상황이 비슷하면 알림 (수익 예측이 아니라 "이 사람이라면 지켜봤을 자리")
//   3) 복기 비교: 같은 달 내 체결과 트레이더 매매를 나란히 (보유 기간 · 승률 · 평균 수익률 · 손절 지킴)
//   4) 이 트레이더라면?: 내 종목 지금 상황과 가장 비슷했던 트레이더의 실제 매매 · 노트를 날짜와 함께 인용 (지어낸 말 없음)
import type { SimDetail, SimMonth } from "../app/marketplace/GuessFirst";
import type { SimLine, SimTrade } from "../app/marketplace/StrategyChart";
import type { Bar } from "./mock/workshop";

/** 봉 하나 시점의 상황 */
export type Situation = { rsi: number; ma20: number; ret20: number; vol: number; pos60: number };

export const SITUATION_LABEL: Record<keyof Situation, string> = {
  rsi: "RSI",
  ma20: "20일선과 거리",
  ret20: "20일 수익률",
  vol: "거래량(20일 평균 대비)",
  pos60: "60일 범위 위치",
};

/** i 번째 봉 시점 상황 (그 전 봉만 씀). 봉이 모자라면 null */
export function situationAt(bars: { close: number; high: number; low: number; volume: number }[], i: number): Situation | null {
  if (i < 60 || i >= bars.length) return null;
  const c = bars.map((b) => b.close);
  let gain = 0;
  let loss = 0;
  for (let k = i - 13; k <= i; k++) {
    const d = c[k] - c[k - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  const rsi = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  const ma20 = c.slice(i - 19, i + 1).reduce((s, v) => s + v, 0) / 20;
  const vol20 = bars.slice(i - 20, i).reduce((s, b) => s + b.volume, 0) / 20;
  const win = bars.slice(i - 59, i + 1);
  const hi = Math.max(...win.map((b) => b.high));
  const lo = Math.min(...win.map((b) => b.low));
  return {
    rsi,
    ma20: (c[i] / ma20 - 1) * 100,
    ret20: (c[i] / c[i - 20] - 1) * 100,
    vol: vol20 ? bars[i].volume / vol20 : 1,
    pos60: hi > lo ? ((c[i] - lo) / (hi - lo)) * 100 : 50,
  };
}

/** 두 상황이 얼마나 비슷한지 0~100 (항목마다 허용 폭 안이면 점수) */
export function closeness(a: Situation, b: Situation) {
  const parts: [number, number][] = [
    [Math.abs(a.rsi - b.rsi), 15],
    [Math.abs(a.ma20 - b.ma20), 6],
    [Math.abs(a.ret20 - b.ret20), 12],
    [Math.abs(Math.log(Math.max(a.vol, 0.05) / Math.max(b.vol, 0.05))), 1],
    [Math.abs(a.pos60 - b.pos60), 30],
  ];
  const w = [0.25, 0.25, 0.2, 0.1, 0.2];
  return Math.round(parts.reduce((s, [d, tol], k) => s + w[k] * Math.max(0, 1 - d / tol), 0) * 100);
}

/** 상황 한 줄 (사람이 읽는 말) */
export function describe(s: Situation) {
  const rsi = s.rsi >= 70 ? "과열" : s.rsi <= 30 ? "과매도" : s.rsi >= 55 ? "강한 편" : s.rsi <= 45 ? "약한 편" : "중립";
  const ma = Math.abs(s.ma20) < 1.5 ? "20일선 근처" : s.ma20 > 0 ? `20일선 위 ${s.ma20.toFixed(1)}%` : `20일선 아래 ${(-s.ma20).toFixed(1)}%`;
  const pos = s.pos60 >= 80 ? "60일 고점 부근" : s.pos60 <= 20 ? "60일 저점 부근" : "60일 범위 중간";
  return `RSI ${s.rsi.toFixed(0)}(${rsi}) · ${ma} · 20일 ${s.ret20 >= 0 ? "+" : ""}${s.ret20.toFixed(1)}% · ${pos}`;
}

/** "2026-10-14" 를 봉 목록에서 찾기 (그날 또는 그 전 마지막 봉) */
export function indexOfDate(bars: Bar[], d: string) {
  const ymd = (t: number) => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10);
  let k = -1;
  for (let i = 0; i < bars.length; i++) {
    if (ymd(bars[i].time) <= d) k = i;
    else break;
  }
  return k;
}

/** 트레이더가 실제로 들어간 자리 하나 (그날 상황 + 근거 + 결과) */
export type EntryCase = { month: string; trade: SimTrade; situation: Situation };

/** 산 달들의 매매마다 진입일 상황을 계산 (종목 일봉은 barsOf 로 받음) */
export async function entryCases(months: SimMonth[], barsOf: (code: string) => Promise<Bar[]>): Promise<EntryCase[]> {
  const cache = new Map<string, Promise<Bar[]>>();
  const get = (code: string) => cache.get(code) ?? (cache.set(code, barsOf(code).catch(() => [])), cache.get(code)!);
  const out: EntryCase[] = [];
  for (const m of months) {
    for (const t of m.trades) {
      const bars = await get(t.code);
      const s = situationAt(bars, indexOfDate(bars, t.entry.d));
      if (s) out.push({ month: m.month, trade: t, situation: s });
    }
  }
  return out;
}

// ── 1) 내 차트에 겹치기 ──

/** 점 하나: 매수한 날에서 몇 거래일 떨어졌는지(앞이면 -) · 매수가 대비 몇 % · 원래 날짜와 가격 */
export type OverlayPoint = { days: number; pct: number; d: string; p: number };
/**
 * 내 차트에 옮길 모양 (2026-11-20 수평선으로만 옮기던 것을 원래 모양대로)
 *   hline 수평선 · trend 추세선 · ray 반직선 · channel 평행 채널(상단 a · b + 하단 a → 투자작업실 평행 채널 도구와 같은 3점)
 */
export type OverlayShape = { key: string; kind: "hline" | "trend" | "ray" | "channel"; label: string; points: OverlayPoint[]; why: string; date: string; name: string; code: string; entryPx: number };

export function overlayShapes(months: SimMonth[]): OverlayShape[] {
  const out: OverlayShape[] = [];
  for (const m of months) {
    const dates = m.candles.map((c) => c[0]);
    // 거래일 차이: 그 달 봉에 있으면 봉 수로, 없으면 달력 날짜 × 5/7
    const at = (d: string) => {
      let k = -1;
      for (let i = 0; i < dates.length; i++) if (dates[i] <= d) k = i;
      return k >= 0 && dates[k] === d ? k : null;
    };
    for (const t of m.trades) {
      const e = at(t.entry.d);
      const pt = (d: string, p: number): OverlayPoint => {
        const k = at(d);
        const days = k !== null && e !== null ? k - e : Math.round(((Date.parse(d) - Date.parse(t.entry.d)) / 86_400_000) * (5 / 7));
        return { days, pct: (p / t.entry.px - 1) * 100, d, p };
      };
      const base = { why: t.entry.why, date: t.entry.d, name: t.name, code: t.code, entryPx: t.entry.px };
      const lines = t.lines.filter((l): l is Extract<SimLine, { a: [string, number] }> => l.kind === "hline" || l.kind === "trend" || l.kind === "ray");
      // 같은 매매의 '상단' · '하단' 추세선 둘 = 평행 채널 하나
      const up = lines.find((l) => l.kind !== "hline" && /상단/.test(l.label));
      const dn = lines.find((l) => l.kind !== "hline" && /하단/.test(l.label));
      const used = new Set<SimLine>();
      if (up && dn) {
        out.push({ ...base, key: `${t.code}:${t.entry.d}:ch`, kind: "channel", label: up.label.replace(/\s*상단.*/, "") || "채널", points: [pt(...up.a), pt(...up.b), pt(...dn.a)] });
        used.add(up).add(dn);
      }
      lines.forEach((l, k) => {
        if (used.has(l)) return;
        out.push({ ...base, key: `${t.code}:${t.entry.d}:${k}`, kind: l.kind, label: l.label, points: l.kind === "hline" ? [pt(t.entry.d, l.a[1])] : [pt(...l.a), pt(...l.b)] });
      });
    }
  }
  return out;
}

/** 모양의 매수일 기준 가격 % (목록 표시 · 정렬용): 수평선은 그 값, 선은 매수일에서 이어 그었을 때 값 */
export function pctAtEntry(s: OverlayShape) {
  const lineAt = (a: OverlayPoint, b: OverlayPoint) => (b.days === a.days ? b.pct : a.pct + ((b.pct - a.pct) * (0 - a.days)) / (b.days - a.days));
  if (s.kind === "hline") return s.points[0].pct;
  return lineAt(s.points[0], s.points[1]);
}

/** 매수일 기준 표시: 채널은 하단 ~ 상단, 나머지는 한 값 */
export function entryText(s: OverlayShape) {
  const f = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const top = pctAtEntry(s);
  if (s.kind !== "channel") return f(top);
  const [a, b, c] = s.points;
  const gap = c.pct - (a.pct + ((b.pct - a.pct) * (c.days - a.days)) / (b.days - a.days || 1));
  return `${f(top + gap)} ~ ${f(top)}`;
}

// ── 2) 같은 상황 알림 (이 브라우저에 저장) ──

const ALERTS = "trackit:strategy-alerts";
const HITS = "trackit:strategy-hits";
export type AlertRule = { traderId: string; traderName: string; min: number };
export type AlertHit = { id: string; traderId: string; traderName: string; code: string; name: string; score: number; caseDate: string; caseName: string; at: string };

const read = <T,>(k: string): T[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
export const readAlerts = () => read<AlertRule>(ALERTS);
export function setAlert(rule: AlertRule, on: boolean) {
  const rest = readAlerts().filter((r) => r.traderId !== rule.traderId);
  localStorage.setItem(ALERTS, JSON.stringify(on ? [...rest, rule] : rest));
  window.dispatchEvent(new Event("trackit:strategy-alerts"));
}
export const readHits = () => read<AlertHit>(HITS);
/** 새로 찾은 자리만 쌓음 (같은 트레이더 · 종목 · 날은 한 번) */
export function addHits(hits: AlertHit[]) {
  const old = readHits();
  const ids = new Set(old.map((h) => h.id));
  const next = [...hits.filter((h) => !ids.has(h.id)), ...old].slice(0, 50);
  localStorage.setItem(HITS, JSON.stringify(next));
  window.dispatchEvent(new Event("trackit:strategy-alerts"));
  return hits.filter((h) => !ids.has(h.id)).length;
}

/** 관심 종목 하나의 오늘 상황과 가장 비슷한 트레이더 진입 */
export function bestCase(today: Situation, cases: EntryCase[]) {
  return cases.map((c) => ({ c, score: closeness(today, c.situation) })).sort((a, b) => b.score - a.score)[0] ?? null;
}

// ── 3) 복기 비교 ──

export type MyRound = { symbol: string; entry: { d: string; px: number }; exit: { d: string; px: number } | null; ret: number | null; days: number | null };

/** 내 체결(매수 · 매도)을 종목마다 먼저 산 것부터 짝지어 한 번의 매매로 */
export function pairTrades(trades: { symbol: string; side: "BUY" | "SELL"; price: string; quantity: string; executedAt: string }[]): MyRound[] {
  const kst = (s: string) => new Date(Date.parse(s) + 9 * 3_600_000).toISOString().slice(0, 10);
  const bySym = new Map<string, typeof trades>();
  for (const t of [...trades].sort((a, b) => a.executedAt.localeCompare(b.executedAt))) bySym.set(t.symbol, [...(bySym.get(t.symbol) ?? []), t]);
  const out: MyRound[] = [];
  for (const [symbol, list] of bySym) {
    let open = null as { d: string; px: number; qty: number; cost: number } | null;
    for (const t of list) {
      const px = Number(t.price);
      const qty = Number(t.quantity);
      if (t.side === "BUY") {
        open = open ? { ...open, qty: open.qty + qty, cost: open.cost + px * qty } : { d: kst(t.executedAt), px, qty, cost: px * qty };
      } else if (open) {
        const avg: number = open.cost / open.qty;
        const d = kst(t.executedAt);
        out.push({ symbol, entry: { d: open.d, px: avg }, exit: { d, px }, ret: (px / avg - 1) * 100, days: Math.round((Date.parse(d) - Date.parse(open.d)) / 86_400_000) });
        open = open.qty - qty > 0 ? { ...open, qty: open.qty - qty, cost: avg * (open.qty - qty) } : null;
      }
    }
    if (open) out.push({ symbol, entry: { d: open.d, px: open.cost / open.qty }, exit: null, ret: null, days: null });
  }
  return out.sort((a, b) => b.entry.d.localeCompare(a.entry.d));
}

export type RoundStats = { n: number; closed: number; winRate: number | null; avgRet: number | null; avgDays: number | null; worst: number | null };
export function statsOf(rounds: { ret: number | null; days: number | null }[]): RoundStats {
  const closed = rounds.filter((r) => r.ret !== null);
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  return {
    n: rounds.length,
    closed: closed.length,
    winRate: closed.length ? (closed.filter((r) => r.ret! > 0).length / closed.length) * 100 : null,
    avgRet: avg(closed.map((r) => r.ret!)),
    avgDays: avg(closed.map((r) => r.days!).filter((d) => d !== null)),
    worst: closed.length ? Math.min(...closed.map((r) => r.ret!)) : null,
  };
}
export const traderRounds = (detail: SimDetail | null) =>
  (detail?.months ?? []).flatMap((m) => m.trades.map((t) => ({ ...t, days: Math.round((Date.parse(t.exit.d) - Date.parse(t.entry.d)) / 86_400_000) })));
