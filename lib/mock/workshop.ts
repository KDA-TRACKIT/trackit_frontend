// 작업실 더미 데이터. 시세 API(키움+KRX 수정주가)가 붙으면 이 파일 대신 API 응답을 쓴다.

export type Interval = "1s" | "1m" | "5m" | "1h" | "1d";

/** time = 실제 시각(UTC 초). 백엔드는 숫자를 문자열로 주므로 연결할 때 변환한다 */
export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export const STOCK = {
  code: "005930",
  name: "삼성전자",
  fullName: "삼성전자보통주",
  market: "KRX",
  sector: "전자 기술 · 반도체",
};

export const INTERVAL_LABEL: Record<Interval, { button: string; legend: string; footer: string }> = {
  "1s": { button: "1초", legend: "1초", footer: "초봉 (실시간)" },
  "1m": { button: "1분", legend: "1분", footer: "1분봉" },
  "5m": { button: "5분", legend: "5분", footer: "5분봉" },
  "1h": { button: "1시간", legend: "1시간", footer: "1시간봉" },
  "1d": { button: "일봉", legend: "1일", footer: "일봉" },
};

const KST = 9 * 60 * 60;

// 같은 화면이 매번 같게 나오도록 시드 고정 난수
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// KRX 호가 단위 (2023년 개편 기준)
function tick(price: number) {
  if (price >= 500000) return 1000;
  if (price >= 200000) return 500;
  if (price >= 50000) return 100;
  return 50;
}
const roundTick = (price: number) => Math.round(price / tick(price)) * tick(price);

function interpolate(anchors: [number, number][], t: number) {
  for (let i = 1; i < anchors.length; i++) {
    const [t0, v0] = anchors[i - 1];
    const [t1, v1] = anchors[i];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return anchors[anchors.length - 1][1];
}

/** KST 날짜의 자정을 실제 시각(UTC 초)으로 */
const kstMidnight = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000 - KST;

/** 2026-11-11(KST)에서 거꾸로 평일만 count개 */
function tradingDays(count: number) {
  const days: number[] = [];
  const cursor = new Date(Date.UTC(2026, 10, 11));
  while (days.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days.unshift(kstMidnight(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function buildBars(times: number[], anchors: [number, number][], seed: number, swing: number, volume: [number, number]) {
  const rand = seeded(seed);
  const bars: Bar[] = [];
  let prevClose = interpolate(anchors, 0);
  times.forEach((time, i) => {
    const target = interpolate(anchors, i / (times.length - 1));
    const open = roundTick(prevClose * (1 + (rand() - 0.5) * swing * 0.5));
    const close = roundTick(target * (1 + (rand() - 0.5) * swing));
    const high = roundTick(Math.max(open, close) * (1 + rand() * swing * 0.6));
    const low = roundTick(Math.min(open, close) * (1 - rand() * swing * 0.6));
    bars.push({ time, open, high, low, close, volume: Math.round(volume[0] + rand() * (volume[1] - volume[0])) });
    prevClose = close;
  });
  return bars;
}

function dailyBars() {
  const anchors: [number, number][] = [
    [0, 190000], [0.12, 205000], [0.3, 372000], [0.38, 330000], [0.5, 252000],
    [0.62, 292000], [0.75, 270000], [0.86, 238000], [0.95, 200000], [1, 206000],
  ];
  const bars = buildBars(tradingDays(100), anchors, 5930, 0.035, [10_000_000, 26_000_000]);

  // 피그마와 같은 마지막 봉: 시 197,100 고 206,500 저 196,300 종 206,000 (전일 종가 198,900)
  const prev = bars[bars.length - 2];
  prev.close = 198900;
  prev.high = Math.max(prev.high, prev.open, prev.close);
  prev.low = Math.min(prev.low, prev.open, prev.close);
  Object.assign(bars[bars.length - 1], { open: 197100, high: 206500, low: 196300, close: 206000, volume: 15_350_000 });

  // 30일 평균 거래량을 1,847만 주에 맞춘다
  const recent = bars.slice(-30, -1);
  const want = 18_470_000 * 30 - 15_350_000;
  const sum = recent.reduce((acc, bar) => acc + bar.volume, 0);
  recent.forEach((bar) => (bar.volume = Math.round((bar.volume * want) / sum)));
  return bars;
}

function intradayBars(stepMinutes: number, days: number) {
  const times: number[] = [];
  for (const day of tradingDays(days)) {
    // 09:00 ~ 15:30 정규장
    for (let minutes = 9 * 60; minutes < 15 * 60 + 30; minutes += stepMinutes) times.push(day + minutes * 60);
  }
  const anchors: [number, number][] = [[0, 199000], [0.3, 194500], [0.55, 198500], [0.8, 201000], [1, 206000]];
  const bars = buildBars(times, anchors, 5930 + stepMinutes, stepMinutes >= 60 ? 0.008 : 0.003, [80_000, 600_000]);
  bars[bars.length - 1].close = 206000;
  bars[bars.length - 1].high = Math.max(bars[bars.length - 1].high, 206000);
  return bars;
}

export function makeBars(interval: Interval): Bar[] {
  if (interval === "1s") return [];
  if (interval === "1m") return intradayBars(1, 1);
  if (interval === "5m") return intradayBars(5, 3);
  if (interval === "1h") return intradayBars(60, 15);
  return dailyBars();
}

/** 노트 검증 패널 더미 */
export const DRAFT_NOTE = {
  time: "10:18",
  text: "지지선 반등과 거래량 증가를 확인한 뒤",
  suggestion: "체결되면 진입 근거로 연결하고\n손절 기준도 함께 남김.",
};

/** 차트 노트: 차트 위 한 지점(봉 시각·가격)에 붙는 메모. createdAt은 작성 시각(KST HH:MM) */
export type ChartNote = { id: string; time: number; price: number; text: string; createdAt: string };

export type NewsItem = { title: string; summary: string; source: string };

const NEWS_UP = [
  { title: "외국인 순매수 전환, 반도체 업황 회복 기대", summary: "HBM 수요 증가 전망이 이어지며 외국인 매수세가 유입됐어요." },
  { title: "4분기 메모리 가격 반등 전망", summary: "주요 증권사가 D램 고정가 상승을 예상하며 목표가를 올렸어요." },
  { title: "AI 서버 투자 확대 소식에 강세", summary: "빅테크 설비투자 확대 발표로 메모리 업종 전반이 올랐어요." },
];
const NEWS_DOWN = [
  { title: "차익 실현 매물 출회, 단기 조정", summary: "최근 급등에 따른 기관 매도가 이어지며 하락했어요." },
  { title: "환율 상승에 외국인 매도 우위", summary: "달러 강세로 외국인 자금이 빠지며 대형주가 약세를 보였어요." },
  { title: "재고 증가 우려로 투자심리 위축", summary: "스마트폰 수요 둔화로 메모리 재고가 늘 수 있다는 분석이 나왔어요." },
];

/**
 * AI 뉴스 요약 더미. 전일 대비 2.5% 이상 움직인 봉과 마지막 봉에만 붙인다.
 * 뉴스 API가 붙으면 봉 시각 기준으로 조회한 결과로 바꾼다.
 */
export function newsFor(bar: Bar, prev: Bar | undefined, isLast: boolean): NewsItem | null {
  if (!prev) return null;
  const rate = (bar.close - prev.close) / prev.close;
  if (Math.abs(rate) < 0.025 && !isLast) return null;
  const pool = rate >= 0 ? NEWS_UP : NEWS_DOWN;
  const pick = pool[Math.floor(bar.time / 86400) % pool.length];
  return { ...pick, source: "예시 뉴스 · 뉴스 API 연결 전" };
}

export type OrderLevel = { price: number; quantity: number };

/** 호가창 더미: 현재가 기준 위·아래 10호가 */
export function makeOrderBook(price: number, levels = 10) {
  const rand = seeded(price);
  const step = tick(price);
  const base = roundTick(price);
  const asks: OrderLevel[] = [];
  const bids: OrderLevel[] = [];
  for (let i = levels; i >= 1; i--) asks.push({ price: base + step * i, quantity: Math.round(2_000 + rand() * 38_000) });
  for (let i = 0; i < levels; i++) bids.push({ price: base - step * i, quantity: Math.round(2_000 + rand() * 38_000) });
  return { asks, bids, step };
}

/** 모의 주문 가능 금액 */
export const BUYING_POWER = 10_000_000;
