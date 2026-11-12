// 날짜별 종목 뉴스 (AI 요약)
//   실제 연결 지점: GET /api/v1/news?symbol={code}&date={YYYY-MM-DD}
//     → { data: { items: NewsArticle[] } }  (백엔드가 뉴스 수집·AI 요약. 프론트는 AI·뉴스 API를 직접 부르지 않는다)
//   백엔드에 아직 없어서 지금은 mock/news.ts 가 대신 답한다
import { apiRequest } from "./client";
import { mockDailyNews } from "./mock/news";

export type NewsArticle = { title: string; summary: string; source: string; url?: string };

/** 뉴스 엔드포인트가 생기면 NEXT_PUBLIC_NEWS_API=http 로 바꾼다 */
const USE_MOCK_NEWS = process.env.NEXT_PUBLIC_NEWS_API !== "http";

/** mock 은 그날 등락으로 예시 문구를 고른다 (실제 API는 code·date만 쓴다) */
export type NewsContext = { close: number; prevClose?: number; isLast: boolean; time: number };

export async function fetchDailyNews(code: string, date: string, context: NewsContext, signal?: AbortSignal): Promise<NewsArticle[]> {
  if (USE_MOCK_NEWS) return mockDailyNews(context, signal);
  const data = await apiRequest<{ items: NewsArticle[] }>(`/news?symbol=${encodeURIComponent(code)}&date=${date}`, { signal });
  return data.items;
}
