// AI 분석 (백엔드 예정 계약: POST /api/v1/ai/analyze, GET /api/v1/ai/tasks/:taskId)
import type { ChartDrawing } from "./chart";
import type { OrderPreview, RiskValidation } from "./trading";

export type AiTaskKind = "CHART" | "JOURNAL" | "STRATEGY";

export type AiTaskStatus = "IDLE" | "QUEUED" | "RUNNING" | "VALIDATING" | "WAITING_APPROVAL" | "EXECUTING" | "SUCCEEDED" | "FAILED" | "CANCELED";

/** 백엔드 lib/ai/types.ts 와 같은 형태. 금액·수량은 문자열(Decimal) */
export type TradeAnalysis = {
  action: "BUY" | "SELL" | "HOLD";
  symbol: string;
  quantity?: string;
  price?: string;
  confidence: number;
  rationale: string;
};

export type AnalyzeRequest = {
  kind: AiTaskKind;
  symbol: string;
  market: string;
  timeframe: string;
  journalId?: string;
  accountId?: string;
  journalContent?: string;
  drawings: ChartDrawing[];
};

export type AiTask = {
  taskId: string;
  kind: AiTaskKind;
  status: Exclude<AiTaskStatus, "IDLE">;
  symbol: string;
  createdAt: string;
  analysis?: TradeAnalysis;
  /** 분석 시각 · 사용 모델 (예: gemini-2.5-pro, 폴백 시 openai 모델) */
  analyzedAt?: string;
  model?: string;
  /** 백엔드 위험 검증 결과. 주문 가능 여부는 이 값만 따른다 */
  validation?: RiskValidation;
  /** 검증을 통과했을 때 백엔드가 만든 주문 미리보기. 승인 요청에 그대로 쓴다 */
  orderPreview?: OrderPreview;
  /** 서버 기능 플래그 (AI_TRADING_ENABLED, TRADING_REQUIRE_USER_APPROVAL) */
  trading?: { enabled: boolean; requireApproval: boolean };
  error?: { code: string; message: string };
};

/** 더 조회할 필요 없는 상태 (WAITING_APPROVAL은 사용자 차례라 조회를 멈춘다) */
export const TASK_SETTLED: ReadonlySet<AiTaskStatus> = new Set(["WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELED"]);
