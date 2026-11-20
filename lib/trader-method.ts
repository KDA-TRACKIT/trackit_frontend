// 트레이더 규칙 조건 확인 (2026-11-20): 트레이더가 쓰는 규칙(scripts/market-sim/sim.py 의 R_* 와 같은 계산)을
//   어느 종목 일봉에 돌려 그날 매수 조건이 하나씩 맞는지 본다. 전략 분석 채팅의 '매매 전 체크' · '이행 분석'에서 씀
import type { Bar } from "./mock/workshop";

export type MethodCheck = { label: string; ok: boolean; detail?: string };
export type MethodResult = { checks: MethodCheck[]; note?: string };

const sma = (xs: number[], n: number) => xs.map((_, i) => (i + 1 < n ? NaN : xs.slice(i + 1 - n, i + 1).reduce((s, v) => s + v, 0) / n));
const ema = (xs: number[], n: number) => {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i ? x * k + out[i - 1] * (1 - k) : x));
  return out;
};
function rsiSeries(c: number[], n = 14) {
  const out: number[] = c.map(() => NaN);
  let g = 0;
  let l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    const up = Math.max(d, 0);
    const dn = Math.max(-d, 0);
    if (i <= n) {
      g += up / n;
      l += dn / n;
      if (i === n) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    } else {
      g = (g * (n - 1) + up) / n;
      l = (l * (n - 1) + dn) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
  }
  return out;
}
const stdev = (xs: number[], n: number) =>
  xs.map((_, i) => {
    if (i + 1 < n) return NaN;
    const w = xs.slice(i + 1 - n, i + 1);
    const m = w.reduce((s, v) => s + v, 0) / n;
    return Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / n);
  });

type Ctx = { b: Bar[]; i: number; c: number[]; ma20: number[]; ma60: number[]; ma120: number[]; v20: number[]; rsi: number[]; fmt: (n: number) => string };
const bull = (x: Ctx, k = x.i) => x.b[k].close > x.b[k].open;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function swingLows(b: Bar[], i: number, look: number, w: number) {
  const out: number[] = [];
  for (let k = Math.max(w, i - look); k < i - w; k++) {
    let ok = true;
    for (let j = k - w; j <= k + w; j++) if (b[j].low < b[k].low) ok = false;
    if (ok) out.push(k);
  }
  return out;
}
function zigzag(b: Bar[], start: number, end: number, th: number) {
  const piv: [number, number, "H" | "L"][] = [];
  let trend: "up" | "down" | null = null;
  let ext = start;
  for (let k = start + 1; k <= end; k++) {
    const c = b[k].close;
    if (!trend) {
      if (c >= b[ext].close * (1 + th)) (piv.push([ext, b[ext].low, "L"]), (trend = "up"), (ext = k));
      else if (c <= b[ext].close * (1 - th)) (piv.push([ext, b[ext].high, "H"]), (trend = "down"), (ext = k));
    } else if (trend === "up") {
      if (c > b[ext].close) ext = k;
      else if (c <= b[ext].close * (1 - th)) (piv.push([ext, b[ext].high, "H"]), (trend = "down"), (ext = k));
    } else {
      if (c < b[ext].close) ext = k;
      else if (c >= b[ext].close * (1 + th)) (piv.push([ext, b[ext].low, "L"]), (trend = "up"), (ext = k));
    }
  }
  return piv;
}
const lineAt = (k1: number, v1: number, k2: number, v2: number, k: number) => (k2 === k1 ? v1 : v1 + ((v2 - v1) / (k2 - k1)) * (k - k1));

type Method = (x: Ctx) => MethodResult;

const support: Method = (x) => {
  const { b, i } = x;
  let k = i - 20;
  for (let j = i - 20; j < i - 2; j++) if (b[j].low < b[k].low) k = j;
  const sup = b[k].low;
  return {
    checks: [
      { label: `저가가 20일 지지선 ${x.fmt(sup)} 1.2% 안`, ok: b[i].low <= sup * 1.012, detail: pct((b[i].low / sup - 1) * 100) },
      { label: "양봉", ok: bull(x) },
      { label: "종가가 지지선 위", ok: b[i].close > sup },
    ],
  };
};
const volume: Method = (x) => {
  const { b, i } = x;
  const r = b[i].volume / x.v20[i - 1];
  return {
    checks: [
      { label: "거래량 평소의 2.2배 넘음", ok: r > 2.2, detail: `${r.toFixed(1)}배` },
      { label: "전일 대비 +3% 넘는 상승", ok: b[i].close > b[i - 1].close * 1.03, detail: pct((b[i].close / b[i - 1].close - 1) * 100) },
      { label: "종가가 20일선 위", ok: b[i].close > x.ma20[i] },
    ],
  };
};
const pullback: Method = (x) => {
  const { b, i, ma20, ma60 } = x;
  return {
    checks: [
      { label: "정배열 (20일선 > 60일선)", ok: ma20[i] > ma60[i] },
      { label: "20일선 오르는 중", ok: ma20[i] > ma20[i - 5] },
      { label: "20일선까지 눌림 (저가 ≤ 20일선 +1%)", ok: b[i].low <= ma20[i] * 1.01, detail: pct((b[i].low / ma20[i] - 1) * 100) },
      { label: "종가가 20일선 위에서 지지", ok: b[i].close > ma20[i] },
    ],
  };
};
const maCross: Method = (x) => {
  const { b, i, ma20, ma60 } = x;
  return {
    checks: [
      { label: "20일선이 60일선을 위로 뚫음", ok: ma20[i - 1] <= ma60[i - 1] && ma20[i] > ma60[i], detail: ma20[i] > ma60[i] ? "20일선이 위" : "20일선이 아래" },
      { label: "종가가 20일선 위", ok: b[i].close > ma20[i] },
    ],
  };
};
const box: Method = (x) => {
  const { b, i } = x;
  const w = b.slice(i - 20, i);
  const top = Math.max(...w.map((v) => v.high));
  const bot = Math.min(...w.map((v) => v.low));
  return {
    checks: [
      { label: "20일 박스 폭 18% 안", ok: (top - bot) / bot < 0.18, detail: `${(((top - bot) / bot) * 100).toFixed(0)}%` },
      { label: `종가가 박스 상단 ${x.fmt(top)} 돌파`, ok: b[i].close > top },
      { label: "거래량 1.5배 넘음", ok: b[i].volume > 1.5 * x.v20[i - 1], detail: `${(b[i].volume / x.v20[i - 1]).toFixed(1)}배` },
    ],
  };
};
const rsiRule =
  (lo: number): Method =>
  (x) => ({ checks: [{ label: `RSI 가 ${lo} 아래에서 위로`, ok: x.rsi[x.i - 1] < lo && x.rsi[x.i] >= lo, detail: `${x.rsi[x.i - 1].toFixed(0)} → ${x.rsi[x.i].toFixed(0)}` }] });
const value: Method = (x) => {
  const { b, i, ma120, rsi } = x;
  return {
    checks: [
      { label: "120일선보다 15% 넘게 아래", ok: b[i].close < ma120[i] * 0.85, detail: pct((b[i].close / ma120[i] - 1) * 100) },
      { label: "RSI 40 아래", ok: rsi[i] < 40, detail: rsi[i].toFixed(0) },
      { label: "양봉", ok: bull(x) },
    ],
  };
};
const engulf: Method = (x) => {
  const { b, i, ma20 } = x;
  const p = b[i - 1];
  const t = b[i];
  return {
    checks: [
      { label: "상승 장악형 (전날 음봉을 오늘 양봉이 감쌈)", ok: p.close < p.open && t.close > t.open && t.open <= p.close && t.close >= p.open },
      { label: "20일선 3% 안", ok: Math.abs(t.low - ma20[i]) / ma20[i] < 0.03 },
    ],
  };
};
const bb: Method = (x) => {
  const { b, i, ma20, c } = x;
  const sd = stdev(c, 20);
  const dn = ma20.map((m, k) => m - 2 * sd[k]);
  return {
    checks: [
      { label: "어제 종가가 볼린저 밴드 하단 밖", ok: b[i - 1].close < dn[i - 1] },
      { label: "오늘 밴드 안으로 복귀", ok: b[i].close > dn[i] },
    ],
  };
};
const gap: Method = (x) => ({ checks: [{ label: "시가가 전일 고가보다 2% 넘게 위", ok: x.b[x.i].open > x.b[x.i - 1].high * 1.02, detail: pct((x.b[x.i].open / x.b[x.i - 1].high - 1) * 100) }] });
const weekly: Method = (x) => {
  const { b, i } = x;
  const lows = swingLows(b, i, 60, 4);
  const [k1, k2] = lows.slice(-2);
  if (k1 === undefined || k2 === undefined || b[k2].low <= b[k1].low) return { checks: [{ label: "오르는 저점 두 개", ok: false }], note: "최근 60일에 오르는 저점 두 개가 없어요." };
  const line = lineAt(k1, b[k1].low, k2, b[k2].low, i);
  return {
    checks: [
      { label: "오르는 저점 두 개", ok: true },
      { label: `저가가 추세선 ${x.fmt(line)} 1.5% 안`, ok: b[i].low <= line * 1.015, detail: pct((b[i].low / line - 1) * 100) },
      { label: "추세선 위 양봉", ok: b[i].close > line && bull(x) },
    ],
  };
};
const trendbreak: Method = (x) => {
  const { b, i, ma20 } = x;
  const hi = Math.max(...b.slice(i - 50, i).map((v) => v.high));
  return {
    checks: [
      { label: `종가가 50일 고점 ${x.fmt(hi)} 돌파`, ok: b[i].close > hi, detail: pct((b[i].close / hi - 1) * 100) },
      { label: "20일선 오르는 중", ok: ma20[i] > ma20[i - 10] },
    ],
  };
};
const vbo: Method = (x) => {
  const trig = x.b[x.i].open + 0.5 * (x.b[x.i - 1].high - x.b[x.i - 1].low);
  return { checks: [{ label: `고가가 시가 + 전일 변동폭 × 0.5 (${x.fmt(trig)}) 넘음`, ok: x.b[x.i].high > trig }] };
};
const macd: Method = (x) => {
  const e26 = ema(x.c, 26);
  const m = ema(x.c, 12).map((v, k) => v - e26[k]);
  const s = ema(m, 9);
  const { i } = x;
  return {
    checks: [
      { label: "MACD 가 시그널을 위로 뚫음", ok: m[i - 1] <= s[i - 1] && m[i] > s[i] },
      { label: "0선 아래에서", ok: m[i] < 0 },
    ],
  };
};
const channel: Method = (x) => {
  const { b, i } = x;
  const n = 40;
  const xs = Array.from({ length: n }, (_, j) => i - n + j);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = xs.reduce((s, k) => s + b[k].close, 0) / n;
  const slope = xs.reduce((s, k) => s + (k - mx) * (b[k].close - my), 0) / xs.reduce((s, k) => s + (k - mx) ** 2, 0);
  const reg = (k: number) => my + slope * (k - mx);
  const up = Math.max(...xs.map((k) => b[k].high - reg(k)));
  const dn = Math.min(...xs.map((k) => b[k].low - reg(k)));
  const lo = reg(i) + dn;
  const width = (up - dn) / reg(i);
  return {
    checks: [
      { label: "40일 회귀 채널이 오르는 중", ok: slope > 0, detail: `하루 ${pct((slope / reg(i)) * 100)}` },
      { label: "채널 폭 25% 안", ok: width <= 0.25, detail: `${(width * 100).toFixed(0)}%` },
      { label: `저가가 채널 하단 ${x.fmt(lo)} 1% 안`, ok: b[i].low <= lo * 1.01, detail: pct((b[i].low / lo - 1) * 100) },
      { label: "하단 위 양봉", ok: b[i].close > lo && bull(x) },
    ],
  };
};
const fib: Method = (x) => {
  const { b, i } = x;
  let lo = i - 60;
  for (let k = i - 60; k < i - 8; k++) if (b[k].low < b[lo].low) lo = k;
  let hi = lo + 1;
  for (let k = lo + 1; k < i - 3; k++) if (b[k].high > b[hi].high) hi = k;
  const L = b[lo].low;
  const H = b[hi].high;
  const lv = (f: number) => H - f * (H - L);
  return {
    checks: [
      { label: "60일 안 15% 넘는 상승 스윙", ok: H / L >= 1.15, detail: pct((H / L - 1) * 100) },
      { label: `피보나치 0.5~0.618 구간 (${x.fmt(lv(0.618))}~${x.fmt(lv(0.5))}) 터치`, ok: b[i].low <= lv(0.5) && b[i].close > lv(0.618) },
      { label: "양봉 지지", ok: bull(x) },
    ],
  };
};
const elliott: Method = (x) => {
  const p = zigzag(x.b, x.i - 130, x.i, 0.07).slice(-5);
  if (p.length < 5 || p.map((v) => v[2]).join("") !== "LHLHL") return { checks: [{ label: "0-1-2-3-4 파동", ok: false }], note: "최근 130일에 0-1-2-3-4 파동 모양이 없어요." };
  const [p0, p1, p2, p3, p4] = p;
  const w1 = p1[1] - p0[1];
  return {
    checks: [
      { label: "2파가 1파의 38~79% 되돌림", ok: w1 > 0 && (p1[1] - p2[1]) / w1 >= 0.38 && (p1[1] - p2[1]) / w1 <= 0.79 },
      { label: "3파가 1파보다 김", ok: p3[1] - p2[1] > w1 },
      { label: "4파가 1파 고점 위", ok: p4[1] > p1[1] },
    ],
  };
};
const ihs: Method = (x) => {
  const p = zigzag(x.b, x.i - 130, x.i, 0.05).slice(-5);
  if (p.length < 5 || p.map((v) => v[2]).join("") !== "LHLHL") return { checks: [{ label: "어깨-머리-어깨 꼭지", ok: false }], note: "최근 꼭지가 역헤드앤숄더 순서가 아니에요." };
  const [ls, h1, hd, h2, rs] = p;
  const neck = lineAt(h1[0], h1[1], h2[0], h2[1], x.i);
  return {
    checks: [
      { label: "머리가 양 어깨보다 3% 넘게 낮음", ok: hd[1] < ls[1] * 0.97 && hd[1] < rs[1] * 0.97 },
      { label: "두 어깨 높이 10% 안", ok: Math.abs(ls[1] - rs[1]) / Math.max(ls[1], rs[1]) < 0.1 },
      { label: `종가가 넥라인 ${x.fmt(neck)} 돌파`, ok: x.b[x.i].close > neck },
    ],
  };
};
const dbottom: Method = (x) => {
  const p = zigzag(x.b, x.i - 100, x.i, 0.05).slice(-3);
  if (p.length < 3 || p.map((v) => v[2]).join("") !== "LHL") return { checks: [{ label: "저-고-저 꼭지 (W)", ok: false }], note: "최근 꼭지가 W 순서가 아니에요." };
  const [l1, h1, l2] = p;
  return {
    checks: [
      { label: "두 바닥 높이 4% 안", ok: Math.abs(l2[1] - l1[1]) / l1[1] < 0.04 },
      { label: "두 바닥 10일 넘게 떨어짐", ok: l2[0] - l1[0] >= 10 },
      { label: `종가가 넥라인 ${x.fmt(h1[1])} 돌파`, ok: x.b[x.i].close > h1[1] },
    ],
  };
};
const asctri: Method = (x) => {
  const piv = zigzag(x.b, x.i - 60, x.i, 0.04).filter((v) => v[0] >= x.i - 40);
  const hs = piv.filter((v) => v[2] === "H");
  const ls = piv.filter((v) => v[2] === "L");
  if (hs.length < 2 || ls.length < 2) return { checks: [{ label: "고점 2개 · 저점 2개", ok: false }], note: "최근 40일에 삼각형 꼭지가 모자라요." };
  const top = Math.max(...hs.map((v) => v[1]));
  return {
    checks: [
      { label: "천장이 평평 (2.5% 안)", ok: (top - Math.min(...hs.slice(-2).map((v) => v[1]))) / top <= 0.025 },
      { label: "저점이 계속 높아짐", ok: ls.every((v, j) => !j || v[1] > ls[j - 1][1]) },
      { label: `종가가 천장 ${x.fmt(top)} 돌파`, ok: x.b[x.i].close > top },
    ],
  };
};
const cup: Method = (x) => {
  const { b, i } = x;
  const arg = (from: number, to: number, f: (k: number) => number, max: boolean) => {
    let best = from;
    for (let k = from; k < to; k++) if (max ? f(k) > f(best) : f(k) < f(best)) best = k;
    return best;
  };
  const lk = arg(i - 90, i - 35, (k) => b[k].high, true);
  const bk = arg(lk + 5, i - 10, (k) => b[k].low, false);
  const rk = arg(bk + 5, i - 3, (k) => b[k].high, true);
  const L = b[lk].high;
  const rim = Math.max(L, b[rk].high);
  const depth = (L - b[bk].low) / L;
  return {
    checks: [
      { label: "컵 깊이 12~35%", ok: depth >= 0.12 && depth <= 0.35, detail: `${(depth * 100).toFixed(0)}%` },
      { label: "양쪽 테두리 높이 5% 안", ok: Math.abs(b[rk].high - L) / L < 0.05 },
      { label: `종가가 테두리 ${x.fmt(rim)} 돌파`, ok: b[i].close > rim },
    ],
  };
};
const flag: Method = (x) => {
  const { b, i } = x;
  for (let f = 4; f < 16; f++) {
    const pk = i - f - 1;
    let sk = pk - 12;
    for (let k = pk - 12; k < pk; k++) if (b[k].low < b[sk].low) sk = k;
    if ((b[pk].high - b[sk].low) / b[sk].low < 0.15) continue;
    const ks = Array.from({ length: i - pk - 1 }, (_, j) => pk + 1 + j);
    const n = ks.length;
    const mk = ks.reduce((s, v) => s + v, 0) / n;
    const mh = ks.reduce((s, k) => s + b[k].high, 0) / n;
    const den = ks.reduce((s, k) => s + (k - mk) ** 2, 0) || 1;
    const sh = ks.reduce((s, k) => s + (k - mk) * (b[k].high - mh), 0) / den;
    if (sh >= 0) continue;
    const upOff = Math.max(...ks.map((k) => b[k].high - (mh + sh * (k - mk))));
    const upper = mh + sh * (i - mk) + upOff;
    return {
      checks: [
        { label: "12일 안 15% 넘는 깃대 + 아래로 기운 깃발", ok: true },
        { label: `종가가 깃발 윗선 ${x.fmt(upper)} 돌파`, ok: b[i].close > upper },
      ],
    };
  }
  return { checks: [{ label: "깃대 + 아래로 기운 깃발", ok: false }], note: "최근 4~15일 안에 깃발 모양이 없어요." };
};
const kiyoung: Method = (x) => {
  const w = x.b.slice(x.i - 30, x.i);
  const top = Math.max(...w.map((v) => v.high));
  const bot = Math.min(...w.map((v) => v.low));
  const width = (top - bot) / bot;
  return {
    checks: [
      { label: "30일 옆으로 기는 구간 (폭 5~20%)", ok: width >= 0.05 && width <= 0.2, detail: `${(width * 100).toFixed(0)}%` },
      { label: `종가가 머리 꼭대기 ${x.fmt(top)} 돌파`, ok: x.b[x.i].close > top },
    ],
  };
};

const METHODS: Record<string, Method> = {
  support,
  volume,
  pullback,
  ma: maCross,
  risk: maCross,
  box,
  rsi: rsiRule(30),
  rsi_deep: rsiRule(25),
  value,
  engulf,
  bb,
  gap,
  weekly,
  trendbreak,
  vbo,
  macd,
  channel,
  fib,
  elliott,
  ihs,
  dbottom,
  asctri,
  cup,
  flag,
  kiyoung,
  kiyoung_old: kiyoung,
};

/** 일봉 at 번째 봉(기본: 마지막) 기준으로 트레이더 매수 조건 확인. 봉이 모자라거나 모르는 규칙이면 null */
export function checkRule(ruleKey: string, bars: Bar[], fmt: (n: number) => string, at = bars.length - 1): MethodResult | null {
  const m = METHODS[ruleKey];
  if (!m || at < 135 || at >= bars.length) return null;
  const upto = bars.slice(0, at + 1);
  const c = upto.map((v) => v.close);
  const ctx: Ctx = { b: upto, i: at, c, ma20: sma(c, 20), ma60: sma(c, 60), ma120: sma(c, 120), v20: sma(upto.map((v) => v.volume), 20), rsi: rsiSeries(c), fmt };
  try {
    return m(ctx);
  } catch {
    return null;
  }
}
