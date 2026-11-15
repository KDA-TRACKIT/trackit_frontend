// 작업실 차트 시세 — 백엔드 /api/v1/charts 연결
//   일봉: data/daily CSV(+오늘 봉은 키움으로 보충)  /  1분·60분봉: 종목을 열 때 키움 ka10080
//   실시간: /stream (SSE) 체결로 마지막 봉 갱신, 초봉은 체결을 1초 단위로 묶어서 화면에서 만든다
import { bucketStart, groupBars, needsGrouping, sourceOf, type Interval } from "./interval";
import type { Bar } from "./mock/workshop";

export { bucketStart, groupBars };

export type SymbolInfo = { code: string; name: string; market: string };
export type Tick = { code: string; time: number; price: number; volume: number };

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
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
export async function fetchBars(code: string, interval: Interval, signal?: AbortSignal, limit?: number): Promise<{ symbol: SymbolInfo; bars: Bar[]; complete: boolean }> {
  const api = sourceOf(interval);
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

/** 실시간 체결 구독. 반환 함수로 해제 (백엔드가 0B 등록도 같이 뺀다) */
export function openStream(code: string, handlers: { onTick: (t: Tick) => void; onStatus?: (s: { marketOpen: boolean }) => void; onError?: () => void }) {
  const source = new EventSource(`${API}/api/v1/charts/${code}/stream`);
  source.addEventListener("tick", (e) => handlers.onTick(JSON.parse((e as MessageEvent).data)));
  source.addEventListener("status", (e) => handlers.onStatus?.(JSON.parse((e as MessageEvent).data)));
  source.onerror = () => handlers.onError?.();
  return () => source.close();
}
