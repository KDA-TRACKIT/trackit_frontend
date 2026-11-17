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
};
export type Level = { key: string; lv: number; price: number };
export type Group =
  | { kind: "fib"; key: string; id: string; label: string; levels: Level[] }
  | { kind: "zone"; key: string; id: string; label: string; low: number; high: number };

const num = (s: string | undefined) => Number(s ?? NaN);

/** 기울어진 선의 t 시각 값 (두 점을 이은 직선) */
function at(d: Drawing, t: number) {
  const [a, b] = d.points;
  const pa = num(a?.price);
  const pb = num(b?.price ?? a?.price);
  if (!b || b.time === a.time) return pb;
  return pa + ((pb - pa) * (t - a.time)) / (b.time - a.time);
}

export function buildLadder(drawings: Drawing[], nowTime: number | undefined) {
  const single: Rung[] = [];
  const groups: Group[] = [];
  for (const d of drawings) {
    const label = getTool(d.toolId)?.label ?? d.toolId;
    const p0 = num(d.points[0]?.price);
    if (!(p0 > 0)) continue;
    if (LEVEL_TOOLS.has(d.toolId)) single.push({ key: d.id, ids: [d.id], price: p0, label });
    else if (SLANT_TOOLS.has(d.toolId) && d.points.length >= 2) {
      const v = nowTime ? at(d, nowTime) : num(d.points[d.points.length - 1].price);
      if (v > 0) single.push({ key: d.id, ids: [d.id], price: v, label: nowTime ? `${label} · 오늘 값` : label });
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
