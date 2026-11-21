import { ApiError, apiRequest } from "./client";

type CountByTrader = Record<string, number>;

export type MarketRankings = {
  subscribers: CountByTrader;
  honey: CountByTrader;
};

export async function getMarketRankings(signal: AbortSignal): Promise<MarketRankings> {
  const options = { auth: false, signal };
  try {
    return await apiRequest<MarketRankings>("/market/rankings", options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    // 새 집계 경로가 아직 배포되지 않은 백엔드에서도 기존 집계값을 사용한다.
    const [subscribers, honey] = await Promise.all([
      apiRequest<CountByTrader>("/market/subscribers", options),
      apiRequest<CountByTrader>("/market/feedback", options),
    ]);
    return { subscribers, honey };
  }
}
