// 알고리즘 매매 규칙 (백엔드 lib/algo/rules.ts · conditions.ts 와 같은 모양, docs/algo.md)

export type AlgoOperator = ">" | ">=" | "<" | "<=" | "crossesAbove" | "crossesBelow";
export type AlgoSource = "close" | "open" | "high" | "low" | "volume" | "hl2" | "hlc3";

/** 상수 또는 지표 값 */
export type AlgoOperand =
  | { value: number }
  | {
      indicator: string;
      params?: Record<string, number>;
      field?: string;
      source?: AlgoSource;
      /** n봉 전 값 (0 = 방금 마감된 봉) */
      offset?: number;
      /** 값에 곱함 (예: 평균 거래량의 1.5배) */
      multiplier?: number;
    };

export type AlgoCondition = { left: AlgoOperand; op: AlgoOperator; right: AlgoOperand };
export type AlgoGroup = AlgoCondition | { all: AlgoGroup[] } | { any: AlgoGroup[] } | { not: AlgoGroup };

type Common = { timeframe: number; quantity: number; maxOrdersPerDay?: number };

export type AlgoRule =
  | ({ strategy: "CUSTOM"; entry: AlgoGroup; exit?: AlgoGroup; stopLossPct?: number; takeProfitPct?: number } & Common)
  | ({ strategy: "RSI"; period: number; buyBelow: number; sellAbove: number } & Common)
  | ({ strategy: "SMA_CROSS"; fast: number; slow: number } & Common);

export type AlgoRuleVersion = { id: string; version: number; rule: AlgoRule; confirmedAt: string; contentHash: string };

/** GET /algo/rules 의 한 줄 */
export type TradingRule = {
  id: string;
  accountId: string;
  symbol: string;
  name: string | null;
  status: "ACTIVE" | "PAUSED";
  createdAt: string;
  updatedAt: string;
  currentVersion: AlgoRuleVersion | null;
  /** 만들기·실행/중지 응답에만: 서버 주문 스위치 (false 면 신호만 기록) */
  ordersEnabled?: boolean;
};

export type AlgoSignal = {
  id: string;
  ruleVersionId: string;
  side: "BUY" | "SELL";
  barTime: string;
  snapshot: { reason?: string; values?: Record<string, number | null>; [k: string]: unknown };
  quantity: string;
  status: "PENDING" | "SUBMITTED" | "FAILED" | "SKIPPED" | string;
  orderId: string | null;
  error: string | null;
  createdAt: string;
};

export type TradingRuleDetail = TradingRule & { versions: AlgoRuleVersion[]; signals: AlgoSignal[] };

/** GET /algo/indicators (규칙 편집기용 목록) */
export type AlgoCatalogIndicator = {
  name: string;
  label: string;
  params: Record<string, { min: number; max: number; default: number; integer?: boolean; label: string }>;
  fields: { values: string[]; default: string; labels: Record<string, string> } | null;
  source: boolean;
};

export type AlgoCatalog = {
  indicators: AlgoCatalogIndicator[];
  sources: AlgoSource[];
  operators: AlgoOperator[];
  limits: { maxDepth: number; maxConditions: number; maxOffset: number };
};
