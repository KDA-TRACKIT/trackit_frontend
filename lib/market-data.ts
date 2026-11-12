// 작업실 차트 시세 — 백엔드 /api/v1/charts 연결
//   일봉: data/daily CSV(+오늘 봉은 키움으로 보충)  /  1분·60분봉: 종목을 열 때 키움 ka10080
//   실시간: /stream (SSE) 체결로 마지막 봉 갱신, 초봉은 체결을 1초 단위로 묶어서 화면에서 만든다
import type { Bar, Interval } from "./mock/workshop";

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
};

/** 실시간 호가 구독. 반환 함수로 해제 (백엔드가 0D 등록도 같이 뺀다) */
export function openBookStream(code: string, handlers: { onBook: (book: OrderBook) => void; onError?: () => void }) {
  const source = new EventSource(`${API}/api/v1/charts/${code}/orderbook/stream`);
  source.addEventListener("book", (e) => handlers.onBook(JSON.parse((e as MessageEvent).data)));
  source.addEventListener("error", () => handlers.onError?.());
  return () => source.close();
}

/** 간격별 원본 요청과 묶음 단위 */
const SOURCE: Record<Interval, { api: "1d" | "1m" | "60m" | null; group: number }> = {
  "1s": { api: null, group: 1 },
  "1m": { api: "1m", group: 60 },
  "5m": { api: "1m", group: 300 },
  "1h": { api: "60m", group: 3600 },
  "1d": { api: "1d", group: 0 },
};

/** limit: 최근 N개만 (기본 전체. 일봉은 1980년대부터라 종목 정보처럼 최근만 필요하면 넣는다) */
export async function fetchBars(code: string, interval: Interval, signal?: AbortSignal, limit?: number): Promise<{ symbol: SymbolInfo; bars: Bar[] }> {
  const source = SOURCE[interval];
  if (source.api === null) {
    // 초봉은 과거가 없음 → 종목 정보만 일봉 요청으로 받아 둔다
    const { symbol } = await get<{ symbol: SymbolInfo; bars: Bar[] }>(`/charts/${code}/bars?interval=1d&limit=1`, signal);
    return { symbol, bars: [] };
  }
  const data = await get<{ symbol: SymbolInfo; bars: Bar[] }>(`/charts/${code}/bars?interval=${source.api}${limit ? `&limit=${limit}` : ""}`, signal);
  const bars = interval === "5m" ? groupBars(data.bars, 300) : data.bars;
  return { symbol: data.symbol, bars };
}

/** 봉 시작 시각. 일봉은 KST 자정, 나머지는 bucket 초 단위 (KST 정각 기준) */
export function bucketStart(time: number, interval: Interval) {
  const size = interval === "1d" ? 86400 : SOURCE[interval].group;
  return Math.floor((time + KST) / size) * size - KST;
}

/** 작은 봉을 큰 봉으로 묶음 (1분 → 5분) */
export function groupBars(bars: Bar[], seconds: number): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const start = Math.floor((b.time + KST) / seconds) * seconds - KST;
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

/** 실시간 체결 구독. 반환 함수로 해제 (백엔드가 0B 등록도 같이 뺀다) */
export function openStream(code: string, handlers: { onTick: (t: Tick) => void; onStatus?: (s: { marketOpen: boolean }) => void; onError?: () => void }) {
  const source = new EventSource(`${API}/api/v1/charts/${code}/stream`);
  source.addEventListener("tick", (e) => handlers.onTick(JSON.parse((e as MessageEvent).data)));
  source.addEventListener("status", (e) => handlers.onStatus?.(JSON.parse((e as MessageEvent).data)));
  source.onerror = () => handlers.onError?.();
  return () => source.close();
}
