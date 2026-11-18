// 날짜별 종목 · 섹터 뉴스
//   GET /api/v1/news?symbol={code}&date={YYYY-MM-DD}&name={종목명}
//     → 백엔드가 네이버 뉴스 · 구글 뉴스 · Finnhub 에서 믿을 만한 언론사 기사만 모아 저장해 둔 것
//   NEXT_PUBLIC_NEWS_API=mock 이면 예전 예시 문구(mock/news.ts)
import { apiRequest } from "./client";
import { mockDailyNews } from "./mock/news";

/** kind: stock 종목 기사 · sector 같은 업종 기사 */
export type NewsArticle = { title: string; summary: string; source: string; url?: string; publishedAt?: string; kind?: "stock" | "sector" };

const USE_MOCK_NEWS = process.env.NEXT_PUBLIC_NEWS_API === "mock";

/** mock 은 그날 등락으로 예시 문구를 고른다 (실제 API는 code·date만 쓴다) */
export type NewsContext = { close: number; prevClose?: number; isLast: boolean; time: number };

export async function fetchDailyNews(code: string, date: string, context: NewsContext, signal?: AbortSignal, name?: string): Promise<NewsArticle[]> {
  if (USE_MOCK_NEWS) return mockDailyNews(context, signal);
  const q = new URLSearchParams({ symbol: code, date, ...(name ? { name } : {}) });
  const data = await apiRequest<{ items: NewsArticle[] }>(`/news?${q}`, { signal, auth: false });
  return data.items;
}

/** 기사가 있는 날 (YYYY-MM-DD). check = 아직 안 모은 후보 날짜를 백엔드가 먼저 찾아 봄 (최대 30일) */
export async function fetchNewsDays(code: string, from: string, to: string, signal?: AbortSignal, check: string[] = [], name?: string): Promise<Set<string>> {
  if (USE_MOCK_NEWS) return new Set();
  const q = new URLSearchParams({ symbol: code, from, to, ...(check.length ? { check: check.join(",") } : {}), ...(name ? { name } : {}) });
  const data = await apiRequest<{ days: { date: string; count: number }[] }>(`/news/days?${q}`, { signal, auth: false });
  return new Set(data.days.map((d) => d.date));
}

/**
 * 뉴스가 있는 날 (날짜 축에 미리 표시). 일봉 time 목록을 돌려준다
 *   mock: 등락이 큰 날(±2.5% 이상, mock 이 기사를 고르는 기준과 같음)
 *   실제 API 가 생기면 GET /news/days?symbol= 로 바꾼다
 */
export function newsDays(bars: { time: number; close: number }[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    if (prev && Math.abs(bars[i].close - prev) / prev >= 0.025) out.add(bars[i].time);
  }
  return out;
}
