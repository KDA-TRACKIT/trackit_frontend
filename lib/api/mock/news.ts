// 뉴스 mock: 백엔드 /news 가 생기기 전까지 예시 문구를 돌려준다 (실제 기사 아님)
import { newsFor, type Bar } from "../../mock/workshop";
import type { NewsArticle, NewsContext } from "../news";

export async function mockDailyNews(ctx: NewsContext, signal?: AbortSignal): Promise<NewsArticle[]> {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 600);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
  const bar = { time: ctx.time, open: ctx.close, high: ctx.close, low: ctx.close, close: ctx.close, volume: 0 } as Bar;
  const prev = ctx.prevClose ? { ...bar, close: ctx.prevClose } : undefined;
  // 등락이 작은 날도 버튼을 눌렀으면 한 건은 보여준다
  const item = newsFor(bar, prev, true);
  return item ? [item] : [];
}
