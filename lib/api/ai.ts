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
  mode: "ai";
  /** 차트 메모는 GPT 를 먼저 쓰도록 백엔드 provider 선택을 전달 (feature/ai-chart-memo-gemini-frontend) */
  provider?: "gemini" | "openai";
  /** 미국 종목은 USD (메모 금액을 $로) */
  currency?: "KRW" | "USD";
};
export type ChartMemoResult = {
  memo: string;
  /** AI 분석일 때만 (규칙 메모면 없음) */
  summary?: string;
  /** 백엔드가 한국어로 줌 ("상승 관점" · "하락 관점" · "관망" · "판단 보류"). 예전 응답은 LONG 등 */
  direction?: "LONG" | "SHORT" | "WAIT" | "UNKNOWN" | string;
  /** 지금 차트 구조 (추세 · 박스 등) */
  marketStructure?: string;
  /** 여러 작도가 겹치는 근거 */
  confluence?: string[];
  bullishScenario?: string;
  bearishScenario?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  tools?: string[];
  risks?: string[];
  /** 백엔드는 한 줄 문자열로 줌 (예전 응답은 목록) */
  invalidation?: string | string[];
  model?: string;
  provider?: string;
  suggestion?: string;
  items?: string[];
  /** AI 가 투자자에게 되묻는 질문 (빈칸을 임의로 채우지 않고) */
  questions?: string[];
  /** AI 를 못 써서(꺼짐 · 키 없음 · 오류) 규칙 메모로 대신 정리했을 때 그 이유 */
  aiFallback?: string;
};

export function requestChartMemo(body: ChartMemoRequest): Promise<ChartMemoResult> {
  // 차트 메모도 저장된 일지·주석과 같은 사용자 데이터이므로 인증 토큰을 보낸다.
  // 프론트 주소로 보내 next.config rewrite 가 AI 백엔드(AI_API_URL, Gemini 키가 있는 곳)로 넘기게
  return apiRequest("/ai/chart-memo", { method: "POST", body: JSON.stringify(body), sameOrigin: true });
}
