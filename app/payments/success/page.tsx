"use client";
// 토스 결제창에서 성공하면 돌아오는 곳: 서버에 승인 요청 → 승인되면 "결제 완료" + 열람권 1장 (예시 트레이더) / 전략 구매 (실제 판매 등록)
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SiteHeader from "../../SiteHeader";
import { confirmCheckout, type Confirmed } from "../../../lib/api/payments";
import { errorMessage } from "../../../lib/api/client";
import { refreshPasses } from "../../../lib/purchases";
import { traderById } from "../../marketplace/data";
import { GradeBadge } from "../../marketplace/GradeParts";
import "../payments.css";
import BeeLoader from "../../BeeLoader";

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

export default function PaymentSuccess() {
  const [state, setState] = useState<{ phase: "loading" } | { phase: "done"; result: Confirmed; back: string } | { phase: "error"; message: string }>({ phase: "loading" });
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // 개발 모드에서 두 번 불려도 승인은 한 번
    once.current = true;
    const q = new URLSearchParams(location.search);
    const paymentKey = q.get("paymentKey");
    const orderId = q.get("orderId");
    const amount = Number(q.get("amount"));
    if (!paymentKey || !orderId || !amount) return setState({ phase: "error", message: "결제 정보가 없어요." });
    confirmCheckout(paymentKey, orderId, amount)
      .then(({ result, back }) => {
        if (result.item.type === "sample") {
          void refreshPasses(); // 열람권은 서버가 승인할 때 계정에 넣음
        }
        setState({ phase: "done", result, back });
      })
      .catch((e) => setState({ phase: "error", message: errorMessage(e) }));
  }, []);

  return (
    <main className="pay-page">
      <SiteHeader active="marketplace" />
      <section className="pay-card">
        {state.phase === "loading" && (
          <>
            <BeeLoader size="sm" />
            <h1>결제를 확인하는 중이에요</h1>
            <p>창을 닫지 말고 잠시 기다려 주세요.</p>
          </>
        )}
        {state.phase === "done" && (
          <>
            <span className="pay-icon ok" aria-hidden>
              ✓
            </span>
            <h1>결제 완료</h1>
            {state.result.item.type === "sample" ? (
              <p>
                <b>{state.result.item.traderName}</b> <GradeBadge grade={traderById(state.result.item.traderId ?? "")?.grade?.grade} unrated={traderById(state.result.item.traderId ?? "")?.grade?.unrated} small /> 전략 열람권 {state.result.item.quantity ?? 1}장을 샀어요.
                <br />
                1장으로 월별 전략 하나를 골라 열 수 있어요. 남은 열람권은 나중에 써도 돼요.
              </p>
            ) : (
              <p>
                <b>{state.result.orderName}</b> 전략을 구매했어요.
              </p>
            )}
            <dl className="pay-detail">
              <dt>결제 금액</dt>
              <dd>{won(state.result.payment.amount)}</dd>
              <dt>결제 수단</dt>
              <dd>
                {state.result.payment.method ?? "-"}
                {state.result.payment.card ? ` · ${state.result.payment.card}` : ""}
              </dd>
              <dt>주문 번호</dt>
              <dd className="mono">{state.result.payment.orderId}</dd>
              {state.result.payment.approvedAt && (
                <>
                  <dt>승인 시각</dt>
                  <dd>{new Date(state.result.payment.approvedAt).toLocaleString("ko-KR")}</dd>
                </>
              )}
            </dl>
            <div className="pay-actions">
              {state.result.payment.receiptUrl && (
                <a className="pay-ghost" href={state.result.payment.receiptUrl} target="_blank" rel="noreferrer">
                  영수증
                </a>
              )}
              <Link className="pay-primary" href={state.result.item.type === "sample" ? `/marketplace/${state.result.item.traderId}/strategies` : state.back || "/marketplace"}>
                {state.result.item.type === "sample" ? "열어 볼 전략 고르기" : "전략으로 돌아가기"}
              </Link>
            </div>
          </>
        )}
        {state.phase === "error" && (
          <>
            <span className="pay-icon err" aria-hidden>
              !
            </span>
            <h1>결제를 완료하지 못했어요</h1>
            <p>{state.message}</p>
            <div className="pay-actions">
              <Link className="pay-primary" href="/marketplace">
                전략 마켓으로
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
