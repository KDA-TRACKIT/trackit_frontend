// 규칙 기반 시나리오 (LLM 없음). 입력: 일봉 + 기준(선·밴드·포지션·피보나치) → 출력: 미래 5영업일 캔들 3묶음
// 같은 입력이면 항상 같은 캔들 (입력으로 만든 고정 시드). 미래 날짜는 주말을 건너뛴다
import { hashSeed, nextBusinessDays, roundTick, seededRandom, type DayBar } from "./bars";

export type ChartPoint = { time: string; price: number };

/** 사용자가 그린 선. 좌표는 화면 픽셀이 아니라 날짜·가격 */
export type UserDrawing = {
  type: "LINE" | "HORIZONTAL_LINE";
  payload: { v: 1; source: "USER"; points: ChartPoint[] };
};

export type ScenarioName = string;
export type Scenario = {
  name: ScenarioName;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  summary: string;
  candles: DayBar[];
};

/**
 * 시나리오 기준. key 는 시드용 (같은 기준이면 같은 문자열)
 * - line: 기준선 하나 (수평선·추세선) → 반등 / 이탈 / 횡보
 * - band: 위·아래 경계 (채널·박스) → 상단 돌파 / 하단 이탈 / 안에서 횡보
 * - position: 진입·목표·손절 → 목표가 도달 / 손절가 도달 / 진입가 부근 횡보
 * - fib: 비율선 가격들 → 윗 비율선까지 반등 / 아랫 비율선까지 하락 / 두 선 사이 횡보
 */
export type ScenarioBase =
  | { kind: "line"; key: string; at: (ymd: string) => number }
  | { kind: "band"; key: string; label: string; upper: (ymd: string) => number; lower: (ymd: string) => number }
  | { kind: "position"; key: string; side: "LONG" | "SHORT"; entry: number; target: number; stop: number }
  | { kind: "fib"; key: string; levels: { ratio: number; price: number }[] };

export const SCENARIO_DAYS = 5;

/** 최근 period 개 봉의 평균 실제 변동폭 (ATR) */
export function atr(bars: DayBar[], period = 14) {
  const recent = bars.slice(-period - 1);
  const ranges = recent.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - recent[i].close), Math.abs(b.low - recent[i].close)));
  return ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
}

/** 두 날짜 사이 영업일 수 (주말 제외, b 가 뒤면 양수) */
export function businessDaysBetween(a: string, b: string) {
  if (a === b) return 0;
  const [from, to, sign] = a < b ? [a, b, 1] : [b, a, -1];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let n = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n * sign;
}

/** 기준선의 그 날 가격 (수평선은 그대로, 추세선은 두 점을 이은 직선을 영업일 기준으로 연장) */
export function lineValueAt(line: UserDrawing, time: string) {
  const [a, b] = line.payload.points;
  if (line.type === "HORIZONTAL_LINE" || !b) return a.price;
  const span = businessDaysBetween(a.time, b.time);
  if (span === 0) return b.price;
  return a.price + ((b.price - a.price) * businessDaysBetween(a.time, time)) / span;
}

const won = (v: number) => Math.round(v).toLocaleString("ko-KR");

/** 기준별 시나리오 3묶음. 꼬리(고가·저가)는 최근 14일 ATR 기준 */
export function buildScenariosFor(bars: DayBar[], base: ScenarioBase): Scenario[] {
  if (bars.length < 21) return [];
  const last = bars[bars.length - 1];
  const c0 = last.close;
  const range = atr(bars, 14) || c0 * 0.02;
  const recent20 = bars.slice(-20);
  const high20 = Math.max(...recent20.map((b) => b.high));
  const low20 = Math.min(...recent20.map((b) => b.low));
  const days = nextBusinessDays(last.time, SCENARIO_DAYS);
  const end = SCENARIO_DAYS - 1;
  const seedBase = `${last.time}|${c0}|${base.kind}|${base.key}`;

  /**
   * closeAt(k) 로 종가 경로를 정하면 시가 = 전날 종가, 꼬리는 ATR 의 10~35%
   *   하루 움직임은 전날 종가 ± ATR 1.2개까지 (기준선이 멀어도 첫 봉이 한 번에 뛰지 않게, 2026-11-20)
   */
  const DAY_MOVE = range * 1.2;
  const make = (name: string, closeAt: (k: number, rand: () => number) => number): DayBar[] => {
    const rand = seededRandom(hashSeed(`${seedBase}|${name}`));
    let prevClose = c0;
    return days.map((time, k) => {
      const open = prevClose;
      const want = closeAt(k, rand);
      const close = roundTick(Math.max(1, Math.min(prevClose + DAY_MOVE, Math.max(prevClose - DAY_MOVE, want))));
      const high = roundTick(Math.max(open, close) + range * (0.1 + rand() * 0.25));
      const low = roundTick(Math.max(1, Math.min(open, close) - range * (0.1 + rand() * 0.25)));
      prevClose = close;
      return { time, open, high, low, close };
    });
  };
  /** 지금 종가에서 to 까지 k 번째 날 위치 (마지막 날 도착) */
  const toward = (to: number, k: number) => c0 + ((to - c0) * (k + 1)) / SCENARIO_DAYS;
  const jitter = (rand: () => number, size: number) => (rand() - 0.5) * 2 * size;

  if (base.kind === "line") {
    const levels = days.map(base.at);
    // 기준선이 지금 가격에서 멀면(ATR 1.5개 넘게) '기준선에서 반등 · 이탈' 이 아니라 지금 가격 기준으로
    if (Math.abs(c0 - levels[0]) > range * 1.5) {
      const lineAbove = levels[0] > c0;
      const flat: Scenario = {
        name: "횡보",
        direction: "NEUTRAL",
        summary: `기준선(${won(levels[end])}) ${lineAbove ? "아래" : "위"}, 지금 가격 부근에서 횡보`,
        candles: make("횡보", (_k, r) => c0 + jitter(r, range * 0.5)),
      };
      if (lineAbove) {
        const upTarget = levels[end] + range;
        const downTarget = Math.min(low20, c0 - range * 2);
        return [
          {
            name: "상승",
            direction: "LONG",
            summary: `위쪽 기준선(${won(levels[end])}) 쪽으로 상승`,
            candles: make("상승", (k, r) => toward(upTarget, k) + jitter(r, range * 0.3)),
          },
          {
            name: "하락",
            direction: "SHORT",
            summary: `기준선 아래에서 밀려 최근 20일 저점(${won(downTarget)}) 쪽으로`,
            candles: make("하락", (k, r) => toward(downTarget, k) + jitter(r, range * 0.3)),
          },
          flat,
        ];
      }
      const upTarget = Math.max(high20, c0 + range * 2);
      const downTarget = levels[end] - range;
      return [
        {
          name: "상승",
          direction: "LONG",
          summary: `기준선 위에서 최근 20일 고점(${won(upTarget)}) 쪽으로`,
          candles: make("상승", (k, r) => toward(upTarget, k) + jitter(r, range * 0.3)),
        },
        {
          name: "하락",
          direction: "SHORT",
          summary: `아래쪽 기준선(${won(levels[end])}) 쪽으로 하락`,
          candles: make("하락", (k, r) => toward(downTarget, k) + jitter(r, range * 0.3)),
        },
        flat,
      ];
    }
    const upTarget = Math.max(high20, levels[end] + range);
    const downTarget = Math.min(low20, levels[end] - range);
    return [
      {
        name: "반등",
        direction: "LONG",
        summary: "기준선 지지 후 최근 20일 고점 쪽으로 반등",
        candles: make("반등", (k, r) => Math.max(levels[k] + range * 0.2, toward(upTarget, k) + jitter(r, range * 0.3))),
      },
      {
        name: "이탈",
        direction: "SHORT",
        summary: "기준선 이탈 후 최근 20일 저점 쪽으로 하락",
        candles: make("이탈", (k, r) => Math.min(levels[k] - range * 0.2, toward(downTarget, k) + jitter(r, range * 0.3))),
      },
      {
        name: "횡보",
        direction: "NEUTRAL",
        summary: "기준선 부근에서 ATR 절반 안쪽 횡보",
        candles: make("횡보", (k, r) => levels[k] + jitter(r, range * 0.5)),
      },
    ];
  }

  if (base.kind === "band") {
    const up = days.map(base.upper);
    const down = days.map(base.lower);
    const width = Math.max(range * 0.5, up[end] - down[end]);
    // 돌파·이탈 목표: 경계 밖으로 밴드 폭의 절반(최소 ATR 1개)
    const upTarget = up[end] + Math.max(range, width * 0.5);
    const downTarget = down[end] - Math.max(range, width * 0.5);
    return [
      {
        name: "상단 돌파",
        direction: "LONG",
        summary: `${base.label} 상단(${won(up[end])}) 돌파 후 위로`,
        // 마지막 이틀은 상단 위에서 마감
        candles: make("상단 돌파", (k, r) => {
          const c = toward(upTarget, k) + jitter(r, range * 0.3);
          return k >= end - 1 ? Math.max(up[k] + range * 0.2, c) : c;
        }),
      },
      {
        name: "하단 이탈",
        direction: "SHORT",
        summary: `${base.label} 하단(${won(down[end])}) 이탈 후 아래로`,
        candles: make("하단 이탈", (k, r) => {
          const c = toward(downTarget, k) + jitter(r, range * 0.3);
          return k >= end - 1 ? Math.min(down[k] - range * 0.2, c) : c;
        }),
      },
      {
        name: `${base.label} 횡보`,
        direction: "NEUTRAL",
        summary: `${base.label} 안(${won(down[end])}~${won(up[end])})에서 오르내림`,
        // 경계 사이를 오가되 경계 안쪽으로 붙잡는다
        candles: make(`${base.label} 횡보`, (k, r) => {
          const mid = (up[k] + down[k]) / 2;
          const half = Math.max(range * 0.3, (up[k] - down[k]) / 2);
          const c = mid + half * 0.6 * Math.sin((k + 1) * 1.7 + r() * 0.5) + jitter(r, range * 0.15);
          return Math.min(up[k] - range * 0.1, Math.max(down[k] + range * 0.1, c));
        }),
      },
    ];
  }

  if (base.kind === "position") {
    const { side, entry, target, stop } = base;
    const opposite = side === "LONG" ? "SHORT" : "LONG";
    // 마지막 날 종가가 목표·손절가에 닿게 (중간은 흔들림)
    const reach = (to: number) => (k: number, r: () => number) => (k === end ? to : toward(to, k) + jitter(r, range * 0.3));
    return [
      { name: "목표가 도달", direction: side, summary: `${side === "LONG" ? "롱" : "숏"} 목표가 ${won(target)} 도달`, candles: make("목표가 도달", reach(target)) },
      { name: "손절가 도달", direction: opposite, summary: `손절가 ${won(stop)} 도달`, candles: make("손절가 도달", reach(stop)) },
      {
        name: "진입가 횡보",
        direction: "NEUTRAL",
        summary: `진입가 ${won(entry)} 부근 횡보`,
        candles: make("진입가 횡보", (_k, r) => entry + jitter(r, range * 0.5)),
      },
    ];
  }

  // fib: 지금 종가에서 ATR 절반 이상 떨어진 바로 위·아래 비율선 (없으면 ATR 2개 거리)
  const sorted = [...base.levels].sort((a, b) => a.price - b.price);
  const above = sorted.find((l) => l.price > c0 + range * 0.5);
  const below = [...sorted].reverse().find((l) => l.price < c0 - range * 0.5);
  const upPrice = above?.price ?? c0 + range * 2;
  const downPrice = below?.price ?? c0 - range * 2;
  const tag = (l: { ratio: number } | undefined) => (l ? `${+(l.ratio * 100).toFixed(1)}% 선` : "비율선 밖");
  return [
    {
      name: "반등",
      direction: "LONG",
      summary: `${tag(above)}(${won(upPrice)})까지 반등`,
      candles: make("반등", (k, r) => (k === end ? upPrice : toward(upPrice, k) + jitter(r, range * 0.3))),
    },
    {
      name: "하락",
      direction: "SHORT",
      summary: `${tag(below)}(${won(downPrice)})까지 하락`,
      candles: make("하락", (k, r) => (k === end ? downPrice : toward(downPrice, k) + jitter(r, range * 0.3))),
    },
    {
      name: "구간 횡보",
      direction: "NEUTRAL",
      summary: `${tag(below)}~${tag(above)} 사이(${won(downPrice)}~${won(upPrice)}) 횡보`,
      candles: make("구간 횡보", (k, r) => {
        const mid = (upPrice + downPrice) / 2;
        const half = (upPrice - downPrice) / 2;
        return Math.min(upPrice - range * 0.1, Math.max(downPrice + range * 0.1, mid + half * 0.5 * Math.sin((k + 1) * 1.7) + jitter(r, range * 0.2)));
      }),
    },
  ];
}

/** 선 하나를 기준선으로 (예전 호출 방식) */
export function buildScenarios(bars: DayBar[], line: UserDrawing): Scenario[] {
  const key = `${line.type}:${line.payload.points.map((p) => `${p.time}:${p.price}`).join(",")}`;
  return buildScenariosFor(bars, { kind: "line", key, at: (t) => lineValueAt(line, t) });
}
