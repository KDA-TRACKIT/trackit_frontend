// 주문 승인 · 실행 (백엔드 예정 계약: POST /api/v1/trading/approvals, POST /api/v1/trading/orders)

export type RiskValidation = {
  allowed: boolean;
  warnings: string[];
  errors: string[];
  estimatedAmount?: string;
  estimatedFee?: string;
  currentBalance?: string;
  currentPosition?: string;
  dailyLossLimit?: string;
};

export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";

/** 백엔드가 검증 뒤 돌려주는 주문 미리보기. 프론트는 값을 바꾸지 않고 승인 요청에 그대로 보낸다 */
export type OrderPreview = {
  accountId: string;
  accountLabel: string;
  symbol: string;
  symbolName: string;
  side: OrderSide;
  quantity: string;
  orderType: OrderType;
  price?: string;
  estimatedAmount: string;
  estimatedFee: string;
  currentBalance: string;
  balanceAfter: string;
  warnings: string[];
  rationale: string;
};

export type ApprovalRequest = {
  taskId: string;
  accountId: string;
  symbol: string;
  side: OrderSide;
  quantity: string;
  orderType: OrderType;
  price?: string;
  confirmed: true;
};

export type TradeApproval = {
  approvalId: string;
  taskId: string;
  status: "APPROVED" | "REJECTED" | "EXPIRED";
  createdAt: string;
};

export type OrderResult = {
  orderId: string;
  status: "SUBMITTED" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "FAILED";
  symbol: string;
  side: OrderSide;
  quantity: string;
  filledQuantity?: string;
  price?: string;
  message?: string;
  createdAt: string;
};

export const ORDER_SETTLED: ReadonlySet<OrderResult["status"]> = new Set(["FILLED", "CANCELED", "FAILED"]);

/** 증권사 계좌 (GET /brokers/connections 의 accounts 를 펼친 것) */
export type BrokerAccount = { id: string; label: string; mode: "mock" | "real"; brokerName: string };

export type Portfolio = {
  asOf: string | null;
  balance: { cash: string; totalEvaluation: string } | null;
  positions: { symbol: string; quantity: string; avgPrice: string }[];
};
