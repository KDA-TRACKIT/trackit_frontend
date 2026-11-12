// 증권사 계좌 · 잔고 (백엔드에 이미 있는 API)
//   GET /brokers/connections                       → 연결 목록 (accounts 포함)
//   GET /brokers/accounts/:accountId/portfolio     → 마지막 잔고 스냅샷
// 로그인 전이거나 모의 주문 모드면 모의 계좌 하나를 돌려준다.
import type { BrokerAccount, Portfolio } from "../types/trading";
import { accessToken, apiRequest, USE_MOCK_TRADING } from "./client";
import { MOCK_ACCOUNT } from "./mock/trading-server";

type Connection = {
  id: string;
  label: string | null;
  mode: "mock" | "real";
  broker: { code: string; name: string };
  accounts: { id: string; accountNoMasked: string; status: string }[];
};

export async function listAccounts(): Promise<BrokerAccount[]> {
  if (USE_MOCK_TRADING || !(await accessToken())) return [MOCK_ACCOUNT];
  const connections = await apiRequest<Connection[]>("/brokers/connections");
  return connections.flatMap((c) =>
    c.accounts
      .filter((a) => a.status === "ACTIVE")
      .map((a) => ({ id: a.id, label: `${c.broker.name} ${a.accountNoMasked}${c.mode === "mock" ? " (모의)" : ""}`, mode: c.mode, brokerName: c.broker.name })),
  );
}

export function getPortfolio(accountId: string): Promise<Portfolio> {
  return apiRequest(`/brokers/accounts/${accountId}/portfolio`);
}
