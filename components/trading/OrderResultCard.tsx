import type { OrderResult } from "../../lib/types/trading";

const STATUS: Record<OrderResult["status"], string> = {
  SUBMITTED: "주문 접수",
  PARTIALLY_FILLED: "일부 체결",
  FILLED: "체결 완료",
  CANCELED: "주문 취소",
  FAILED: "주문 실패",
};

/** 주문 결과. 실패해도 자동으로 다시 주문하지 않고, 사용자가 처음(분석)부터 다시 확인하게 한다 */
export default function OrderResultCard({ order, onRestart }: { order: OrderResult; onRestart?: () => void }) {
  const failed = order.status === "FAILED" || order.status === "CANCELED";
  const time = new Date(order.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <section className={`ai-order ${order.status.toLowerCase()}`} aria-live="polite">
      <header>
        <strong>{STATUS[order.status]}</strong>
        <span>{time}</span>
      </header>
      <dl className="ai-grid">
        <dt>종목</dt>
        <dd>{order.symbol}</dd>
        <dt>방향</dt>
        <dd className={order.side === "BUY" ? "up" : "down"}>{order.side === "BUY" ? "매수" : "매도"}</dd>
        <dt>체결 / 주문</dt>
        <dd>
          {Number(order.filledQuantity ?? 0).toLocaleString("ko-KR")} / {Number(order.quantity).toLocaleString("ko-KR")}주
        </dd>
        <dt>가격</dt>
        <dd>{order.price ? `${Number(order.price).toLocaleString("ko-KR")}원` : "시장가"}</dd>
        <dt>주문번호</dt>
        <dd className="mono">{order.orderId}</dd>
      </dl>
      {order.message && <p className={failed ? "ai-note error" : "ai-note"}>{order.message}</p>}
      {failed && onRestart && (
        <button className="ai-btn ghost" onClick={onRestart}>
          처음부터 다시 분석
        </button>
      )}
    </section>
  );
}
