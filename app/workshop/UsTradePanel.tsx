"use client";
// 미국 주식 매매 창 (키움 실계좌 · 모의 계좌)
//   키움 미국주식 주문에는 장 구분 값이 없어서 "넣은 시각에 열린 시장"으로 들어간다 → 지금 시간대를 크게 보여 준다
//   주간거래 · 프리마켓 · 애프터마켓은 지정가만, 정규장은 지정가 · 시장가 (lib/us-session.ts)
//   주문은 확인 화면에서 "주문 확정"을 누른 뒤 한 번만 보낸다. 실패해도 다시 보내지 않는다
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../lib/api/client";
import {
  cancelUsOrder,
  orderAccounts,
  sendUsOrder,
  usBuyingPower,
  usTodayOrders,
  type OrderAccount,
  type UsBuyingPower,
  type UsExchange,
  type UsOrderRequest,
  type UsTodayOrder,
} from "../../lib/api/orders";
import { US_SESSION_LABEL, usDst, usHoursKst, usOrderTypes, useUsSession } from "../../lib/us-session";

const EX_NAME: Record<UsExchange, string> = { ND: "나스닥", NY: "뉴욕", NA: "아멕스" };
/** $1 이상은 센트(0.01), 그 아래는 0.0001 단위 */
const tick = (p: number) => (p >= 1 ? 0.01 : 0.0001);
const roundTo = (p: number, step: number) => Math.round(p / step) * step;
const usd = (n: number, d?: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d ?? (n >= 1 || n === 0 ? 2 : 4), maximumFractionDigits: d ?? (n >= 1 || n === 0 ? 2 : 4) })}`;
const int = (n: number) => n.toLocaleString("ko-KR");

type Props = { code: string; symbolName: string; exchange: UsExchange; price: number; prevClose: number; onClose: () => void };

export default function UsTradePanel({ code, symbolName, exchange, price, prevClose, onClose }: Props) {
  const session = useUsSession();
  const allowed = usOrderTypes(session);
  const [accounts, setAccounts] = useState<OrderAccount[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [priceText, setPriceText] = useState(() => price.toFixed(price >= 1 ? 2 : 4));
  const [qty, setQty] = useState(1);
  const [power, setPower] = useState<UsBuyingPower | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);
  const [review, setReview] = useState<(UsOrderRequest & { amount: number }) | null>(null);
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [orders, setOrders] = useState<UsTodayOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [tick_, setTick] = useState(0);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const account = accounts?.find((a) => a.id === accountId) ?? null;
  // 정규장이 아니면 시장가를 못 쓰니 지정가로
  const type = allowed.includes(orderType) ? orderType : "LIMIT";
  const limitPrice = Number(priceText) || 0;
  const effectivePrice = type === "MARKET" ? price : limitPrice;
  const priceStep = tick(limitPrice || price);
  const priceOk = type === "MARKET" || (limitPrice > 0 && Math.abs(roundTo(limitPrice, 0.0001) - limitPrice) < 1e-9);
  const amount = Math.round(effectivePrice * qty * 100) / 100;
  const maxQty = power ? (side === "BUY" ? power.buyQty : power.sellQty) : 0;
  const over = !!power && qty > maxQty;
  // 키움 모의투자는 미국 주식을 지원하지 않는다 (RC9000 "모의투자에서는 해당업무가 제공되지 않습니다")
  const mockOnly = account?.mode === "mock";

  useEffect(() => {
    orderAccounts()
      .then((list) => {
        setAccounts(list);
        // 미국 주식은 실전 계좌가 기본 (모의투자 서버는 미국 주문을 받지 않을 수 있음)
        setAccountId((list.find((a) => a.mode === "real") ?? list[0])?.id ?? "");
      })
      .catch(() => setAccounts([]));
  }, []);

  // 살 수 있는 수량 · 팔 수 있는 수량 (가격이 바뀌면 0.4초 뒤 다시)
  useEffect(() => {
    if (!accountId || effectivePrice <= 0 || mockOnly) return;
    let alive = true;
    const timer = setTimeout(() => {
      usBuyingPower(accountId, { symbol: code, exchange, price: Math.round(effectivePrice * 10_000) / 10_000 })
        .then((p) => {
          if (!alive) return;
          setPower(p);
          setPowerError(null);
        })
        .catch((e) => alive && (setPower(null), setPowerError(errorMessage(e))));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [accountId, code, exchange, effectivePrice, tick_, mockOnly]);

  // 오늘 미국 주문
  useEffect(() => {
    if (!accountId || mockOnly) return;
    let alive = true;
    usTodayOrders(accountId)
      .then((list) => alive && (setOrders(list), setOrdersError(null)))
      .catch((e) => alive && (setOrders(null), setOrdersError(errorMessage(e))));
    return () => {
      alive = false;
    };
  }, [accountId, tick_, mockOnly]);

  const mine = useMemo(() => (orders ?? []).filter((o) => o.symbol === code), [orders, code]);

  function submit() {
    if (!account) return;
    setOrderError(null);
    setDone(null);
    setReview({ side, symbol: code, exchange, quantity: qty, orderType: type, price: type === "LIMIT" ? limitPrice : undefined, amount });
  }

  async function confirm() {
    if (!review || !account || sending) return;
    setSending(true);
    setOrderError(null);
    const { amount: _a, ...order } = review;
    void _a;
    try {
      const res = await sendUsOrder(account.id, order);
      setReview(null);
      setDone(`${US_SESSION_LABEL[res.session as keyof typeof US_SESSION_LABEL] ?? ""} 주문을 넣었어요 · 주문번호 ${res.orderNo.replace(/^0+(?=\d)/, "")}`);
      setTick((t) => t + 1);
    } catch (e) {
      setOrderError(errorMessage(e)); // 다시 보내지 않는다
    } finally {
      setSending(false);
    }
  }

  async function cancel(o: UsTodayOrder) {
    if (!account || cancelBusy) return;
    setCancelBusy(true);
    try {
      await cancelUsOrder(account.id, o.orderNo, { symbol: o.symbol, exchange: o.exchange ?? exchange });
      setCanceling(null);
      setTick((t) => t + 1);
    } catch (e) {
      setOrdersError(errorMessage(e));
    } finally {
      setCancelBusy(false);
    }
  }

  const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  const hours = usHoursKst();

  return (
    <section className="ws-panel ws-order ws-us-order" aria-label="미국 주식 매매 창">
      <div className="ws-order-title">
        <h2>매매</h2>
        <div className="ws-order-account">
          {accounts === null ? (
            <small>계좌 확인 중…</small>
          ) : accounts.length ? (
            <>
              <select value={accountId} onChange={(e) => (setAccountId(e.target.value), setPower(null), setOrders(null))} aria-label="주문 계좌">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <button type="button" className="ws-order-refresh" onClick={() => setTick((t) => t + 1)} aria-label="주문 가능 · 주문 내역 다시 받기" title="다시 받기">
                ↻
              </button>
            </>
          ) : null}
        </div>
        <button onClick={onClose} aria-label="매매 창 닫기" title="닫고 노트 화면으로">
          ✕
        </button>
      </div>

      {/* 지금 시간대: 이 시간에 넣으면 이 시장으로 들어간다 */}
      <div className={`ws-us-session ${session}`}>
        <div>
          <span className="ws-us-dot" aria-hidden />
          <strong>{US_SESSION_LABEL[session]}</strong>
          <small>{session === "closed" ? "지금은 주문할 수 없어요" : session === "regular" ? "지정가 · 시장가" : "지정가만"}</small>
        </div>
        <ul aria-label={`한국 시각 (${usDst() ? "서머타임" : "서머타임 아님"})`}>
          {hours.map((h) => (
            <li key={h.s} className={h.s === session ? "on" : ""}>
              <span>{US_SESSION_LABEL[h.s]}</span>
              <b>{h.kst}</b>
            </li>
          ))}
        </ul>
      </div>

      <div className="ws-us-quote">
        <strong>
          {symbolName} <small>{code} · {EX_NAME[exchange]}</small>
        </strong>
        <span>
          {usd(price)} <em className={change > 0 ? "up" : change < 0 ? "down" : ""}>{`${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(2)}%`}</em>
        </span>
      </div>

      {mockOnly && (
        <p className="ws-us-empty">
          키움 <b>모의투자</b>는 미국 주식 주문을 지원하지 않아요. <Link href="/mypage">마이페이지</Link>에서 <b>실전 계좌</b>를 연결하면 주간거래 · 프리 · 정규 · 애프터마켓 주문을 낼 수 있어요.
        </p>
      )}
      {accounts !== null && !accounts.length ? (
        <p className="ws-us-empty">
          미국 주식은 증권사 계좌로만 주문할 수 있어요. <Link href="/mypage">마이페이지</Link>에서 키움 계좌를 연결해 주세요.
        </p>
      ) : (
        <>
          <div className="ws-seg ws-side-tabs" role="tablist">
            {(["BUY", "SELL"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={side === s} className={side === s ? `active ${s === "BUY" ? "buy" : "sell"}` : ""} onClick={() => (setSide(s), setDone(null), setReview(null))}>
                {s === "BUY" ? "매수" : "매도"}
              </button>
            ))}
          </div>

          <div className="ws-seg ws-type-tabs">
            {(["LIMIT", "MARKET"] as const).map((t) => (
              <button
                key={t}
                className={type === t ? "active" : ""}
                disabled={!allowed.includes(t)}
                title={t === "MARKET" && !allowed.includes(t) ? "시장가는 정규장에만 쓸 수 있어요" : undefined}
                onClick={() => setOrderType(t)}
              >
                {t === "LIMIT" ? "지정가" : "시장가"}
              </button>
            ))}
          </div>

          <label className="ws-field">
            <span>가격 (USD)</span>
            <div className="ws-stepper">
              <button disabled={type === "MARKET"} onClick={() => setPriceText((p) => Math.max(priceStep, roundTo((Number(p) || price) - priceStep, priceStep)).toFixed(priceStep < 0.01 ? 4 : 2))} aria-label="한 틱 내리기">
                −
              </button>
              <input
                inputMode="decimal"
                disabled={type === "MARKET"}
                value={type === "MARKET" ? "시장가" : priceText}
                onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
                aria-label="주문 가격 (달러)"
              />
              <button disabled={type === "MARKET"} onClick={() => setPriceText((p) => roundTo((Number(p) || price) + priceStep, priceStep).toFixed(priceStep < 0.01 ? 4 : 2))} aria-label="한 틱 올리기">
                +
              </button>
            </div>
          </label>

          <label className="ws-field">
            <span>수량</span>
            <div className="ws-stepper">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="1주 빼기">
                −
              </button>
              <input inputMode="numeric" value={int(qty)} onChange={(e) => setQty(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} aria-label="주문 수량" />
              <button onClick={() => setQty((q) => q + 1)} aria-label="1주 더하기">
                +
              </button>
            </div>
          </label>

          <dl className="ws-order-sum">
            <dt>{side === "BUY" ? "매수 가능" : "매도 가능"}</dt>
            <dd>
              {power ? `${int(maxQty)}주` : "—"}
              {power && side === "BUY" && <small> · {power.krwOrder ? `원화 ${int(Math.round(power.cashKrw))}원` : usd(power.cashUsd)}</small>}
              {power && side === "SELL" && <small> · 보유 {int(power.holdingQty)}주</small>}
            </dd>
            <dt>주문 금액</dt>
            <dd>{type === "MARKET" ? `약 ${usd(amount)}` : usd(amount)}</dd>
          </dl>
          {powerError && <small className="ws-order-warn">주문 가능 수량을 못 받았어요: {powerError}</small>}
          {!priceOk && <small className="ws-order-warn">가격은 소수 넷째 자리까지 넣어 주세요</small>}
          {over && <small className="ws-order-warn">{side === "BUY" ? "주문 가능 수량을 넘었어요" : "팔 수 있는 수량보다 많아요"}</small>}

          {review ? (
            <div className="ws-order-review" role="dialog" aria-label="주문 확인">
              <strong>이 주문을 보낼까요?</strong>
              <dl>
                <dt>계좌</dt>
                <dd>{account?.label}</dd>
                <dt>종목</dt>
                <dd>
                  {symbolName} {review.symbol} · {EX_NAME[review.exchange]}
                </dd>
                <dt>시간대</dt>
                <dd>{US_SESSION_LABEL[session]}로 들어가요</dd>
                <dt>주문</dt>
                <dd className={review.side === "BUY" ? "up" : "down"}>
                  {review.side === "BUY" ? "매수" : "매도"} {int(review.quantity)}주 · {review.orderType === "MARKET" ? "시장가" : `지정가 ${usd(review.price ?? 0)}`}
                </dd>
                <dt>{review.side === "BUY" ? "예상 결제" : "예상 수령"}</dt>
                <dd>{usd(review.amount)} (수수료 · 세금 별도)</dd>
              </dl>
              {account?.mode === "real" && <p className="ws-order-warn">실전 계좌예요. 확정하면 실제 돈으로 주문이 나가요.</p>}
              {orderError && <p className="ws-order-error">{orderError}</p>}
              <div>
                <button onClick={() => setReview(null)} disabled={sending}>
                  취소
                </button>
                <button className={`primary ${review.side === "BUY" ? "buy" : "sell"}`} onClick={() => void confirm()} disabled={sending || session === "closed"}>
                  {sending ? "보내는 중…" : "주문 확정"}
                </button>
              </div>
            </div>
          ) : (
            <button
              className={`ws-order-submit ${side === "BUY" ? "buy" : "sell"}`}
              disabled={!account || mockOnly || session === "closed" || qty < 1 || !priceOk || effectivePrice <= 0 || over}
              onClick={submit}
              title={session === "closed" ? "지금은 미국 주식 주문 시간이 아니에요" : undefined}
            >
              {side === "BUY" ? "매수" : "매도"} 주문
            </button>
          )}
          {done && <p className="ws-order-done">{done}</p>}

          {/* 오늘 이 종목 주문 (미체결은 취소) */}
          <div className="ws-us-orders">
            <h3>
              오늘 {code} 주문 <small>{orders ? `${mine.length}건` : ""}</small>
            </h3>
            {mockOnly ? (
              <small className="ws-muted">실전 계좌에서 볼 수 있어요</small>
            ) : ordersError ? (
              <small className="ws-order-warn">{ordersError}</small>
            ) : !orders ? (
              <small className="ws-muted">{accountId ? "불러오는 중…" : ""}</small>
            ) : !mine.length ? (
              <small className="ws-muted">오늘 이 종목 주문이 없어요</small>
            ) : (
              <ul>
                {mine.map((o) => (
                  <li key={o.orderNo}>
                    <span className={o.side === "BUY" ? "up" : "down"}>{o.side === "BUY" ? "매수" : "매도"}</span>
                    <span>
                      {int(o.quantity)}주 · {o.orderType || "—"} {o.price ? usd(o.price) : ""}
                    </span>
                    <small>
                      {o.time.slice(0, 5)} · {o.filled ? `체결 ${int(o.filled)}` : ""}
                      {o.remaining ? ` 잔량 ${int(o.remaining)}` : ""} {o.status}
                    </small>
                    {o.open &&
                      (canceling === o.orderNo ? (
                        <span className="ws-us-cancel">
                          <button onClick={() => setCanceling(null)} disabled={cancelBusy}>
                            아니요
                          </button>
                          <button className="danger" onClick={() => void cancel(o)} disabled={cancelBusy}>
                            {cancelBusy ? "취소 중…" : "주문 취소"}
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setCanceling(o.orderNo)}>취소</button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
