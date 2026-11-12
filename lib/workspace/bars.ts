// 작업실(/workspace) 일봉 · 날짜 · 고정 시드 난수
// 시세 API가 생기면 makeSampleBars 대신 API 응답을 DayBar[] 로 바꿔 넣으면 된다.

/** 일봉. time = "YYYY-MM-DD" (영업일) */
export type DayBar = { time: string; open: number; high: number; low: number; close: number };

/** 같은 seed 면 같은 수열 (mulberry32) */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 → 32비트 seed */
export function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const fromYmd = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/** ymd 다음부터 주말을 건너뛴 영업일 count 개 */
export function nextBusinessDays(ymd: string, count: number): string[] {
  const out: string[] = [];
  const d = fromYmd(ymd);
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(toYmd(d));
  }
  return out;
}

/** KRX 호가 단위로 반올림 (샘플·시나리오 가격용) */
export function roundTick(price: number) {
  const tick = price < 2000 ? 1 : price < 5000 ? 5 : price < 20000 ? 10 : price < 50000 ? 50 : price < 200000 ? 100 : price < 500000 ? 500 : 1000;
  return Math.max(tick, Math.round(price / tick) * tick);
}

/** 샘플 일봉 count 개 (주말 제외, 고정 시드라 새로고침해도 같은 모양) */
export function makeSampleBars(count = 120, seed = 20261112, start = "2026-05-01", firstPrice = 70000): DayBar[] {
  const rand = seededRandom(seed);
  const days = nextBusinessDays(start, count);
  const bars: DayBar[] = [];
  let prev = firstPrice;
  for (const time of days) {
    // 약한 추세 + 일간 변동 ±2% 안팎
    const drift = Math.sin(bars.length / 18) * 0.004;
    const open = roundTick(prev * (1 + (rand() - 0.5) * 0.012));
    const close = roundTick(open * (1 + drift + (rand() - 0.5) * 0.035));
    const high = roundTick(Math.max(open, close) * (1 + rand() * 0.012));
    const low = roundTick(Math.min(open, close) * (1 - rand() * 0.012));
    bars.push({ time, open, high, low, close });
    prev = close;
  }
  return bars;
}
