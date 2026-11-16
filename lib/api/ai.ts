// AI 분석 API.
// 실제 연결 지점: POST /api/v1/ai/analyze → { taskId }, GET /api/v1/ai/tasks/:taskId → AiTask
// 백엔드가 아직 없어서 USE_MOCK_TRADING 이면 lib/api/mock/trading-server.ts 를 쓴다.
// 프론트는 Gemini·OpenAI를 직접 부르지 않는다. 어떤 모델을 썼는지는 응답의 model 로만 안다.
import type { AiTask, AnalyzeRequest } from "../types/ai";
import { apiRequest, USE_MOCK_TRADING } from "./client";
import * as mock from "./mock/trading-server";

export function requestAnalysis(body: AnalyzeRequest): Promise<{ taskId: string }> {
  if (USE_MOCK_TRADING) return mock.postAnalyze(body);
  return apiRequest("/ai/analyze", { method: "POST", body: JSON.stringify(body) });
}

export function getAiTask(taskId: string): Promise<AiTask> {
  if (USE_MOCK_TRADING) return mock.getTask(taskId);
  return apiRequest(`/ai/tasks/${encodeURIComponent(taskId)}`);
}

/** 작업실 "저장": 드로잉·차트 노트 → 백엔드가 판단 메모 초안으로 정리 (저장·주문 없음) */
export type ChartMemoRequest = {
  symbol: { code: string; name: string };
  interval: string;
  price: number;
  drawings: { toolId: string; label: string; points: { time: number; price: number }[]; text?: string }[];
  notes: { time: number; price: number; text: string }[];
};
export type ChartMemoResult = { memo: string; suggestion: string; items: string[]; model: string };

export function requestChartMemo(body: ChartMemoRequest): Promise<ChartMemoResult> {
  // 차트 메모도 저장된 일지·주석과 같은 사용자 데이터이므로 인증 토큰을 보낸다.
  return apiRequest("/ai/chart-memo", { method: "POST", body: JSON.stringify(body) });
}
