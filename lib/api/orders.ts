// 매매 창 → 증권사 주문 (백엔드가 처리, 프론트는 증권사 API 를 직접 부르지 않는다)
//   GET  /brokers/connections                          → 연결한 증권사 계좌
//   GET  /brokers/accounts/:id/portfolio               → 예수금·보유 종목 (마지막 동기화)
//   POST /brokers/accounts/:id/orders  { …, confirm }  → 주문 접수 (주문번호)
// 서버 안전장치: BROKER_ORDERS_ENABLED=true 여야 주문, 실전 계좌는 BROKER_REAL_ORDERS_ENABLED 추가로 필요
// 주문은 사용자가 확인 화면에서 "주문 확정"을 누른 뒤 한 번만 보낸다. 실패해도 다시 보내지 않는다
import type { Portfolio } from "../types/trading";
import { API_URL, ApiError, accessToken, apiRequest } from "./client";

export type OrderAccount = { id: string; label: string; mode: "mock" | "real" };

type Connection = {
  label: string | null;
  mode: "mock" | "real";
  broker: { name: string };
  accounts: { id: string; accountNoMasked: string; status: string }[];
};

/** 로그인한 사용자의 활성 계좌 (모의 계좌 먼저). 로그인 전이면 빈 목록 */
export async function orderAccounts(): Promise<OrderAccount[]> {
  if (!(await accessToken())) return [];
  const connections = await apiRequest<Connection[]>("/brokers/connections");
  return connections
    .flatMap((c) =>
      c.accounts
        .filter((a) => a.status === "ACTIVE")
        .map((a) => ({ id: a.id, mode: c.mode, label: `${c.broker.name.replace(/증권$/, "")} ${a.accountNoMasked} · ${c.mode === "mock" ? "모의" : "실전"}` })),
    )
    .sort((a, b) => (a.mode === b.mode ? 0 : a.mode === "mock" ? -1 : 1));
}

export function accountPortfolio(accountId: string): Promise<Portfolio> {
  return apiRequest<Portfolio>(`/brokers/accounts/${encodeURIComponent(accountId)}/portfolio`);
}

/** 저장된 잔고가 이보다 오래되면 증권사에서 다시 받는다 */
const PORTFOLIO_FRESH_MS = 60_000;

/**
 * 매매 창에 쓸 잔고: Supabase 에 저장된 마지막 잔고를 먼저 보고, 없거나 1분보다 오래됐으면
 * 백엔드가 증권사에서 새로 받아 저장한 값 (조회만, 주문 아님). 새로 받기 실패하면 저장된 값 그대로
 */
export async function freshPortfolio(accountId: string, force = false): Promise<Portfolio> {
  const saved = force ? null : await accountPortfolio(accountId);
  if (saved?.asOf && Date.now() - new Date(saved.asOf).getTime() < PORTFOLIO_FRESH_MS) return saved;
  try {
    return await apiRequest<Portfolio>(`/brokers/accounts/${encodeURIComponent(accountId)}/portfolio`, { method: "POST" });
  } catch (error) {
    if (saved) return saved;
    throw error;
  }
}

export type OrderRequest = { side: "BUY" | "SELL"; symbol: string; quantity: number; orderType: "LIMIT" | "MARKET"; price?: number };

/** 확인 화면에서 확정한 주문을 그대로 보낸다 (confirm: true) */
export function sendOrder(accountId: string, order: OrderRequest): Promise<{ orderNo: string }> {
  return apiRequest<{ orderNo: string }>(`/brokers/accounts/${encodeURIComponent(accountId)}/orders`, {
    method: "POST",
    body: JSON.stringify({ ...order, ...(order.orderType === "MARKET" ? { price: undefined } : {}), confirm: true }),
  });
}

// ---------- 증권사 연결 (마이페이지) ----------
// 앱키·시크릿은 백엔드로만 보내고 브라우저에 저장하지 않는다. 백엔드가 실제로 키움에 확인한 뒤 계좌를 연결한다

export type BrokerConnection = {
  id: string;
  label: string | null;
  mode: "mock" | "real";
  status: string;
  broker: { code: string; name: string };
  accounts: { id: string; accountNoMasked: string; status: string }[];
};

export function listConnections(): Promise<BrokerConnection[]> {
  return apiRequest<BrokerConnection[]>("/brokers/connections");
}

export function connectBroker(input: { appKey: string; appSecret: string; mode: "mock" | "real"; openedAt: string; label?: string }): Promise<unknown> {
  return apiRequest("/brokers/connections", { method: "POST", body: JSON.stringify({ brokerCode: "KIWOOM", ...input }) });
}

export function disconnectBroker(connectionId: string): Promise<unknown> {
  return apiRequest(`/brokers/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE" });
}

// ---------- 체결 불러오기 (동기화) ----------
// 증권사 체결은 동기화해야 매매 기록(Trade)·포지션·성과에 들어간다. 연결만 해 두면 하루 1회 크론에서만 받음

export type SyncJob = { id: string; type: string; status: "QUEUED" | "RUNNING" | "DONE" | "FAILED" | string; fetchedCount?: number; insertedCount?: number; error?: string | null };
export type SyncStatus = {
  accountId: string;
  lastSyncedAt: string | null;
  /** 어디까지 받았는지 (EXECUTIONS·ORDERS) */
  syncedThrough: Record<string, string | null>;
  active: SyncJob | null;
};

export function getSyncStatus(accountId: string): Promise<SyncStatus> {
  return apiRequest<SyncStatus>(`/brokers/accounts/${encodeURIComponent(accountId)}/sync`);
}

/**
 * 지금 바로 동기화 (서버가 시간 예산 안에서 처리, 다 못 받으면 다시 대기 → 한 번 더 누르면 이어 받음)
 * 이 엔드포인트는 { data } 로 감싸지 않고 작업을 그대로 돌려준다
 */
export async function syncNow(accountId: string): Promise<SyncJob & { processed?: unknown }> {
  const token = await accessToken();
  const res = await fetch(`${API_URL}/api/v1/brokers/accounts/${encodeURIComponent(accountId)}/sync`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ now: true }),
  });
  const body = (await res.json().catch(() => null)) as (SyncJob & { error?: { message?: string } }) | { error?: { message?: string } } | null;
  if (!res.ok) throw new ApiError(res.status, "SYNC_FAILED", (body as { error?: { message?: string } } | null)?.error?.message ?? "체결을 불러오지 못했어요.");
  return body as SyncJob;
}

// ---------- 오늘 주문 내역 · 정정 · 취소 ----------
// 정정·취소도 주문과 같다: 사용자가 확인 화면에서 확정한 뒤 한 번만 보내고, 실패해도 다시 보내지 않는다

export type TodayOrder = {
  orderNo: string;
  symbol: string;
  name: string;
  side: "BUY" | "SELL";
  orderType: string;
  price: number;
  quantity: number;
  filled: number;
  remaining: number;
  avgFillPrice: number;
  status: string;
  kind: string;
  originalOrderNo: string | null;
  time: string;
  open: boolean;
};

/** 오늘 이 계좌 주문 (백엔드가 증권사에서 바로 조회, 최신 순) */
export function todayOrders(accountId: string): Promise<TodayOrder[]> {
  return apiRequest<TodayOrder[]>(`/brokers/accounts/${encodeURIComponent(accountId)}/orders`);
}

/** 미체결 주문 정정: 지정가로 가격(과 수량) 변경. quantity 생략 = 남은 수량 전부 */
export function modifyOrder(accountId: string, orderNo: string, input: { symbol: string; price: number; quantity?: number }): Promise<{ orderNo: string }> {
  return apiRequest<{ orderNo: string }>(`/brokers/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderNo)}/modify`, {
    method: "POST",
    body: JSON.stringify({ ...input, confirm: true }),
  });
}

/** 미체결 주문 취소. quantity 생략 = 남은 수량 전부 */
export function cancelOrder(accountId: string, orderNo: string, input: { symbol: string; quantity?: number }): Promise<{ orderNo: string }> {
  return apiRequest<{ orderNo: string }>(`/brokers/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderNo)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ ...input, confirm: true }),
  });
}

// ---------- 미국 주식 (키움) ----------
//   GET  /brokers/accounts/:id/us/buying-power?symbol&exchange&price  → 지금 시간대 · 살 수 있는 수량 · 팔 수 있는 수량
//   POST /brokers/accounts/:id/us/orders  { …, confirm }               → 주문 (넣은 시각의 시장: 주간 · 프리 · 정규 · 애프터)
//   GET  /brokers/accounts/:id/us/orders                                → 오늘 미국 주문
//   POST /brokers/accounts/:id/us/orders/:no/cancel|modify
export type UsExchange = "ND" | "NY" | "NA";
export type UsBuyingPower = {
  session: "daytime" | "pre" | "regular" | "after" | "closed";
  sessionLabel: string;
  orderTypes: ("LIMIT" | "MARKET")[];
  buyQty: number;
  cashUsd: number;
  krwOrder: boolean;
  cashKrw: number;
  sellQty: number;
  holdingQty: number;
  avgPrice: number;
};
export type UsOrderRequest = { side: "BUY" | "SELL"; symbol: string; exchange: UsExchange; quantity: number; orderType: "LIMIT" | "MARKET"; price?: number };
export type UsTodayOrder = TodayOrder & { exchange: UsExchange | null };

const acc = (id: string) => `/brokers/accounts/${encodeURIComponent(id)}/us`;

export function usBuyingPower(accountId: string, q: { symbol: string; exchange: UsExchange; price: number }): Promise<UsBuyingPower> {
  return apiRequest<UsBuyingPower>(`${acc(accountId)}/buying-power?symbol=${encodeURIComponent(q.symbol)}&exchange=${q.exchange}&price=${q.price}`);
}

/** 확인 화면에서 확정한 주문을 그대로 한 번 보낸다 (confirm: true). 실패해도 다시 보내지 않는다 */
export function sendUsOrder(accountId: string, order: UsOrderRequest): Promise<{ orderNo: string; session: string }> {
  return apiRequest(`${acc(accountId)}/orders`, {
    method: "POST",
    body: JSON.stringify({ ...order, ...(order.orderType === "MARKET" ? { price: undefined } : {}), confirm: true }),
  });
}

export function usTodayOrders(accountId: string): Promise<UsTodayOrder[]> {
  return apiRequest<UsTodayOrder[]>(`${acc(accountId)}/orders`);
}

export function cancelUsOrder(accountId: string, orderNo: string, input: { symbol: string; exchange: UsExchange }): Promise<{ orderNo: string }> {
  return apiRequest(`${acc(accountId)}/orders/${encodeURIComponent(orderNo)}/cancel`, { method: "POST", body: JSON.stringify({ ...input, confirm: true }) });
}

export function modifyUsOrder(accountId: string, orderNo: string, input: { symbol: string; exchange: UsExchange; price: number }): Promise<{ orderNo: string }> {
  return apiRequest(`${acc(accountId)}/orders/${encodeURIComponent(orderNo)}/modify`, { method: "POST", body: JSON.stringify({ ...input, confirm: true }) });
}
