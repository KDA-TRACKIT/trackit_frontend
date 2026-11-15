// 알고리즘 매매 규칙 (백엔드에 이미 있는 API, docs/algo.md)
//   GET  /algo/indicators                    조건에 쓸 지표·연산자 목록 (로그인 없이)
//   GET  /algo/rules                         내 규칙
//   POST /algo/rules                         만들기 { accountId, symbol, name?, rule } → 멈춘 상태로 시작
//   GET  /algo/rules/:id                     상세 (버전 전체 + 최근 신호 50건)
//   PATCH /algo/rules/:id                    실행/중지 { status }, 이름 { name }
//   POST /algo/rules/:id/versions            수정 = 새 버전 확정 { rule } (이전 버전은 DB 에 그대로)
//   DELETE /algo/rules/:id                   지우기 = 보관 (규칙·버전·신호 기록은 DB 에 남고 목록·실행에서만 빠짐)
// 실제 실행·주문은 백엔드 작업 프로그램(npm run algo)이 한다. 화면은 규칙 설정·상태만 다룬다.
import type { AlgoCatalog, AlgoRule, TradingRule, TradingRuleDetail } from "../types/algo";
import { apiRequest } from "./client";

export function getAlgoCatalog() {
  return apiRequest<AlgoCatalog>("/algo/indicators", { auth: false });
}

export function listRules() {
  return apiRequest<TradingRule[]>("/algo/rules");
}

export function getRule(id: string) {
  return apiRequest<TradingRuleDetail>(`/algo/rules/${id}`);
}

export function createRule(input: { accountId: string; symbol: string; name?: string; rule: AlgoRule }) {
  return apiRequest<TradingRule>("/algo/rules", { method: "POST", body: JSON.stringify(input) });
}

export function addRuleVersion(id: string, rule: AlgoRule) {
  return apiRequest<TradingRule>(`/algo/rules/${id}/versions`, { method: "POST", body: JSON.stringify({ rule }) });
}

export function renameRule(id: string, name: string | null) {
  return apiRequest<TradingRule>(`/algo/rules/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

/** 지우기 (보관). 기록은 남는다 */
export function archiveRule(id: string) {
  return apiRequest<{ id: string; status: "ARCHIVED" }>(`/algo/rules/${id}`, { method: "DELETE" });
}

export function setRuleStatus(id: string, status: "ACTIVE" | "PAUSED") {
  return apiRequest<TradingRule>(`/algo/rules/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

/** 규칙을 걸 수 있는 실제 증권사 계좌 (모의 주문 화면용 가짜 계좌는 쓰지 않음) */
export async function listAlgoAccounts(): Promise<{ id: string; label: string }[]> {
  type Connection = { mode: "mock" | "real"; broker: { name: string }; accounts: { id: string; accountNoMasked: string; status: string }[] };
  const connections = await apiRequest<Connection[]>("/brokers/connections");
  return connections.flatMap((c) =>
    c.accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, label: `${c.broker.name} ${a.accountNoMasked}${c.mode === "mock" ? " (모의)" : " (실전)"}` })),
  );
}
