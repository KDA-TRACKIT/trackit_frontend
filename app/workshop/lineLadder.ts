// AI 노트 · 그은 선 정리: 현재가 기준 위(저항 후보) · 아래(지지 후보)로 가격순 사다리를 만든다
//   - 수평선류: 그 가격 그대로
//   - 추세선류: 오늘(마지막 봉) 시각에서의 값으로 (기울어진 선은 시간이 지나면 가격이 바뀌니까)
//   - 거의 같은 가격(0.5% 안)의 선은 한 줄로 묶음
//   - 피보나치 · 구간(사각형 등)은 여러 가격을 가지므로 따로 한 줄씩 (레벨 · 범위)
import { getTool, type Drawing } from "../../lib/drawing";

/** 한 가격에 그어진 선 */
const LEVEL_TOOLS = new Set(["horizontal-line", "horizontal-ray", "cross-line", "price-label", "price-note", "pin"]);
/** 두 점으로 기울어진 선 → 오늘 값 */
const SLANT_TOOLS = new Set(["trendline", "ray", "extended-line", "info-line", "trend-angle", "regression-trend"]);
/** 위아래가 있는 구간 */
const ZONE_TOOLS = new Set(["rectangle", "rotated-rectangle", "price-range", "price-range-only", "parallel-channel", "flat-top-bottom", "gann-box"]);

const RET_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
const EXT_LEVELS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618];

export type Rung = {
  /** 답을 저장하는 열쇠 (묶음이면 첫 선 id) */
  key: string;
  /** 묶인 드로잉 id (차트 강조용) */
  ids: string[];
  price: number;
  /** "수평선", "추세선 · 오늘 값", "수평선 2개 겹침" */
  label: string;
  /** 기울어진 선 하나면 두 점 [시각(초), 가격] (날마다 값이 달라서 이행률 판정 때 그날 값을 다시 계산) */
  pts?: [number, number][];
};
export type Level = { key: string; lv: number; price: number };
export type Group =
  | { kind: "fib"; key: string; id: string; label: string; levels: Level[] }
  | { kind: "zone"; key: string; id: string; label: string; low: number; high: number };

const num = (s: string | undefined) => Number(s ?? NaN);

/**
 * 시각 → 봉 순서(논리 인덱스). 차트(lib/drawing/render/lwc-adapter timeToLogical)와 같은 계산
 *   차트는 선을 봉 순서로 곧게 그리므로(주말 · 휴장은 칸이 없음) 값도 봉 순서로 계산해야 화면과 맞음
 */
function step(bars: { time: number }[]) {
  const diffs: number[] = [];
  for (let i = Math.max(1, bars.length - 20); i < bars.length; i++) diffs.push(bars[i].time - bars[i - 1].time);
  diffs.sort((x, y) => x - y);
  return diffs[Math.floor(diffs.length / 2)] || 86400;
}
export function timeToLogical(bars: { time: number }[], time: number) {
  const last = bars.length - 1;
  if (time >= bars[last].time) return last + (time - bars[last].time) / step(bars);
  if (time <= bars[0].time) return (time - bars[0].time) / step(bars);
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const span = bars[hi].time - bars[lo].time;
  return lo + (span ? (time - bars[lo].time) / span : 0);
}

/** 기울어진 선의 t 시각 값 (두 점을 이은 직선, 봉이 있으면 봉 순서 기준 = 차트에 보이는 값) */
function at(d: Drawing, t: number, bars?: { time: number }[]) {
  const [a, b] = d.points;
  const pa = num(a?.price);
  const pb = num(b?.price ?? a?.price);
  if (!b || b.time === a.time) return pb;
  if (bars?.length) {
    const [la, lb, lt] = [timeToLogical(bars, a.time), timeToLogical(bars, b.time), timeToLogical(bars, t)];
    if (lb !== la) return pa + ((pb - pa) * (lt - la)) / (lb - la);
  }
  return pa + ((pb - pa) * (t - a.time)) / (b.time - a.time);
}

/** bars: 차트의 봉 (있으면 추세선 값을 차트와 같은 봉 순서로) */
export function buildLadder(drawings: Drawing[], nowTime: number | undefined, bars?: { time: number }[]) {
  const single: Rung[] = [];
  const groups: Group[] = [];
  for (const d of drawings) {
    const label = getTool(d.toolId)?.label ?? d.toolId;
    const p0 = num(d.points[0]?.price);
    if (!(p0 > 0)) continue;
    if (LEVEL_TOOLS.has(d.toolId)) single.push({ key: d.id, ids: [d.id], price: p0, label });
    else if (SLANT_TOOLS.has(d.toolId) && d.points.length >= 2) {
      const [a, b] = d.points;
      // 클릭만 해서 두 점이 같은 시각인 선(길이 0 · 세로선)은 화면에 안 보이니 빼고
      if (a.time === b.time) continue;
      const v = nowTime ? at(d, nowTime, bars) : num(d.points[d.points.length - 1].price);
      const pts: [number, number][] = [[a.time, num(a.price)], [b.time, num(b.price)]];
      if (v > 0) single.push({ key: d.id, ids: [d.id], price: v, label: nowTime ? `${label} · 오늘 값` : label, pts });
    } else if (d.toolId === "fib-retracement" && d.points.length >= 2) {
      const pa = num(d.points[0].price);
      const pb = num(d.points[1].price);
      groups.push({ kind: "fib", key: d.id, id: d.id, label, levels: RET_LEVELS.map((lv) => ({ key: `${d.id}:${lv}`, lv, price: pb + (pa - pb) * lv })) });
    } else if (d.toolId === "fib-extension" && d.points.length >= 3) {
      const [pa, pb, pc] = d.points.map((p) => num(p.price));
      groups.push({ kind: "fib", key: d.id, id: d.id, label, levels: EXT_LEVELS.map((lv) => ({ key: `${d.id}:${lv}`, lv, price: pc + (pb - pa) * lv })).filter((l) => l.price > 0) });
    } else if (ZONE_TOOLS.has(d.toolId) && d.points.length >= 2) {
      const ps = d.points.map((p) => num(p.price)).filter((p) => p > 0);
      groups.push({ kind: "zone", key: d.id, id: d.id, label, low: Math.min(...ps), high: Math.max(...ps) });
    }
  }
  // 0.5% 안의 선은 한 줄로
  single.sort((a, b) => b.price - a.price);
  const rungs: Rung[] = [];
  for (const r of single) {
    const last = rungs[rungs.length - 1];
    if (last && Math.abs(last.price - r.price) / r.price < 0.005) {
      last.ids.push(...r.ids);
      last.label = `선 ${last.ids.length}개 겹침`;
      delete last.pts;
    } else rungs.push({ ...r, ids: [...r.ids] });
  }
  return { rungs, groups };
}

/** 가까운 순으로 위 n개 · 아래 n개 (나머지는 접어 둠) */
export function nearest(rungs: Rung[], current: number | undefined, n: number) {
  if (!current) return { above: rungs.slice(0, n), below: [] as Rung[], hidden: Math.max(0, rungs.length - n) };
  const above = rungs.filter((r) => r.price >= current);
  const below = rungs.filter((r) => r.price < current);
  const a = above.slice(-n); // 위쪽 중 현재가에 가까운 것 (값이 작은 쪽)
  const b = below.slice(0, n);
  return { above: a, below: b, hidden: rungs.length - a.length - b.length };
}

// ───────── 지지 · 저항 자동 분류 (2026-11-19 회의) ─────────
//   선 종류(수평선 · 추세선 · 채널 · 피보 · 구간)와 상관없이 같은 규칙: 지금 가격보다 아래 = 지지, 위 = 저항
//   지금 가격과 0.5% 안으로 겹치거나, 구간이 지금 가격을 걸치면 나눌 수 없음 → 투자자가 고름 (안 고르면 이행률에서 빠짐)
//   추세선 같은 기울어진 선은 차트 마지막 봉 기준: 그 봉 시각의 선 값이 봉 몸통 아래 = 지지, 위 = 저항, 몸통을 지나면 나눌 수 없음
export type Role = "지지" | "저항";
const NEAR = 0.005;
/** 마지막 봉 (기울어진 선 판단용) */
export type LastBar = { open: number; close: number };

export function classify(low: number, high: number, current: number | undefined, body?: LastBar): Role | null {
  if (body) {
    const [bLow, bHigh] = [Math.min(body.open, body.close), Math.max(body.open, body.close)];
    if (high < bLow) return "지지";
    if (low > bHigh) return "저항";
    return null;
  }
  if (!current) return null;
  if (high < current * (1 - NEAR)) return "지지";
  if (low > current * (1 + NEAR)) return "저항";
  return null;
}

/** 확정 노트에 남기는 선 하나 (서버 이행률 판정이 읽음) */
export type NoteLine = {
  /** 한 가격이면 price, 구간이면 low · high */
  price?: number;
  low?: number;
  high?: number;
  /** 선 열쇠 (드로잉 id, 피보 레벨이면 "id:0.618"). 같은 열쇠가 다음 메모에 또 오면 그걸로 바뀜 */
  key: string;
  label: string;
  /** 기울어진 선: 두 점 [시각(초), 가격] */
  pts?: [number, number][];
  /** 지지 · 저항 (null = 나눌 수 없고 투자자도 안 고름 → 이행률에서 빠짐) */
  role: "SUPPORT" | "RESISTANCE" | null;
  /** 알고리즘이 나눴는지 (false = 투자자가 고름) */
  auto: boolean;
  /** 투자자가 이 선에서 매매하겠다고 고름 (매수 · 손절 · 목표 등) */
  trade: string | null;
};

const ROLE_KEY = (key: string) => `role:${key}`;
/** 그 선의 역할: 알고리즘 분류가 우선, 나눌 수 없으면 투자자가 고른 것 */
export function roleOf(key: string, low: number, high: number, current: number | undefined, answers: Record<string, string>, body?: LastBar) {
  const auto = classify(low, high, current, body);
  if (auto) return { role: auto, auto: true };
  const picked = answers[ROLE_KEY(key)];
  return { role: picked === "지지" || picked === "저항" ? (picked as Role) : null, auto: false };
}
export const roleKey = ROLE_KEY;

/** 확정할 때 저장할 선 목록 */
export function noteLines(drawings: Drawing[], nowTime: number | undefined, current: number | undefined, answers: Record<string, string>, last?: LastBar, bars?: { time: number }[]): NoteLine[] {
  const { rungs, groups } = buildLadder(drawings, nowTime, bars);
  const out: NoteLine[] = [];
  const push = (key: string, label: string, low: number, high: number, pts?: [number, number][]) => {
    const { role, auto } = roleOf(key, low, high, current, answers, pts ? last : undefined);
    const trade = answers[key] || null;
    out.push({
      ...(low === high ? { price: low } : { low, high }),
      key,
      label,
      ...(pts ? { pts } : {}),
      role: role === "지지" ? "SUPPORT" : role === "저항" ? "RESISTANCE" : null,
      auto,
      trade,
    });
  };
  for (const r of rungs) push(r.key, r.label, r.price, r.price, r.pts);
  for (const g of groups) {
    if (g.kind === "zone") push(g.key, g.label, g.low, g.high);
    else for (const l of g.levels) push(l.key, `${g.label} ${l.lv}`, l.price, l.price);
  }
  return out;
}

/** 저장된 선의 t 시각(초) 값: 기울어진 선은 두 점을 이은 값(봉이 있으면 차트처럼 봉 순서 기준), 구간은 지지면 아래 · 저항이면 위 */
export function lineValueAt(l: NoteLine, t: number, bars?: { time: number }[]) {
  if (l.pts && l.pts.length >= 2) {
    const [[ta, pa], [tb, pb]] = l.pts;
    if (tb === ta) return pb;
    if (bars?.length) {
      const [la, lb, lt] = [timeToLogical(bars, ta), timeToLogical(bars, tb), timeToLogical(bars, t)];
      if (lb !== la) return pa + ((pb - pa) * (lt - la)) / (lb - la);
    }
    return pa + ((pb - pa) * (t - ta)) / (tb - ta);
  }
  if (l.price !== undefined) return l.price;
  return l.role === "RESISTANCE" ? (l.high ?? 0) : (l.low ?? 0);
}
