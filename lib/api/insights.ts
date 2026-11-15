// 투자 정보 화면 (/insights) 에서 쓰는 시장 데이터. 키움 시세는 백엔드가 받아 캐시해 둔다 (로그인 필요 없음)
import { apiRequest } from "./client";

/** sp500 · nasdaq100 · dow = 미국 지수 맵 (키움 미국주식 시세, 달러) */
export type SectorMarket = "kospi" | "kosdaq" | "sp500" | "nasdaq100" | "dow";
export type KrMarket = "kospi" | "kosdaq";
export const isUsMarket = (m: SectorMarket) => m === "sp500" || m === "nasdaq100" || m === "dow";
/** industry: 세부 업종 (미국 지수 맵만) */
export type SectorStock = { code: string; name: string; price: number; changeRate: number; volume: number; marketCap: number; industry?: string };
export type Sector = { code: string; name: string; changeRate: number; marketCap: number; rising: number; falling: number; stocks: SectorStock[] };
/** version: 서버 판 번호, full: sectors 가 전체인지(아니면 since 뒤에 바뀐 업종만) */
export type SectorMap = { market: SectorMarket; currency: "KRW" | "USD"; asOf: string; marketOpen: boolean; version: number; full: boolean; sectors: Sector[] };

/**
 * 섹터맵: 업종별 등락률 + 업종 안 종목(시가총액·등락률)
 * since 를 주면 그 판 뒤에 바뀐 업종만 (서버 메모리에서 바로, 키움 호출 없음). focus = 크게 본 업종 (먼저 갱신)
 */
export function getSectorMap(market: SectorMarket, opts: { since?: number; focus?: string } = {}) {
  const q = new URLSearchParams({ market });
  if (opts.since !== undefined) q.set("since", String(opts.since));
  if (opts.focus) q.set("focus", opts.focus);
  return apiRequest<SectorMap>(`/charts/sectors?${q}`, { auth: false });
}

// ---------- 시장 전광판 ----------
export type BoardItem = { key: string; label: string; value: number; change: number | null; changeRate: number | null; unit: "pt" | "원" | "%" | "$" | ""; asOf: string; source: string };
/** missing = 서버에 없는 키 (그 칸은 안 나옴), failed = 이번에 못 받은 곳 */
export type Board = { items: BoardItem[]; missing: string[]; failed: string[] };
export const getBoard = () => apiRequest<Board>("/insights/board", { auth: false });

// ---------- 외국인·기관 ----------
export type FlowRow = { code: string; name: string; amount: number };
export type Flows = { market: KrMarket; asOf: string; foreignBuy: FlowRow[]; foreignSell: FlowRow[]; institutionBuy: FlowRow[]; institutionSell: FlowRow[] };
export const getFlows = (market: KrMarket) => apiRequest<Flows>(`/insights/flows?market=${market}`, { auth: false });

// ---------- 물가 ----------
export type InflationSeries = { key: string; label: string; country: "KR" | "US"; source: string; points: { month: string; yoy: number }[] };
export type Inflation = { series: InflationSeries[]; missing: string[]; failed: string[] };
export const getInflation = () => apiRequest<Inflation>("/insights/inflation", { auth: false });

// ---------- 경제 캘린더 ----------
/** date·time 은 한국 시간. impact = 중요도 1~3 (★). forecast·previous 는 이번 주 지표(ForexFactory)만 */
export type EconEvent = {
  date: string;
  time?: string;
  title: string;
  country: "US" | "KR" | "CN" | "JP" | "EU";
  kind: "금리" | "물가" | "고용" | "성장" | "연설" | "기타";
  impact: 1 | 2 | 3;
  forecast?: string;
  previous?: string;
  note?: string;
  source: string;
};
export type EconCalendar = { events: EconEvent[]; missing: string[]; failed: string[] };
export const getEconCalendar = () => apiRequest<EconCalendar>("/insights/calendar", { auth: false });

// ---------- 공시 ----------
export type Disclosure = { date: string; company: string; code: string; market: "KOSPI" | "KOSDAQ" | ""; title: string; filer: string; url: string };
export type Disclosures = { items: Disclosure[]; missing: string[] };
export const getDisclosures = (codes: string[] = []) => apiRequest<Disclosures>(`/insights/disclosures${codes.length ? `?codes=${codes.join(",")}` : ""}`, { auth: false });

// ---------- 뉴스 ----------
export type NewsStock = { code: string; name: string; market: string };
export type NewsItem = { id: string; title: string; url: string; source: string; publishedAt: string; stocks: NewsStock[] };
export type News = { items: NewsItem[]; failed: string[] };
export const getNews = () => apiRequest<News>("/insights/news", { auth: false });

// ---------- 관심 종목 시세 ----------
/** code: 국내 "005930", 미국 "ND:AAPL" (요청한 그대로) */
export type Quote = { code: string; name: string; price: number; change: number; changeRate: number; volume: number; currency: "KRW" | "USD" };
export const getQuotes = (codes: string[]) => apiRequest<{ quotes: Quote[] }>(`/insights/quotes?codes=${codes.join(",")}`, { auth: false });

// ---------- 종목 검색 (국내 + 미국 전 종목) ----------
export type SymbolHit = {
  code: string;
  name: string;
  ename?: string;
  market: "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE" | "AMEX";
  exchange?: "ND" | "NY" | "NA";
  etf: boolean;
  country: "KR" | "US";
};
export const searchAllSymbols = (q: string, signal?: AbortSignal) =>
  apiRequest<{ items: SymbolHit[] }>(`/insights/symbols?q=${encodeURIComponent(q)}&limit=10`, { auth: false, signal }).then((d) => d.items);

// ---------- 미국 일봉 (눌렀을 때 바로: 저장된 10년치에서 최근 구간만, 예전은 before 로) ----------
export type UsBar = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type UsBars = {
  symbol: { code: string; name: string; ename?: string; market: string; exchange: string };
  bars: UsBar[];
  /** 더 예전 봉이 있는지 */
  hasMore: boolean;
  /** stored = 미리 받아 둔 것, kiwoom = 방금 키움에서 */
  source: "stored" | "kiwoom";
  full: boolean;
};
/** code 는 키움 표기 (BRK.B → BRKb). before = epoch 초 (이보다 예전만) */
export const getUsBars = (code: string, opts: { exchange?: string; limit?: number; before?: number } = {}, signal?: AbortSignal) => {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 300) });
  if (opts.exchange) q.set("exchange", opts.exchange);
  if (opts.before) q.set("before", String(opts.before));
  return apiRequest<UsBars>(`/charts/us/${encodeURIComponent(code)}/bars?${q}`, { auth: false, signal });
};
/** "BRK.B" (위키백과·지수 맵 표기) → "BRKb" (키움 표기) */
export const kiwoomTicker = (s: string) => s.replace(/\.([A-Z])$/, (_, c: string) => c.toLowerCase());
