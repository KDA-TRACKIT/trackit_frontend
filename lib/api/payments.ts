"use client";
// 토스페이먼츠 결제 (결제창 SDK v2). 서버가 금액을 정하고(checkout), 성공하면 서버가 승인(confirm)
//   테스트 키(test_ck_…)면 실제 돈이 나가지 않음
import { accessToken, apiRequest } from "./client";

export type PayItem =
  | { type: "strategy"; strategyId: string; kind: "MONTH" | "ALL"; month?: string }
  | { type: "sample"; traderId: string; traderName: string; price: number; quantity: number }; // 예시 트레이더 열람권 quantity장 (1장 가격 price)

type Checkout = { clientKey: string; testMode: boolean; customerKey: string; orderId: string; orderName: string; amount: number; token: string };
export type Confirmed = {
  item: { type: "strategy"; strategyId: string; kind: string; month?: string } | { type: "sample"; traderId: string; traderName: string; quantity?: number };
  orderName: string;
  purchase: unknown;
  payment: { orderId: string; paymentKey: string; method: string | null; amount: number; approvedAt: string | null; receiptUrl: string | null; card: string | null };
};

const SDK = "https://js.tosspayments.com/v2/standard";
const PENDING = (orderId: string) => `toss:order:${orderId}`;

type TossSdk = (clientKey: string) => {
  payment: (o: { customerKey: string }) => {
    requestPayment: (o: Record<string, unknown>) => Promise<void>;
  };
};

function loadSdk(): Promise<TossSdk> {
  const w = window as unknown as { TossPayments?: TossSdk };
  if (w.TossPayments) return Promise.resolve(w.TossPayments);
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SDK;
    el.async = true;
    el.onload = () => (w.TossPayments ? resolve(w.TossPayments) : reject(new Error("결제창을 불러오지 못했어요.")));
    el.onerror = () => reject(new Error("결제창을 불러오지 못했어요. 인터넷 연결을 확인해 주세요."));
    document.head.appendChild(el);
  });
}

/**
 * 구매하기: 로그인 확인 → 서버에 주문 만들기 → 토스 결제창. 성공하면 /payments/success 로 돌아옴
 * 결제창을 닫으면 { canceled: true }
 */
export async function startCheckout(item: PayItem): Promise<{ canceled?: boolean; needLogin?: boolean }> {
  if (!(await accessToken())) return { needLogin: true };
  const order = await apiRequest<Checkout>("/payments/toss/checkout", { method: "POST", body: JSON.stringify({ item }) });
  // 돌아왔을 때 서버 승인에 쓸 서명된 주문 + 어디로 돌아갈지
  sessionStorage.setItem(PENDING(order.orderId), JSON.stringify({ token: order.token, back: location.pathname + location.search }));
  const TossPayments = await loadSdk();
  const payment = TossPayments(order.clientKey).payment({ customerKey: order.customerKey });
  try {
    await payment.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: order.amount },
      orderId: order.orderId,
      orderName: order.orderName,
      successUrl: `${location.origin}/payments/success`,
      failUrl: `${location.origin}/payments/fail`,
      card: { useEscrow: false, flowMode: "DEFAULT", useCardPoint: false, useAppCardOnly: false },
    });
    return {};
  } catch (error) {
    sessionStorage.removeItem(PENDING(order.orderId));
    const code = (error as { code?: string })?.code;
    if (code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED") return { canceled: true };
    throw error;
  }
}

/** /payments/success 에서: 서버 승인 요청 (같은 주문을 두 번 보내도 서버가 한 번만 처리) */
export async function confirmCheckout(paymentKey: string, orderId: string, amount: number): Promise<{ result: Confirmed; back: string }> {
  const raw = sessionStorage.getItem(PENDING(orderId));
  if (!raw) throw new Error("이 브라우저에서 시작한 주문을 찾지 못했어요. 결제는 승인되지 않았어요.");
  const { token, back } = JSON.parse(raw) as { token: string; back: string };
  const result = await apiRequest<Confirmed>("/payments/toss/confirm", { method: "POST", body: JSON.stringify({ paymentKey, orderId, amount, token }) });
  sessionStorage.removeItem(PENDING(orderId));
  return { result, back };
}

/** 결제 실패 · 취소로 돌아왔을 때 돌아갈 곳 */
export function pendingBack(orderId: string | null): string | null {
  if (!orderId) return null;
  const raw = sessionStorage.getItem(PENDING(orderId));
  sessionStorage.removeItem(PENDING(orderId));
  try {
    return raw ? (JSON.parse(raw) as { back: string }).back : null;
  } catch {
    return null;
  }
}
