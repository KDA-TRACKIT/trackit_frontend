// 주문 승인 · 실행 API.
// 실제 연결 지점:
//   POST /api/v1/trading/approvals  body ApprovalRequest (confirmed: true 필수) → TradeApproval
//   POST /api/v1/trading/orders     body { approvalId }                        → OrderResult
//   GET  /api/v1/trading/orders/:orderId                                        → OrderResult
// 프론트는 MCP·증권사 API를 직접 부르지 않는다. 주문은 승인 id로만 요청하고 파라미터는 서버가 승인 기록에서 꺼낸다.
import type { ApprovalRequest, OrderPreview, OrderResult, TradeApproval } from "../types/trading";
import { apiRequest, USE_MOCK_TRADING } from "./client";
import * as mock from "./mock/trading-server";

/** 백엔드가 준 미리보기 값을 그대로 승인 요청으로 (프론트에서 바꾸지 않음) */
export function approvalFromPreview(taskId: string, preview: OrderPreview): ApprovalRequest {
  return {
    taskId,
    accountId: preview.accountId,
    symbol: preview.symbol,
    side: preview.side,
    quantity: preview.quantity,
    orderType: preview.orderType,
    price: preview.price,
    confirmed: true,
  };
}

export function createApproval(body: ApprovalRequest): Promise<TradeApproval> {
  if (USE_MOCK_TRADING) return mock.postApproval(body);
  return apiRequest("/trading/approvals", { method: "POST", body: JSON.stringify(body) });
}

export function placeOrder(approvalId: string): Promise<OrderResult> {
  if (USE_MOCK_TRADING) return mock.postOrder({ approvalId });
  return apiRequest("/trading/orders", { method: "POST", body: JSON.stringify({ approvalId }) });
}

export function getOrder(orderId: string): Promise<OrderResult> {
  if (USE_MOCK_TRADING) return mock.getOrder(orderId);
  return apiRequest(`/trading/orders/${encodeURIComponent(orderId)}`);
}
