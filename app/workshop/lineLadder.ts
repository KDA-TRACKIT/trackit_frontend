// AI 노트 · 그은 선 정리: 현재가 기준 위(저항 후보) · 아래(지지 후보)로 가격순 사다리를 만든다
//   - 수평선류: 그 가격 그대로
//   - 추세선류: 오늘(마지막 봉) 시각에서의 값으로 (기울어진 선은 시간이 지나면 가격이 바뀌니까)
//   - 평행 채널: 추세선과 같은 로직으로 위 · 아래 두 선을 따로 (각각 마지막 봉 기준 지지 · 저항)
//   드로잉 도구별 (도구 75개 전부 확인, 2026-11-19):
//     한 가격 선     수평선 · 수평 반직선 · 십자선 · 가격 라벨
//     기울어진 선    추세선 · 반직선 · 연장선 · 추세 각도
//     채널(선 여러 개) 평행 채널(위 · 아래) · 평탄 상단/하단(기울어진 선 + 평평한 선) · 피치포크 3종(중앙선 + 양쪽 갈래)
//                    회귀 추세 채널(종가 회귀 ±2σ 위 · 아래) · 피보나치 채널(0 · 0.382 · 0.618 · 1)
//     레벨           피보나치 되돌림 · 추세 기반 피보나치 확장
//     구간           사각형
//     포지션         롱 · 숏 포지션: 진입 · 목표 · 손절 세 선, 매매(매수/매도 · 목표 · 손절)를 미리 골라 둠
//     제외(가격 지지 · 저항이 아님) 수직선 · 시간대 · 주기 · 사인선 · 원 · 호 · 팬/호류 · 날짜 범위 · VWAP · 매물대 · 예측
//                    · 화살표 · 마커 · 글 · 노트 · 말풍선 · 깃발 · 안내판 · 도형 · 경로 · 곡선 · 펜 · 형광펜 · 빠른 측정
//                    · 패턴 전부(헤드 앤 숄더 · 삼각형 · 엘리엇 … 모양을 보는 도구라 지지 · 저항으로 안 봄)
//                    · 재는 도구(정보선 · 가격 범위 · 날짜·가격 범위) · 갠 박스 · 갠 스퀘어 · 갠 팬(비율 격자)
//                    · 회전 사각형(기울어져 위 · 아래 가격이 구간이 아님) · 핀 · 가격 노트(표시 · 메모)
//   - 거의 같은 가격(0.5% 안)의 선은 한 줄로 묶음
//   - 피보나치 · 구간(사각형 등)은 여러 가격을 가지므로 따로 한 줄씩 (레벨 · 범위)
import { getTool, type Drawing } from "../../lib/drawing";

/** 한 가격에 그어진 선 */
const LEVEL_TOOLS = new Set(["horizontal-line", "horizontal-ray", "cross-line", "price-label"]);
/** 두 점으로 기울어진 선 → 오늘 값 */
const SLANT_TOOLS = new Set(["trendline", "ray", "extended-line", "trend-angle", "regression-trend"]);
/** 위아래가 있는 구간 */
const ZONE_TOOLS = new Set(["rectangle"]);
const FIB_CHANNEL_LEVELS = [0, 0.382, 0.618, 1];

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
  /** 도구가 미리 정한 매매 (롱 · 숏 포지션의 진입 · 목표 · 손절) */
  preset?: string;
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

/** 봉 순서 → 시각 (timeToLogical 의 반대) */
function logicalToTime(bars: { time: number }[], l: number) {
  const last = bars.length - 1;
  if (l >= last) return bars[last].time + (l - last) * step(bars);
  if (l <= 0) return bars[0].time + l * step(bars);
  const i = Math.floor(l);
  return bars[i].time + (bars[i + 1].time - bars[i].time) * (l - i);
}

/** 두 점 [시각, 가격] 을 이은 직선의 t 시각 값 (봉 순서 기준) */
function onLine(pts: [number, number][], t: number, bars?: { time: number }[]) {
  const [[ta, pa], [tb, pb]] = pts;
  if (tb === ta) return pb;
  if (bars?.length) {
    const [la, lb, lt] = [timeToLogical(bars, ta), timeToLogical(bars, tb), timeToLogical(bars, t)];
    if (lb !== la) return pa + ((pb - pa) * (lt - la)) / (lb - la);
  }
  return pa + ((pb - pa) * (t - ta)) / (tb - ta);
}

/** bars: 차트의 봉 (있으면 추세선 값을 차트와 같은 봉 순서로) */
export function buildLadder(drawings: Drawing[], nowTime: number | undefined, bars?: { time: number; close?: number }[]) {
  const single: Rung[] = [];
  const groups: Group[] = [];
  /** 지지 · 저항으로 보지 않는 드로잉 (글 · 화살표 · 시간 도구 등) */
  const skipped: { id: string; label: string }[] = [];
  const L = (t: number) => (bars?.length ? timeToLogical(bars, t) : t);
  const T = (l: number) => (bars?.length ? logicalToTime(bars, l) : l);
  /** 기울어진 선 하나 넣기 (값 = 오늘 · 마지막 봉 기준) */
  const slant = (key: string, id: string, label: string, pts: [number, number][], preset?: string) => {
    if (pts[0][0] === pts[1][0]) return;
    const v = onLine(pts, nowTime ?? pts[1][0], bars);
    if (v > 0) single.push({ key, ids: [id], price: v, label: nowTime ? `${label} · 오늘 값` : label, pts, ...(preset ? { preset } : {}) });
  };
  for (const d of drawings) {
    const label = getTool(d.toolId)?.label ?? d.toolId;
    const p0 = num(d.points[0]?.price);
    if (!(p0 > 0)) {
      skipped.push({ id: d.id, label });
      continue;
    }
    const P = (i: number) => num(d.points[i]?.price);
    const Tm = (i: number) => d.points[i]?.time;
    if (d.toolId === "long-position" || d.toolId === "short-position") {
      // 0 = 진입, 1 = 목표, 2 = 손절 (lib/drawing/tools/forecast.ts)
      const long = d.toolId === "long-position";
      const parts: [string, number, string][] = [["진입", P(0), long ? "매수" : "매도"], ["목표", P(1), "목표"], ["손절", P(2), "손절"]];
      for (const [name, price, preset] of parts) if (price > 0) single.push({ key: `${d.id}:${name}`, ids: [d.id], price, label: `${label} ${name}`, preset });
      continue;
    }
    if (d.toolId === "flat-top-bottom" && d.points.length >= 3) {
      slant(`${d.id}:slant`, d.id, `${label} 기울기선`, [[Tm(0), P(0)], [Tm(1), P(1)]]);
      single.push({ key: `${d.id}:flat`, ids: [d.id], price: P(2), label: `${label} 평평한 선` });
      continue;
    }
    if ((d.toolId === "pitchfork" || d.toolId === "schiff-pitchfork" || d.toolId === "modified-schiff") && d.points.length >= 3) {
      // 손잡이(h)에서 B · C 중점(m)으로 가는 방향으로 h · B · C 를 지나는 세 선 (차트와 같은 계산, 시간은 봉 순서)
      const [la, lb, lc] = [L(Tm(0)), L(Tm(1)), L(Tm(2))];
      const h = d.toolId === "pitchfork" ? [la, P(0)] : d.toolId === "schiff-pitchfork" ? [la, (P(0) + P(1)) / 2] : [(la + lb) / 2, (P(0) + P(1)) / 2];
      const m = [(lb + lc) / 2, (P(1) + P(2)) / 2];
      const dl = m[0] - h[0] || 1;
      const dp = m[1] - h[1];
      const through = (l: number, p: number): [number, number][] => [[T(l), p], [T(l + dl), p + dp]];
      slant(`${d.id}:mid`, d.id, `${label} 중앙선`, through(h[0], h[1]));
      slant(`${d.id}:b`, d.id, `${label} 갈래 B`, through(lb, P(1)));
      slant(`${d.id}:c`, d.id, `${label} 갈래 C`, through(lc, P(2)));
      continue;
    }
    if (d.toolId === "fib-channel" && d.points.length >= 3) {
      const base: [number, number][] = [[Tm(0), P(0)], [Tm(1), P(1)]];
      if (Tm(0) === Tm(1)) continue;
      const off = P(2) - onLine(base, Tm(2), bars);
      for (const lv of FIB_CHANNEL_LEVELS) slant(`${d.id}:${lv}`, d.id, `${label} ${lv}`, [[Tm(0), P(0) + off * lv], [Tm(1), P(1) + off * lv]]);
      continue;
    }
    if (d.toolId === "regression-trend" && d.points.length >= 2) {
      // 두 점 사이 봉의 종가를 봉 순서에 대해 선형 회귀, ±2σ 위 · 아래 (차트와 같은 계산). 종가가 없으면 뺌
      const [t1, t2] = [Tm(0), Tm(1)].sort((x, y) => x - y);
      const inside = (bars ?? []).filter((b) => b.time >= t1 && b.time <= t2 && typeof b.close === "number");
      if (inside.length < 2) {
        skipped.push({ id: d.id, label });
        continue;
      }
      const n = inside.length;
      const mx = (n - 1) / 2;
      const my = inside.reduce((a, b) => a + (b.close as number), 0) / n;
      let sxy = 0;
      let sxx = 0;
      inside.forEach((b, i) => {
        sxy += (i - mx) * ((b.close as number) - my);
        sxx += (i - mx) ** 2;
      });
      const k = sxx ? sxy / sxx : 0;
      const fit = (i: number) => my + k * (i - mx);
      const sd = Math.sqrt(inside.reduce((a, b, i) => a + ((b.close as number) - fit(i)) ** 2, 0) / n);
      const ends = (o: number): [number, number][] => [[inside[0].time, fit(0) + o], [inside[n - 1].time, fit(n - 1) + o]];
      slant(`${d.id}:up`, d.id, `${label} 위`, ends(2 * sd));
      slant(`${d.id}:dn`, d.id, `${label} 아래`, ends(-2 * sd));
      continue;
    }
    if (LEVEL_TOOLS.has(d.toolId)) single.push({ key: d.id, ids: [d.id], price: p0, label });
    else if (SLANT_TOOLS.has(d.toolId) && d.points.length >= 2) {
      const [a, b] = d.points;
      // 클릭만 해서 두 점이 같은 시각인 선(길이 0 · 세로선)은 화면에 안 보이니 빼고
      if (a.time === b.time) continue;
      const v = nowTime ? at(d, nowTime, bars) : num(d.points[d.points.length - 1].price);
      const pts: [number, number][] = [[a.time, num(a.price)], [b.time, num(b.price)]];
      if (v > 0) single.push({ key: d.id, ids: [d.id], price: v, label: nowTime ? `${label} · 오늘 값` : label, pts });
    } else if (d.toolId === "parallel-channel" && d.points.length >= 3) {
      // 기준선(1 · 2번 점) + 3번 점으로 정한 평행선 → 추세선 두 개처럼 (차트도 같은 간격으로 평행선을 그림)
      const [a, b, c] = d.points;
      if (a.time === b.time) continue;
      const base: [number, number][] = [[a.time, num(a.price)], [b.time, num(b.price)]];
      const off = num(c.price) - onLine(base, c.time, bars);
      const par: [number, number][] = [[a.time, num(a.price) + off], [b.time, num(b.price) + off]];
      const t = nowTime ?? b.time;
      const [vb, vp] = [onLine(base, t, bars), onLine(par, t, bars)];
      const upperIsBase = vb >= vp;
      const sfx = nowTime ? " · 오늘 값" : "";
      for (const [which, pts, v] of [["base", base, vb], ["par", par, vp]] as const) {
        const upper = (which === "base") === upperIsBase;
        if (v > 0) single.push({ key: `${d.id}:${which}`, ids: [d.id], price: v, label: `${label} ${upper ? "위" : "아래"}${sfx}`, pts: pts as [number, number][] });
      }
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
    } else skipped.push({ id: d.id, label });
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
      if (r.preset && !last.preset) last.preset = r.preset;
    } else rungs.push({ ...r, ids: [...r.ids] });
  }
  return { rungs, groups, skipped };
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
  const push = (key: string, label: string, low: number, high: number, pts?: [number, number][], preset?: string) => {
    const { role, auto } = roleOf(key, low, high, current, answers, pts ? last : undefined);
    const trade = (key in answers ? answers[key] : preset) || null;
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
  for (const r of rungs) push(r.key, r.label, r.price, r.price, r.pts, r.preset);
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
