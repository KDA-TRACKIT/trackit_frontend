// 봉 간격: "숫자+단위" (예: 1m, 3m, 2h, 5d, 2w). 기본 버튼은 1초·1분·1시간·1일·1주, 나머지는 직접 설정
//   초: 실시간 체결로만 만든다 (과거 없음)
//   분·시간: 1분봉·1시간봉을 받아 묶는다. 장 시작(09:00) 기준으로 자른다
//   일: 일봉을 받아 N일씩 묶는다 · 주: 월요일 시작 주를 N주씩 묶는다
export type IntervalUnit = "s" | "m" | "h" | "d" | "w";
export type Interval = `${number}${IntervalUnit}`;

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export const PRESET_INTERVALS: Interval[] = ["1s", "1m", "1h", "1d", "1w"];

export const UNIT_LABEL: Record<IntervalUnit, string> = { s: "초", m: "분", h: "시간", d: "일", w: "주" };
const UNIT_SEC: Record<IntervalUnit, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 7 * 86400 };
/** 직접 설정할 때 단위별 최대 개수 */
export const UNIT_MAX: Record<IntervalUnit, number> = { s: 60, m: 120, h: 6, d: 30, w: 52 };

const KST = 9 * 3600;
const OPEN = 9 * 3600; // 장 시작 09:00 KST
const MON = 4 * 86400; // 1970-01-05 (월) 까지

export function parseInterval(i: Interval): { n: number; unit: IntervalUnit } {
  const m = /^(\d+)([smhdw])$/.exec(i);
  return m ? { n: Math.max(1, Number(m[1])), unit: m[2] as IntervalUnit } : { n: 1, unit: "d" };
}

export const makeInterval = (n: number, unit: IntervalUnit): Interval => `${Math.max(1, Math.min(UNIT_MAX[unit], Math.round(n)))}${unit}`;

/** 일봉 이상 (축에 날짜만, 연·월 표시) */
export const isDailyLike = (i: Interval) => ["d", "w"].includes(parseInterval(i).unit);
export const isSeconds = (i: Interval) => parseInterval(i).unit === "s";

export function intervalLabel(i: Interval) {
  const { n, unit } = parseInterval(i);
  const text = `${n}${UNIT_LABEL[unit]}`;
  const footer = unit === "s" ? `${text}봉 (실시간)` : i === "1d" ? "일봉" : i === "1w" ? "주봉" : `${text}봉`;
  return { button: text, legend: text, footer };
}

/** 서버에서 받을 원본 봉 (초봉은 없음) */
export function sourceOf(i: Interval): "1m" | "60m" | "1d" | null {
  const { unit } = parseInterval(i);
  return unit === "s" ? null : unit === "m" ? "1m" : unit === "h" ? "60m" : "1d";
}

/** 그 시각이 들어갈 봉의 시작 시각 (UTC 초) */
export function bucketStart(time: number, i: Interval) {
  const { n, unit } = parseInterval(i);
  const size = n * UNIT_SEC[unit];
  if (unit === "w") return Math.floor((time + KST - MON) / size) * size + MON - KST;
  if (unit === "d") {
    if (n === 1) return Math.floor((time + KST) / size) * size - KST;
    // N일봉은 거래일(평일) N개씩: 1970-01-05(월)부터 센 평일 번호로 묶는다 (공휴일은 모름)
    const day = Math.floor((time + KST - MON) / 86400);
    const weekday = Math.floor(day / 7) * 5 + Math.min(day % 7, 4);
    const first = Math.floor(weekday / n) * n;
    const startDay = Math.floor(first / 5) * 7 + (first % 5);
    return startDay * 86400 + MON - KST;
  }
  return Math.floor((time + KST - OPEN) / size) * size + OPEN - KST;
}

/** 작은 봉을 이 간격의 봉으로 묶음 */
export function groupBars(bars: Bar[], i: Interval): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const start = bucketStart(b.time, i);
    const last = out[out.length - 1];
    if (last && last.time === start) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else out.push({ ...b, time: start });
  }
  return out;
}

/** 원본 그대로 써도 되는 간격 (1분·1시간·1일) */
export const needsGrouping = (i: Interval) => !["1m", "1h", "1d"].includes(i) && !isSeconds(i);
