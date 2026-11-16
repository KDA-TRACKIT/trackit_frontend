// 지표 목록. 여기 정의를 추가하면 지표 창(검색·분류)·차트·저장에 그대로 반영된다
import type { Bar } from "../mock/workshop";
import { ema, highest, lowest, map, rma, shift, sma, stdev, wma, zip, type Series } from "./math";
import type { IndicatorDef } from "./types";

const closes = (bars: Bar[]): Series => bars.map((b) => b.close);
const highs = (bars: Bar[]): Series => bars.map((b) => b.high);
const lows = (bars: Bar[]): Series => bars.map((b) => b.low);
const typical = (bars: Bar[]): Series => bars.map((b) => (b.high + b.low + b.close) / 3);

function trueRange(bars: Bar[]): Series {
  return bars.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
}

function rsiOf(values: Series, n: number): Series {
  const gain: Series = values.map((v, i) => (i === 0 || v === null || values[i - 1] === null ? null : Math.max(v - (values[i - 1] as number), 0)));
  const loss: Series = values.map((v, i) => (i === 0 || v === null || values[i - 1] === null ? null : Math.max((values[i - 1] as number) - v, 0)));
  return zip(rma(gain, n), rma(loss, n), (g, l) => (l === 0 ? 100 : 100 - 100 / (1 + g / l)));
}

/** (값 - 최저) / (최고 - 최저) × 100 */
function stochOf(value: Series, hi: Series, lo: Series): Series {
  return value.map((v, i) => {
    const h = hi[i];
    const l = lo[i];
    if (v === null || h === null || l === null) return null;
    return h === l ? 50 : ((v - l) / (h - l)) * 100;
  });
}

const n = (key = "period", label = "기간", def = 20, max = 500) => ({ key, label, default: def, min: 1, max, step: 1 });

/** 이동평균선 묶음 기본 기간·색 (단기 → 장기) */
export const MA_PERIODS = [5, 20, 60, 120];
const MA_COLORS = ["#f59f00", "#e03131", "#2f9e44", "#7048e8"];

const BASE_LIBRARY: IndicatorDef[] = [
  // ───────── 추세 (가격 차트 위)
  {
    id: "sma",
    name: "이동평균선",
    short: "MA",
    category: "추세",
    description: "종가 단순 평균 4개 묶음 (기본 5·20·60·120). 기간을 0 으로 하면 그 선은 숨김",
    placement: "overlay",
    // 한 묶음 = 지표 1개. 선마다 기간·색을 따로 정한다
    params: MA_PERIODS.map((d, i) => ({ key: `p${i + 1}`, label: `${i + 1}번 기간`, default: d, min: 0, max: 500, step: 1 })),
    outputs: MA_COLORS.map((color, i) => ({ key: `m${i + 1}`, label: `${i + 1}번 선`, kind: "line" as const, color })),
    compute: (bars, p) => {
      const c = closes(bars);
      return Object.fromEntries(MA_PERIODS.map((_, i) => [`m${i + 1}`, p[`p${i + 1}`] > 0 ? sma(c, p[`p${i + 1}`]) : c.map(() => null)]));
    },
  },
  {
    id: "ema",
    name: "지수이동평균",
    short: "EMA",
    category: "추세",
    description: "최근 값에 더 큰 가중치를 둔 평균",
    placement: "overlay",
    params: [n()],
    outputs: [{ key: "v", label: "EMA", kind: "line", color: "#1098ad" }],
    compute: (bars, p) => ({ v: ema(closes(bars), p.period) }),
  },
  {
    id: "wma",
    name: "가중이동평균",
    short: "WMA",
    category: "추세",
    description: "최근 값일수록 선형으로 큰 가중치",
    placement: "overlay",
    params: [n()],
    outputs: [{ key: "v", label: "WMA", kind: "line", color: "#d6336c" }],
    compute: (bars, p) => ({ v: wma(closes(bars), p.period) }),
  },
  {
    id: "bb",
    name: "볼린저 밴드",
    short: "BB",
    category: "추세",
    description: "이동평균 ± 표준편차 × 배수",
    placement: "overlay",
    params: [n(), { key: "mult", label: "배수", default: 2, min: 0.5, max: 5, step: 0.1 }],
    outputs: [
      { key: "upper", label: "상단", kind: "line", color: "#868e96", dashed: true },
      { key: "mid", label: "중심", kind: "line", color: "#868e96" },
      { key: "lower", label: "하단", kind: "line", color: "#868e96", dashed: true },
    ],
    compute: (bars, p) => {
      const mid = sma(closes(bars), p.period);
      const sd = stdev(closes(bars), p.period);
      return { mid, upper: zip(mid, sd, (m, s) => m + p.mult * s), lower: zip(mid, sd, (m, s) => m - p.mult * s) };
    },
  },
  {
    id: "envelope",
    name: "엔벨로프",
    short: "ENV",
    category: "추세",
    description: "이동평균 ± 일정 비율(%)",
    placement: "overlay",
    params: [n(), { key: "pct", label: "비율(%)", default: 6, min: 0.1, max: 50, step: 0.1 }],
    outputs: [
      { key: "upper", label: "상단", kind: "line", color: "#e8590c", dashed: true },
      { key: "mid", label: "중심", kind: "line", color: "#e8590c" },
      { key: "lower", label: "하단", kind: "line", color: "#e8590c", dashed: true },
    ],
    compute: (bars, p) => {
      const mid = sma(closes(bars), p.period);
      return { mid, upper: map(mid, (m) => m * (1 + p.pct / 100)), lower: map(mid, (m) => m * (1 - p.pct / 100)) };
    },
  },
  {
    id: "keltner",
    name: "켈트너 채널",
    short: "KC",
    category: "추세",
    description: "지수이동평균 ± ATR × 배수",
    placement: "overlay",
    params: [n(), n("atr", "ATR 기간", 10), { key: "mult", label: "배수", default: 2, min: 0.5, max: 5, step: 0.1 }],
    outputs: [
      { key: "upper", label: "상단", kind: "line", color: "#0ca678", dashed: true },
      { key: "mid", label: "중심", kind: "line", color: "#0ca678" },
      { key: "lower", label: "하단", kind: "line", color: "#0ca678", dashed: true },
    ],
    compute: (bars, p) => {
      const mid = ema(closes(bars), p.period);
      const atr = rma(trueRange(bars), p.atr);
      return { mid, upper: zip(mid, atr, (m, a) => m + p.mult * a), lower: zip(mid, atr, (m, a) => m - p.mult * a) };
    },
  },
  {
    id: "donchian",
    name: "돈치안 채널",
    short: "DC",
    category: "추세",
    description: "기간 최고가·최저가와 그 중간",
    placement: "overlay",
    params: [n()],
    outputs: [
      { key: "upper", label: "상단", kind: "line", color: "#3b5bdb" },
      { key: "mid", label: "중간", kind: "line", color: "#3b5bdb", dashed: true },
      { key: "lower", label: "하단", kind: "line", color: "#3b5bdb" },
    ],
    compute: (bars, p) => {
      const upper = highest(highs(bars), p.period);
      const lower = lowest(lows(bars), p.period);
      return { upper, lower, mid: zip(upper, lower, (u, l) => (u + l) / 2) };
    },
  },
  {
    id: "ichimoku",
    name: "일목균형표",
    short: "일목",
    category: "추세",
    description: "전환선·기준선·선행스팬·후행스팬 (선행스팬의 미래 구간은 봉이 있는 데까지만)",
    placement: "overlay",
    params: [n("conv", "전환선", 9), n("base", "기준선", 26), n("span", "선행스팬2", 52)],
    outputs: [
      { key: "conv", label: "전환선", kind: "line", color: "#f03e3e" },
      { key: "base", label: "기준선", kind: "line", color: "#1c7ed6" },
      { key: "a", label: "선행1", kind: "line", color: "#37b24d", dashed: true },
      { key: "b", label: "선행2", kind: "line", color: "#f59f00", dashed: true },
      { key: "lag", label: "후행", kind: "line", color: "#9c36b5" },
    ],
    compute: (bars, p) => {
      const mid = (len: number) => zip(highest(highs(bars), len), lowest(lows(bars), len), (h, l) => (h + l) / 2);
      const conv = mid(p.conv);
      const base = mid(p.base);
      const shiftBy = p.base - 1;
      return {
        conv,
        base,
        a: shift(
          zip(conv, base, (c, b) => (c + b) / 2),
          shiftBy,
        ),
        b: shift(mid(p.span), shiftBy),
        lag: shift(closes(bars), -shiftBy),
      };
    },
  },
  {
    id: "psar",
    name: "파라볼릭 SAR",
    short: "SAR",
    category: "추세",
    description: "추세 전환 지점을 점으로 표시",
    placement: "overlay",
    params: [
      { key: "step", label: "가속", default: 0.02, min: 0.001, max: 0.2, step: 0.001 },
      { key: "max", label: "최대", default: 0.2, min: 0.01, max: 1, step: 0.01 },
    ],
    outputs: [{ key: "v", label: "SAR", kind: "dots", color: "#495057" }],
    compute: (bars, p) => {
      const out: Series = bars.map(() => null);
      if (bars.length < 2) return { v: out };
      let up = bars[1].close >= bars[0].close;
      let af = p.step;
      let ep = up ? bars[0].high : bars[0].low;
      let sar = up ? bars[0].low : bars[0].high;
      for (let i = 1; i < bars.length; i++) {
        sar = sar + af * (ep - sar);
        const b = bars[i];
        if (up) {
          sar = Math.min(sar, bars[i - 1].low, bars[Math.max(0, i - 2)].low);
          if (b.low < sar) {
            up = false;
            sar = ep;
            ep = b.low;
            af = p.step;
          } else if (b.high > ep) {
            ep = b.high;
            af = Math.min(af + p.step, p.max);
          }
        } else {
          sar = Math.max(sar, bars[i - 1].high, bars[Math.max(0, i - 2)].high);
          if (b.high > sar) {
            up = true;
            sar = ep;
            ep = b.high;
            af = p.step;
          } else if (b.low < ep) {
            ep = b.low;
            af = Math.min(af + p.step, p.max);
          }
        }
        out[i] = sar;
      }
      return { v: out };
    },
  },
  {
    id: "vwap",
    name: "VWAP",
    short: "VWAP",
    category: "추세",
    description: "거래량 가중 평균가. 날마다 새로 계산 (분봉용)",
    placement: "overlay",
    params: [],
    outputs: [{ key: "v", label: "VWAP", kind: "line", color: "#c2255c" }],
    compute: (bars) => {
      let day = "";
      let pv = 0;
      let vol = 0;
      return {
        v: bars.map((b) => {
          const d = new Date((b.time + 9 * 3600) * 1000).toISOString().slice(0, 10);
          if (d !== day) {
            day = d;
            pv = 0;
            vol = 0;
          }
          pv += ((b.high + b.low + b.close) / 3) * b.volume;
          vol += b.volume;
          return vol ? pv / vol : null;
        }),
      };
    },
  },

  // ───────── 모멘텀 (보조 창)
  {
    id: "rsi",
    name: "RSI",
    short: "RSI",
    category: "모멘텀",
    description: "상승·하락 폭의 상대 강도 (70 과매수, 30 과매도)",
    placement: "separate",
    params: [n("period", "기간", 14)],
    outputs: [{ key: "v", label: "RSI", kind: "line", color: "#7048e8" }],
    levels: [70, 30],
    compute: (bars, p) => ({ v: rsiOf(closes(bars), p.period) }),
  },
  {
    id: "macd",
    name: "MACD",
    short: "MACD",
    category: "모멘텀",
    description: "단기·장기 지수이동평균의 차이와 시그널",
    placement: "separate",
    params: [n("fast", "단기", 12), n("slow", "장기", 26), n("signal", "시그널", 9)],
    outputs: [
      { key: "hist", label: "오실레이터", kind: "histogram", color: "#adb5bd", colorBy: "sign" },
      { key: "macd", label: "MACD", kind: "line", color: "#1666f0" },
      { key: "signal", label: "시그널", kind: "line", color: "#f59f00" },
    ],
    levels: [0],
    compute: (bars, p) => {
      const line = zip(ema(closes(bars), p.fast), ema(closes(bars), p.slow), (a, b) => a - b);
      const signal = ema(line, p.signal);
      return { macd: line, signal, hist: zip(line, signal, (a, b) => a - b) };
    },
  },
  {
    id: "stoch-slow",
    name: "스토캐스틱 슬로우",
    short: "Stoch",
    category: "모멘텀",
    description: "기간 고저 범위 안에서 종가의 위치 (%K, %D)",
    placement: "separate",
    params: [n("k", "기간", 14), n("smooth", "%K 평활", 3), n("d", "%D", 3)],
    outputs: [
      { key: "k", label: "%K", kind: "line", color: "#1666f0" },
      { key: "d", label: "%D", kind: "line", color: "#f59f00" },
    ],
    levels: [80, 20],
    compute: (bars, p) => {
      const raw = stochOf(closes(bars), highest(highs(bars), p.k), lowest(lows(bars), p.k));
      const k = sma(raw, p.smooth);
      return { k, d: sma(k, p.d) };
    },
  },
  {
    id: "stoch-fast",
    name: "스토캐스틱 패스트",
    short: "StochF",
    category: "모멘텀",
    description: "평활 없는 %K 와 %D",
    placement: "separate",
    params: [n("k", "기간", 14), n("d", "%D", 3)],
    outputs: [
      { key: "k", label: "%K", kind: "line", color: "#1666f0" },
      { key: "d", label: "%D", kind: "line", color: "#f59f00" },
    ],
    levels: [80, 20],
    compute: (bars, p) => {
      const k = stochOf(closes(bars), highest(highs(bars), p.k), lowest(lows(bars), p.k));
      return { k, d: sma(k, p.d) };
    },
  },
  {
    id: "stoch-rsi",
    name: "스토캐스틱 RSI",
    short: "StochRSI",
    category: "모멘텀",
    description: "RSI 에 스토캐스틱을 적용",
    placement: "separate",
    params: [n("rsi", "RSI 기간", 14), n("stoch", "스토캐스틱 기간", 14), n("k", "%K", 3), n("d", "%D", 3)],
    outputs: [
      { key: "k", label: "%K", kind: "line", color: "#1666f0" },
      { key: "d", label: "%D", kind: "line", color: "#f59f00" },
    ],
    levels: [80, 20],
    compute: (bars, p) => {
      const r = rsiOf(closes(bars), p.rsi);
      const k = sma(stochOf(r, highest(r, p.stoch), lowest(r, p.stoch)), p.k);
      return { k, d: sma(k, p.d) };
    },
  },
  {
    id: "cci",
    name: "CCI",
    short: "CCI",
    category: "모멘텀",
    description: "평균가격이 이동평균에서 벗어난 정도 (±100)",
    placement: "separate",
    params: [n()],
    outputs: [{ key: "v", label: "CCI", kind: "line", color: "#e8590c" }],
    levels: [100, -100],
    compute: (bars, p) => {
      const tp = typical(bars);
      const ma = sma(tp, p.period);
      return {
        v: tp.map((t, i) => {
          const m = ma[i];
          if (t === null || m === null) return null;
          let dev = 0;
          for (let j = i - p.period + 1; j <= i; j++) dev += Math.abs((tp[j] as number) - m);
          dev /= p.period;
          return dev === 0 ? 0 : (t - m) / (0.015 * dev);
        }),
      };
    },
  },
  {
    id: "williams",
    name: "윌리엄스 %R",
    short: "%R",
    category: "모멘텀",
    description: "기간 최고가 대비 종가 위치 (-20 과매수, -80 과매도)",
    placement: "separate",
    params: [n("period", "기간", 14)],
    outputs: [{ key: "v", label: "%R", kind: "line", color: "#5f3dc4" }],
    levels: [-20, -80],
    compute: (bars, p) => ({ v: map(stochOf(closes(bars), highest(highs(bars), p.period), lowest(lows(bars), p.period)), (s) => s - 100) }),
  },
  {
    id: "roc",
    name: "ROC (변화율)",
    short: "ROC",
    category: "모멘텀",
    description: "n봉 전 대비 종가 변화율(%)",
    placement: "separate",
    params: [n("period", "기간", 12)],
    outputs: [{ key: "v", label: "ROC", kind: "line", color: "#0b7285" }],
    levels: [0],
    compute: (bars, p) => ({ v: zip(closes(bars), shift(closes(bars), p.period), (c, o) => (o ? ((c - o) / o) * 100 : 0)) }),
  },
  {
    id: "momentum",
    name: "모멘텀",
    short: "MOM",
    category: "모멘텀",
    description: "n봉 전 대비 종가 차이",
    placement: "separate",
    params: [n("period", "기간", 10)],
    outputs: [{ key: "v", label: "MOM", kind: "line", color: "#2b8a3e" }],
    levels: [0],
    compute: (bars, p) => ({ v: zip(closes(bars), shift(closes(bars), p.period), (c, o) => c - o) }),
  },
  {
    id: "trix",
    name: "TRIX",
    short: "TRIX",
    category: "모멘텀",
    description: "삼중 지수이동평균의 변화율과 시그널",
    placement: "separate",
    params: [n("period", "기간", 15), n("signal", "시그널", 9)],
    outputs: [
      { key: "v", label: "TRIX", kind: "line", color: "#1666f0" },
      { key: "signal", label: "시그널", kind: "line", color: "#f59f00" },
    ],
    levels: [0],
    compute: (bars, p) => {
      const e3 = ema(ema(ema(closes(bars), p.period), p.period), p.period);
      const v = zip(e3, shift(e3, 1), (a, b) => (b ? ((a - b) / b) * 100 : 0));
      return { v, signal: sma(v, p.signal) };
    },
  },
  {
    id: "dmi",
    name: "DMI / ADX",
    short: "DMI",
    category: "모멘텀",
    description: "+DI·-DI 로 방향, ADX 로 추세 강도",
    placement: "separate",
    params: [n("period", "기간", 14)],
    outputs: [
      { key: "plus", label: "+DI", kind: "line", color: "#f0294f" },
      { key: "minus", label: "-DI", kind: "line", color: "#1666f0" },
      { key: "adx", label: "ADX", kind: "line", color: "#212529" },
    ],
    levels: [20],
    compute: (bars, p) => {
      const plusDm: Series = bars.map((b, i) => {
        if (i === 0) return null;
        const up = b.high - bars[i - 1].high;
        const down = bars[i - 1].low - b.low;
        return up > down && up > 0 ? up : 0;
      });
      const minusDm: Series = bars.map((b, i) => {
        if (i === 0) return null;
        const up = b.high - bars[i - 1].high;
        const down = bars[i - 1].low - b.low;
        return down > up && down > 0 ? down : 0;
      });
      const tr = rma(trueRange(bars).map((v, i) => (i === 0 ? null : v)), p.period);
      const plus = zip(rma(plusDm, p.period), tr, (d, t) => (t ? (100 * d) / t : 0));
      const minus = zip(rma(minusDm, p.period), tr, (d, t) => (t ? (100 * d) / t : 0));
      const dx = zip(plus, minus, (a, b) => (a + b ? (100 * Math.abs(a - b)) / (a + b) : 0));
      return { plus, minus, adx: rma(dx, p.period) };
    },
  },
  {
    id: "disparity",
    name: "이격도",
    short: "이격도",
    category: "모멘텀",
    description: "종가 ÷ 이동평균 × 100 (100 이 평균과 같음)",
    placement: "separate",
    params: [n()],
    outputs: [{ key: "v", label: "이격도", kind: "line", color: "#ae3ec9" }],
    levels: [100],
    compute: (bars, p) => ({ v: zip(closes(bars), sma(closes(bars), p.period), (c, m) => (c / m) * 100) }),
  },
  {
    id: "psy",
    name: "투자심리선",
    short: "PSY",
    category: "모멘텀",
    description: "최근 n봉 중 오른 봉의 비율(%)",
    placement: "separate",
    params: [n("period", "기간", 10)],
    outputs: [{ key: "v", label: "PSY", kind: "line", color: "#d9480f" }],
    levels: [75, 25],
    compute: (bars, p) => {
      const upDay: Series = bars.map((b, i) => (i === 0 ? null : b.close > bars[i - 1].close ? 1 : 0));
      return { v: map(sma(upDay, p.period), (v) => v * 100) };
    },
  },

  // ───────── 변동성 (보조 창)
  {
    id: "atr",
    name: "ATR",
    short: "ATR",
    category: "변동성",
    description: "평균 실제 변동폭 (손절 폭 잡을 때)",
    placement: "separate",
    params: [n("period", "기간", 14)],
    outputs: [{ key: "v", label: "ATR", kind: "line", color: "#c92a2a" }],
    compute: (bars, p) => ({ v: rma(trueRange(bars), p.period) }),
  },
  {
    id: "stdev",
    name: "표준편차",
    short: "SD",
    category: "변동성",
    description: "종가의 표준편차",
    placement: "separate",
    params: [n()],
    outputs: [{ key: "v", label: "SD", kind: "line", color: "#5c940d" }],
    compute: (bars, p) => ({ v: stdev(closes(bars), p.period) }),
  },
  {
    id: "bb-percent",
    name: "볼린저 %B",
    short: "%B",
    category: "변동성",
    description: "밴드 안에서 종가의 위치 (1 상단, 0 하단)",
    placement: "separate",
    params: [n(), { key: "mult", label: "배수", default: 2, min: 0.5, max: 5, step: 0.1 }],
    outputs: [{ key: "v", label: "%B", kind: "line", color: "#495057" }],
    levels: [1, 0],
    compute: (bars, p) => {
      const mid = sma(closes(bars), p.period);
      const sd = stdev(closes(bars), p.period);
      return { v: closes(bars).map((c, i) => (mid[i] === null || sd[i] === null || sd[i] === 0 ? null : ((c as number) - ((mid[i] as number) - p.mult * (sd[i] as number))) / (2 * p.mult * (sd[i] as number)))) };
    },
  },
  {
    id: "bb-width",
    name: "볼린저 밴드폭",
    short: "BBW",
    category: "변동성",
    description: "(상단 - 하단) ÷ 중심 (좁아지면 변동성 수축)",
    placement: "separate",
    params: [n(), { key: "mult", label: "배수", default: 2, min: 0.5, max: 5, step: 0.1 }],
    outputs: [{ key: "v", label: "BBW", kind: "line", color: "#495057" }],
    compute: (bars, p) => ({ v: zip(sma(closes(bars), p.period), stdev(closes(bars), p.period), (m, s) => (m ? (2 * p.mult * s) / m : 0)) }),
  },

  // ───────── 거래량
  {
    id: "volume",
    name: "거래량",
    short: "거래량",
    category: "거래량",
    description: "봉별 거래량과 그 이동평균 (가격 차트 아래쪽)",
    placement: "volume",
    params: [n("ma", "이동평균", 20)],
    outputs: [
      { key: "v", label: "거래량", kind: "histogram", color: "#adb5bd", colorBy: "candle" },
      { key: "ma", label: "평균", kind: "line", color: "#f59f00" },
    ],
    compute: (bars, p) => {
      const v: Series = bars.map((b) => b.volume);
      return { v, ma: sma(v, p.ma) };
    },
  },
  {
    id: "obv",
    name: "OBV",
    short: "OBV",
    category: "거래량",
    description: "오른 날 거래량은 더하고 내린 날은 빼서 누적",
    placement: "separate",
    params: [],
    outputs: [{ key: "v", label: "OBV", kind: "line", color: "#1971c2" }],
    compute: (bars) => {
      let acc = 0;
      return { v: bars.map((b, i) => (i === 0 ? 0 : (acc += b.close > bars[i - 1].close ? b.volume : b.close < bars[i - 1].close ? -b.volume : 0))) };
    },
  },
  {
    id: "mfi",
    name: "MFI",
    short: "MFI",
    category: "거래량",
    description: "거래량을 반영한 RSI (80 과매수, 20 과매도)",
    placement: "separate",
    params: [n("period", "기간", 14)],
    outputs: [{ key: "v", label: "MFI", kind: "line", color: "#087f5b" }],
    levels: [80, 20],
    compute: (bars, p) => {
      const tp = typical(bars) as number[];
      return {
        v: bars.map((_, i) => {
          if (i < p.period) return null;
          let pos = 0;
          let neg = 0;
          for (let j = i - p.period + 1; j <= i; j++) {
            const flow = tp[j] * bars[j].volume;
            if (tp[j] > tp[j - 1]) pos += flow;
            else if (tp[j] < tp[j - 1]) neg += flow;
          }
          return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
        }),
      };
    },
  },
  // ───────── 수급 (키움 일별 데이터, 일봉에서만)
  {
    id: "cvd",
    name: "CVD (누적 거래량 델타)",
    short: "CVD",
    category: "거래량",
    description: "매수 체결량 - 매도 체결량을 쌓은 값. 일봉은 키움 체결강도로 계산(약 2년), 분·시간봉은 캔들 모양으로 추정",
    placement: "separate",
    optionalData: "flows",
    params: [],
    outputs: [{ key: "v", label: "CVD", kind: "line", color: "#0b7285" }],
    levels: [0],
    compute: (bars, _p, ext) => {
      const flows = ext?.flows;
      const real = !!flows && flows.size > 0;
      let acc = 0;
      let started = false;
      return {
        v: bars.map((b) => {
          let delta: number;
          if (real) {
            // 체결강도 s = 매수 ÷ 매도 × 100 → 델타 = 거래량 × (s - 100) / (s + 100)
            const s = flows!.get(b.time)?.strength;
            if (s === null || s === undefined) return started ? acc : null;
            delta = (b.volume * (s - 100)) / (s + 100);
          } else {
            // 추정: 몸통이 고저 범위에서 차지하는 비율만큼 매수(양봉)·매도(음봉) 우세
            const range = b.high - b.low;
            delta = range > 0 ? (b.volume * (b.close - b.open)) / range : 0;
          }
          started = true;
          return (acc += delta);
        }),
      };
    },
  },
  {
    id: "strength",
    name: "체결강도",
    short: "체결강도",
    category: "수급",
    description: "매수 체결량 ÷ 매도 체결량 × 100 (100 위면 매수 우세, 일봉 전용, 키움)",
    placement: "separate",
    data: "flows",
    params: [],
    outputs: [{ key: "v", label: "체결강도", kind: "line", color: "#c2255c" }],
    levels: [100],
    compute: (bars, _p, ext) => ({ v: bars.map((b) => ext?.flows?.get(b.time)?.strength ?? null) }),
  },
  {
    id: "investor-net",
    name: "투자자별 순매수",
    short: "순매수",
    category: "수급",
    description: "개인·외국인·기관 순매수 수량 (일봉 전용, 키움). 합산 일수를 늘리면 N일 합계",
    placement: "separate",
    data: "flows",
    params: [n("sum", "합산 일수", 1, 120)],
    outputs: [
      { key: "foreign", label: "외국인", kind: "line", color: "#e03131" },
      { key: "institution", label: "기관", kind: "line", color: "#1c7ed6" },
      { key: "individual", label: "개인", kind: "line", color: "#2f9e44" },
    ],
    levels: [0],
    compute: (bars, p, ext) => {
      const pick = (k: "foreign" | "institution" | "individual") => {
        const daily: Series = bars.map((b) => ext?.flows?.get(b.time)?.[k] ?? null);
        if (p.sum <= 1) return daily;
        // N일 합계 (빈 날은 0 으로)
        return daily.map((_, i) => (daily[i] === null ? null : daily.slice(Math.max(0, i - p.sum + 1), i + 1).reduce<number>((a, v) => a + (v ?? 0), 0)));
      };
      return { foreign: pick("foreign"), institution: pick("institution"), individual: pick("individual") };
    },
  },
  {
    id: "investor-cum",
    name: "투자자별 누적 순매수",
    short: "누적순매수",
    category: "수급",
    description: "받은 기간 처음부터 쌓은 순매수 (일봉 전용, 키움 약 2년). 누가 꾸준히 사고 파는지",
    placement: "separate",
    data: "flows",
    params: [],
    outputs: [
      { key: "foreign", label: "외국인", kind: "line", color: "#e03131" },
      { key: "institution", label: "기관", kind: "line", color: "#1c7ed6" },
      { key: "individual", label: "개인", kind: "line", color: "#2f9e44" },
    ],
    compute: (bars, _p, ext) => {
      const cum = (k: "foreign" | "institution" | "individual") => {
        let acc = 0;
        let started = false;
        return bars.map((b) => {
          const v = ext?.flows?.get(b.time)?.[k];
          if (v === null || v === undefined) return started ? acc : null;
          started = true;
          return (acc += v);
        });
      };
      return { foreign: cum("foreign"), institution: cum("institution"), individual: cum("individual") };
    },
  },
  {
    id: "foreign-rate",
    name: "외국인 보유율",
    short: "외국인%",
    category: "수급",
    description: "외국인이 가진 주식 비율 % (일봉 전용, 키움)",
    placement: "separate",
    data: "flows",
    params: [],
    outputs: [{ key: "v", label: "보유율", kind: "line", color: "#e03131" }],
    compute: (bars, _p, ext) => ({ v: bars.map((b) => ext?.flows?.get(b.time)?.foreignRate ?? null) }),
  },
  {
    id: "short-ratio",
    name: "공매도 비중",
    short: "공매도%",
    category: "수급",
    description: "그날 거래량 중 공매도 비중 % (일봉 전용, 키움. 2025-03-31 공매도 재개 이후)",
    placement: "separate",
    data: "flows",
    params: [],
    outputs: [{ key: "v", label: "비중", kind: "line", color: "#5f3dc4" }],
    compute: (bars, _p, ext) => ({ v: bars.map((b) => ext?.flows?.get(b.time)?.shortRatio ?? null) }),
  },
  {
    id: "short-qty",
    name: "공매도량",
    short: "공매도량",
    category: "수급",
    description: "일별 공매도 수량 (일봉 전용, 키움)",
    placement: "separate",
    data: "flows",
    params: [],
    outputs: [{ key: "v", label: "공매도량", kind: "histogram", color: "rgba(95,61,196,0.55)" }],
    compute: (bars, _p, ext) => ({ v: bars.map((b) => ext?.flows?.get(b.time)?.shortQty ?? null) }),
  },
  {
    id: "ad",
    name: "누적 분산 (A/D)",
    short: "A/D",
    category: "거래량",
    description: "종가가 고저 범위의 어디서 끝났는지로 거래량을 누적",
    placement: "separate",
    params: [],
    outputs: [{ key: "v", label: "A/D", kind: "line", color: "#6741d9" }],
    compute: (bars) => {
      let acc = 0;
      return { v: bars.map((b) => (acc += b.high === b.low ? 0 : (((b.close - b.low) - (b.high - b.close)) / (b.high - b.low)) * b.volume)) };
    },
  },
];

/**
 * 오실레이터에 시그널선(지표의 이동평균, 기본 9) 붙이기. 시그널 0 이면 시그널선을 그리지 않음
 * (MACD·TRIX·스토캐스틱은 원래 시그널/%D 가 있어 제외)
 */
const SIGNAL_IDS = new Set(["rsi", "cci", "williams", "roc", "momentum", "mfi", "strength"]);

function withSignal(def: IndicatorDef): IndicatorDef {
  const main = def.outputs[0];
  return {
    ...def,
    params: [...def.params, { key: "signal", label: "시그널", default: 9, min: 0, max: 100, step: 1 }],
    outputs: [...def.outputs, { key: "signal", label: "시그널", kind: "line", color: "#f59f00" }],
    compute: (bars, p, ext) => {
      const out = def.compute(bars, p, ext);
      const v = out[main.key] ?? [];
      return { ...out, signal: p.signal > 0 ? sma(v, p.signal) : v.map(() => null) };
    },
  };
}

export const INDICATOR_LIBRARY: IndicatorDef[] = BASE_LIBRARY.map((d) => (SIGNAL_IDS.has(d.id) ? withSignal(d) : d));

export const INDICATOR_CATEGORIES = ["추세", "모멘텀", "변동성", "거래량", "수급"] as const;

const byId = new Map(INDICATOR_LIBRARY.map((d) => [d.id, d]));
export const getIndicator = (id: string) => byId.get(id);

/** 같은 지표를 여러 개 올릴 때 첫 선 색을 돌려 가며 쓴다 */
export const INSTANCE_PALETTE = ["#7048e8", "#f59f00", "#0ca678", "#e8590c", "#1c7ed6", "#d6336c", "#495057"];

/** 색 고르기 기본 견본 (지표·드로잉 공통) */
export const COLOR_SWATCHES = ["#e03131", "#f76707", "#f59f00", "#2f9e44", "#0ca678", "#1c7ed6", "#2962ff", "#7048e8", "#d6336c", "#495057", "#191919", "#adb5bd"];

/** 범례용 이름: MA(20), BB(20, 2) */
export function instanceLabel(def: IndicatorDef, params: Record<string, number>) {
  return def.params.length ? `${def.short}(${def.params.map((p) => params[p.key] ?? p.default).join(", ")})` : def.short;
}
