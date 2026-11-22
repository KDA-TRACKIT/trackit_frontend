// 작업실 차트 시세 — 백엔드 /api/v1/charts 연결
//   일봉: data/daily CSV(+오늘 봉은 키움으로 보충)  /  1분·60분봉: 종목을 열 때 키움 ka10080
//   실시간: /stream (SSE) 체결로 마지막 봉 갱신, 초봉은 체결을 1초 단위로 묶어서 화면에서 만든다
// 미국 종목(exchange 가 있는 종목): /charts/us/{티커}
//   일봉: 밤 배치가 저장한 10년치 (+오늘 봉 키움 현재가)  /  1분·60분봉: 키움 usa06011 (프리마켓·애프터·주간거래 포함)
//   실시간: 키움 FE (미국 실시간 체결가). 차트 시각은 국내와 같이 한국 시각으로 그린다
//   화면의 code 는 BRK.B 처럼 점 표기, 키움에 보낼 땐 BRKb
import { bucketStart, groupBars, needsGrouping, sourceOf, type Interval } from "./interval";
import type { Bar } from "./mock/workshop";
import { apiBase } from "./api-url";
import { okxCloseAt, openOkxStream } from "./okx";
import { isFuturesCode, isIndexCode, searchSpecial, specialOf } from "./special-symbols";

export { bucketStart, groupBars };

/** exchange: 미국 종목만 (ND 나스닥 · NY 뉴욕 · NA 아멕스) */
export type SymbolInfo = { code: string; name: string; market: string; exchange?: UsExchange };
/** regular: 미국 체결만 — 정규장(09:30~16:00 뉴욕) 체결인지. 일봉에는 정규장 체결만 넣는다 */
export type Tick = { code: string; time: number; price: number; volume: number; regular?: boolean };
export type UsExchange = "ND" | "NY" | "NA";

export const isUsSymbol = (s: { exchange?: string }) => !!s.exchange;
/** BRK.B → BRKb (키움 표기) */
const kiwoomTicker = (code: string) => code.replace(/\.([A-Z])$/, (_, c: string) => c.toLowerCase());
/** BRKb → BRK.B (화면 표기) */
export const displayTicker = (code: string) => code.replace(/([a-z])$/, (c) => `.${c.toUpperCase()}`);
/** 미국 일봉 time(그날 UTC 자정) → 국내 일봉과 같은 그날 KST 자정 */
const usDay = (t: number) => t - 9 * 3600;

const API = apiBase();
const KST = 9 * 3600;

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}/api/v1${path}`, { signal, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !("data" in body)) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body.data as T;
}

export function searchSymbols(q: string, signal?: AbortSignal) {
  return get<SymbolInfo[]>(`/charts/symbols?q=${encodeURIComponent(q)}`, signal);
}

type Hit = { code: string; name: string; market: string; exchange?: UsExchange; etf: boolean; country: "KR" | "US" };

/**
 * 작업실 종목 검색: 국내 + 미국 (한글·영문 이름, 코드·티커). 빈 검색어는 국내 목록
 * 전 종목 검색을 못 쓰면 국내 목록 검색으로
 */
export async function searchAllSymbols(q: string, signal?: AbortSignal): Promise<SymbolInfo[]> {
  if (!q.trim()) return searchSymbols(q, signal);
  // 지수 · 선물 · 환율이 맞으면 맨 앞에 (2026-11-22)
  const special: SymbolInfo[] = searchSpecial(q).map((s) => ({ code: s.code, name: s.name, market: s.market }));
  try {
    const { items } = await get<{ items: Hit[] }>(`/insights/symbols?q=${encodeURIComponent(q)}&limit=20`, signal);
    return [...special, ...items.map((h) => (h.country === "US" && h.exchange ? { code: displayTicker(h.code), name: h.name, market: h.etf ? `${h.market} ETF` : h.market, exchange: h.exchange } : { code: h.code, name: h.name, market: h.market }))];
  } catch (error) {
    if (signal?.aborted) throw error;
    return [...special, ...(await searchSymbols(q, signal))];
  }
}

/** 종목 기본정보 (백엔드가 키움 ka10001로 조회). 금액은 억원, 상장주식수는 천주 */
export type CompanyInfo = {
  code: string;
  /** 기준일 YYYYMMDD (백엔드가 하루 한 번 갱신) */
  asOf: string;
  name: string;
  settlementMonth: string | null;
  marketCap: number | null;
  listedShares: number | null;
  floatRate: number | null;
  foreignRate: number | null;
  per: number | null;
  pbr: number | null;
  eps: number | null;
  bps: number | null;
  roe: number | null;
  sales: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  high250: number | null;
  high250Date: string | null;
  low250: number | null;
  low250Date: string | null;
  upperLimit: number | null;
  lowerLimit: number | null;
};

/** 거래비용 요율 (소수 문자열, 0.0035 = 0.35%) */
export type CostInfo = { market: "KOSPI" | "KOSDAQ" | "OTHER"; feeRate: { mock: string; real: string }; sellTaxRate: string; asOf: string };

export function fetchCosts(code: string, signal?: AbortSignal) {
  return get<CostInfo>(`/charts/${code}/costs`, signal);
}

/** 최근 분기 실적 (DART 주요계정, 원 단위). 4분기 = 1년 − 1~3분기 */
export type Quarter = { period: string; year: number; q: 1 | 2 | 3 | 4; revenue: number | null; operatingProfit: number | null; netIncome: number | null; reportedAt: string | null; fs: "CFS" | "OFS" };
export type Earnings = { code: string; corpName: string | null; quarters: Quarter[]; source: "DART"; missing?: string[] };

export function fetchEarnings(code: string, signal?: AbortSignal) {
  return get<Earnings>(`/charts/${code}/earnings`, signal);
}

export function fetchCompany(code: string, signal?: AbortSignal) {
  return get<CompanyInfo>(`/charts/${code}/company`, signal);
}

/** 호가 10단계 (연결 직후 키움 ka10004 조회 값, 그 뒤 키움 실시간 0D) */
export type OrderBook = {
  code: string;
  asks: { price: number; quantity: number }[];
  bids: { price: number; quantity: number }[];
  totalAsk: number;
  totalBid: number;
  time: string | null;
  /** KRX 정규장 · NXT(08:00~08:50, 15:30~20:00) */
  venue?: "KRX" | "NXT";
};

/** 실시간 호가 구독. 반환 함수로 해제 (백엔드가 0D 등록도 같이 뺀다) */
export function openBookStream(code: string, handlers: { onBook: (book: OrderBook) => void; onError?: () => void }) {
  const source = new EventSource(`${API}/api/v1/charts/${code}/orderbook/stream`);
  source.addEventListener("book", (e) => handlers.onBook(JSON.parse((e as MessageEvent).data)));
  source.addEventListener("error", () => handlers.onError?.());
  return () => source.close();
}

/** 일별 수급 (백엔드가 키움 ka10059·ka10014·ka10008 로 조회, 하루 캐시). time = 일봉 time 과 같음 */
export type FlowDay = {
  time: number;
  individual: number | null;
  foreign: number | null;
  institution: number | null;
  shortQty: number | null;
  shortRatio: number | null;
  foreignRate: number | null;
  /** 체결강도 (매수체결량 ÷ 매도체결량 × 100) */
  strength: number | null;
};

export function fetchFlows(code: string, signal?: AbortSignal) {
  return get<{ items: FlowDay[]; asOf: string }>(`/charts/${code}/flows`, signal);
}

/** limit: 최근 N개만 (기본 전체. 일봉은 1980년대부터라 종목 정보처럼 최근만 필요하면 넣는다) */
/**
 * complete=false: 초봉처럼 서버가 아직 오늘 장 시작 쪽을 채우는 중 → 잠시 뒤 다시 받으면 길어진다
 */
export async function fetchBars(code: string, interval: Interval, signal?: AbortSignal, limit?: number, exchange?: UsExchange): Promise<{ symbol: SymbolInfo; bars: Bar[]; complete: boolean }> {
  const api = sourceOf(interval);
  // 지수 · 선물 · 환율 (2026-11-22): 백엔드가 받아 둔 봉 (초봉은 과거가 없어 빈 배열에서 시작)
  if (isIndexCode(code) || isFuturesCode(code)) {
    const sp = specialOf(code)!;
    const info = { code, name: sp.name, market: sp.market };
    if (api === "1s") return { symbol: info, bars: [], complete: true };
    const base = isIndexCode(code) ? `/charts/index/${code}` : `/charts/futures/${encodeURIComponent(code)}`;
    const data = await get<{ bars: Bar[] }>(`${base}/bars?interval=${api}${limit ? `&limit=${limit}` : ""}`, signal);
    return { symbol: info, bars: needsGrouping(interval) ? groupBars(data.bars, interval) : data.bars, complete: true };
  }
  if (exchange) {
    // 미국: 초봉은 과거가 없어 실시간 체결로만 (빈 배열에서 시작)
    if (api === "1s") return { symbol: { code, name: code, market: "", exchange }, bars: [], complete: true };
    const data = await get<{ symbol: SymbolInfo & { code: string }; bars: Bar[]; complete?: boolean }>(
      `/charts/us/${encodeURIComponent(kiwoomTicker(code))}/bars?interval=${api}&exchange=${exchange}&limit=${limit ?? (api === "1d" ? 3000 : 0)}`,
      signal,
    );
    const raw = api === "1d" ? data.bars.map((b) => ({ ...b, time: usDay(b.time) })) : data.bars;
    return { symbol: { code, name: data.symbol.name, market: data.symbol.market, exchange }, bars: needsGrouping(interval) ? groupBars(raw, interval) : raw, complete: data.complete !== false };
  }
  const data = await get<{ symbol: SymbolInfo; bars: Bar[]; complete?: boolean }>(`/charts/${code}/bars?interval=${api}${limit ? `&limit=${limit}` : ""}`, signal);
  return { symbol: data.symbol, bars: needsGrouping(interval) ? groupBars(data.bars, interval) : data.bars, complete: data.complete !== false };
}

/** 체결 하나를 봉 배열에 반영한 새 배열 (React 상태용, 마지막 봉만 새 객체) */
export function applyTick(bars: Bar[], tick: Tick, interval: Interval): Bar[] {
  const start = bucketStart(tick.time, interval);
  const last = bars[bars.length - 1];
  if (last && last.time === start) {
    const next = { ...last, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price, volume: last.volume + tick.volume };
    return [...bars.slice(0, -1), next];
  }
  if (last && start < last.time) return bars; // 늦게 온 체결은 무시
  return [...bars, { time: start, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.volume }];
}

/**
 * 모아 둔 체결 여러 개를 한 번에 반영. 배열은 한 번만 복사한다
 * (체결마다 applyTick 으로 복사하면 봉이 수만 개일 때 0.25초마다 수십 번 전체 복사)
 */
export function applyTicks(bars: Bar[], ticks: Tick[], interval: Interval): Bar[] {
  let out: Bar[] | null = null;
  for (const tick of ticks) {
    const list: Bar[] = out ?? bars;
    const start = bucketStart(tick.time, interval);
    const last = list[list.length - 1];
    if (last && start < last.time) continue; // 늦게 온 체결은 무시
    out ??= bars.slice();
    if (last && last.time === start)
      out[out.length - 1] = { ...last, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price, volume: last.volume + tick.volume };
    else out.push({ time: start, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.volume });
  }
  return out ?? bars;
}

/** 미국 거래 구간 (뉴욕 시간): 프리 04:00~09:30 · 정규 09:30~16:00 · 애프터 16:00~20:00 · 주간거래 20:00~04:00 (한국 낮) */
export type UsSession = "pre" | "regular" | "after" | "overnight" | "closed";

/**
 * 미국 체결을 일봉에 넣을 때 쓸 시각: 체결의 뉴욕 날짜 → 그날 KST 정오 (일봉 time 이 그날 KST 자정이라 같은 봉에 들어감)
 * 국내 체결은 그대로
 */
export function usDailyTickTime(time: number) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time * 1000));
  return Date.parse(`${ymd}T12:00:00+09:00`) / 1000;
}

/** 실시간 체결 구독. 반환 함수로 해제 (백엔드가 0B 등록도 같이 뺀다) */
/** delayed: 실시간이 아니라 늦은 시세로 갱신 중 (차트에 '지연' 표시) */
export type StreamStatus = { marketOpen: boolean; session?: UsSession; delayed?: boolean };
export function openStream(code: string, handlers: { onTick: (t: Tick) => void; onStatus?: (s: StreamStatus) => void; onError?: () => void }, exchange?: UsExchange) {
  if (isIndexCode(code)) return openIndexStream(code, handlers);
  if (isFuturesCode(code)) return openFuturesStream(code, handlers);
  const source = new EventSource(exchange ? `${API}/api/v1/charts/us/${encodeURIComponent(kiwoomTicker(code))}/stream?exchange=${exchange}` : `${API}/api/v1/charts/${code}/stream`);
  source.addEventListener("tick", (e) => handlers.onTick(JSON.parse((e as MessageEvent).data)));
  source.addEventListener("status", (e) => handlers.onStatus?.(JSON.parse((e as MessageEvent).data)));
  source.onerror = () => handlers.onError?.();
  return () => source.close();
}

/** 지수 실시간 (2026-11-22): 3초마다 현재가를 물어 장중에만 체결처럼 넣음 */
function openIndexStream(code: string, handlers: { onTick: (t: Tick) => void; onStatus?: (s: { marketOpen: boolean }) => void }) {
  let stop = false;
  const poll = async () => {
    try {
      const q = await get<{ price: number; at: number; open: boolean }>(`/charts/index/${code}/quote`);
      if (stop) return;
      handlers.onStatus?.({ marketOpen: q.open });
      if (q.open && q.price > 0) handlers.onTick({ code, time: q.at, price: q.price, volume: 0 });
    } catch {
      // 다음 번에 다시
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), 3000);
  return () => {
    stop = true;
    clearInterval(timer);
  };
}

/**
 * 선물 · 환율 실시간 (2026-11-22)
 *   OKX 상품이 있고(나스닥100 · S&P500 · 금) CME 가 거래하는 날: OKX 체결을 CME 가격 기준으로 맞춰 바로 넣음 (CME 무료 시세는 약 10분 늦어서)
 *     맞춤 = 마지막 CME 1분 종가 ÷ 같은 분의 OKX 종가 (1분마다 다시 잼)
 *   CME 휴장일(주말 · 미국 휴일)엔 OKX 를 붙이지 않음 → 차트는 CME 마지막 가격에 멈춤
 *   OKX 상품이 없으면: 1분마다 CME 1분봉 마지막 값을 넣음 (약 10분 늦음)
 */
function openFuturesStream(code: string, handlers: { onTick: (t: Tick) => void; onStatus?: (s: StreamStatus) => void }) {
  const inst = specialOf(code)?.okx;
  let stop = false;
  let basis: number | null = null;
  let lastCme: { time: number; close: number } | null = null;
  let closeOkx: (() => void) | null = null;
  /** CME 가 지금 거래하는 날인지: 뉴욕 일요일 18시 ~ 금요일 17시, 그리고 마지막 CME 체결이 2시간 안 (휴일이면 멈춰 있음) */
  const cmeDay = () => {
    const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dow = ny.getDay();
    const h = ny.getHours();
    const weekOpen = !(dow === 6 || (dow === 0 && h < 18) || (dow === 5 && h >= 17));
    const fresh = !!lastCme && Date.now() / 1000 - lastCme.time < 2 * 3600 + 15 * 60;
    return weekOpen && fresh;
  };
  const refresh = async () => {
    try {
      const data = await get<{ bars: Bar[] }>(`/charts/futures/${encodeURIComponent(code)}/bars?interval=1m&limit=1`);
      const b = data.bars[data.bars.length - 1];
      if (stop || !b) return;
      const isNew = !lastCme || b.time > lastCme.time;
      lastCme = { time: b.time, close: b.close };
      const live = cmeDay();
      if (inst && live) {
        const okx = await okxCloseAt(inst, b.time).catch(() => null);
        // 같은 분의 CME 값과 10% 넘게 다르면 다른 상품으로 보고 붙이지 않음 (기존 차트와 가격이 어긋나지 않게)
        const ratio = okx ? b.close / okx : null;
        if (ratio && Math.abs(ratio - 1) < 0.1) basis = ratio;
        else if (ratio) basis = null;
      }
      const okxOn = !!(inst && live && basis);
      handlers.onStatus?.({ marketOpen: live, delayed: live && !okxOn });
      if (okxOn && inst) {
        if (!closeOkx && !stop) closeOkx = openOkxStream(inst, (t) => basis && handlers.onTick({ code, time: t.time, price: Math.round(t.price * basis * 10000) / 10000, volume: t.volume, regular: true }));
      } else {
        closeOkx?.();
        closeOkx = null;
        if (isNew) handlers.onTick({ code, time: b.time, price: b.close, volume: 0, regular: true });
      }
    } catch {
      // 다음 번에 다시
    }
  };
  void refresh();
  const timer = setInterval(() => void refresh(), 60_000);
  return () => {
    stop = true;
    clearInterval(timer);
    closeOkx?.();
  };
}
