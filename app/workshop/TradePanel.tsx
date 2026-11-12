"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { openBookStream, type OrderBook } from "../../lib/market-data";
import { BUYING_POWER, makeOrderBook } from "../../lib/mock/workshop";

const won = (value: number) => value.toLocaleString("ko-KR");

export type MockOrder = { side: "매수" | "매도"; price: number; quantity: number };

type Props = {
  /** 종목코드 (실제 호가 조회) */
  code: string;
  /** 현재가 */
  price: number;
  /** 전일 종가 (등락률 계산용) */
  prevClose: number;
  onOrder: (order: MockOrder) => void;
  onClose: () => void;
  /** 호가창을 그릴 자리 (페이지 아래쪽). 주문창과 상태를 같이 쓰려고 portal로 넣는다 */
  bookTarget: HTMLElement | null;
};

/**
 * 매매하기 화면: 오른쪽에 매매 창, 호가창은 아래쪽(bookTarget)에.
 * 아직 증권사 주문 API가 없으므로 모의 주문만 받는다.
 */
export default function TradePanel({ code, price, prevClose, onOrder, onClose, bookTarget }: Props) {
  // 실제 호가: 키움 실시간(0D)을 백엔드가 SSE로 넘겨준다. 못 받으면 예시 호가로 대신하고 표시한다
  const [live, setLive] = useState<OrderBook | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);
  useEffect(
    () =>
      openBookStream(code, {
        onBook: (book) => {
          setLive(book);
          setLiveFailed(false);
        },
        // EventSource는 스스로 다시 붙는다. 끊긴 동안만 예시 호가로 표시
        onError: () => setLiveFailed(true),
      }),
    [code],
  );
  const mock = useMemo(() => makeOrderBook(price), [price]);
  const book = live && live.asks.length + live.bids.length > 0 && !liveFailed ? live : mock;
  const isLive = book === live;
  // 호가 단위(KRX 가격대별 규칙)는 예시 호가 계산과 같다
  const maxQuantity = Math.max(...book.asks.map((l) => l.quantity), ...book.bids.map((l) => l.quantity));

  const [side, setSide] = useState<"매수" | "매도">("매수");
  const [orderType, setOrderType] = useState<"지정가" | "시장가">("지정가");
  const [orderPrice, setOrderPrice] = useState(price);
  const [quantity, setQuantity] = useState(1);
  const [done, setDone] = useState<string | null>(null);

  const effectivePrice = orderType === "시장가" ? price : orderPrice;
  const total = effectivePrice * quantity;
  const overBudget = side === "매수" && total > BUYING_POWER;

  function fillRatio(ratio: number) {
    setQuantity(Math.max(1, Math.floor((BUYING_POWER * ratio) / effectivePrice)));
  }

  function submit() {
    if (quantity < 1 || overBudget) return;
    onOrder({ side, price: effectivePrice, quantity });
    setDone(`${side} ${won(quantity)}주 · ${won(effectivePrice)}원 모의 주문이 접수됐어요.`);
  }

  const rate = (p: number) => ((p - prevClose) / prevClose) * 100;

  const bookSection = (
      <section className="ws-panel ws-book" aria-label="호가창">
        <div className="ws-book-title">
          <h2>호가</h2>
          <small className={isLive ? "live" : "mock"}>{isLive ? `실시간 · ${live?.time ?? ""}` : "예시 호가 · 연결 안 됨"}</small>
        </div>
        <div className="ws-book-head">
          <span>잔량</span>
          <span>호가</span>
          <span>등락률</span>
        </div>
        <ol className="ws-book-list">
          {[...book.asks.map((l) => ({ ...l, kind: "ask" })), ...book.bids.map((l) => ({ ...l, kind: "bid" }))].map((level) => (
            <li key={`${level.kind}-${level.price}`} className={`${level.kind}${level.price === price ? " current" : ""}`}>
              <button
                onClick={() => {
                  setOrderType("지정가");
                  setOrderPrice(level.price);
                  setDone(null);
                }}
                title="이 가격으로 주문 가격 입력"
              >
                <span className="qty">
                  <i style={{ width: `${(level.quantity / maxQuantity) * 100}%` }} />
                  <em>{won(level.quantity)}</em>
                </span>
                <span className={`price ${level.price >= prevClose ? "up" : "down"}`}>{won(level.price)}</span>
                <span className={`rate ${level.price >= prevClose ? "up" : "down"}`}>
                  {rate(level.price) >= 0 ? "+" : ""}
                  {rate(level.price).toFixed(2)}%
                </span>
              </button>
            </li>
          ))}
        </ol>
        {isLive && live && (
          <div className="ws-book-total">
            <span>
              매도 잔량 <b className="down">{won(live.totalAsk)}</b>
            </span>
            <span>
              매수 잔량 <b className="up">{won(live.totalBid)}</b>
            </span>
          </div>
        )}
        <small className="ws-muted">호가를 누르면 주문 가격에 들어가요.</small>
      </section>
  );

  return (
    <>
      {bookTarget && createPortal(bookSection, bookTarget)}
      <section className="ws-panel ws-order" aria-label="매매 창">
        <div className="ws-order-title">
          <h2>매매</h2>
          <button onClick={onClose} aria-label="매매 창 닫기" title="닫고 노트 화면으로">
            ✕
          </button>
        </div>

        <div className="ws-seg ws-side-tabs" role="tablist">
          {(["매수", "매도"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={side === s} className={side === s ? `active ${s === "매수" ? "buy" : "sell"}` : ""} onClick={() => { setSide(s); setDone(null); }}>
              {s}
            </button>
          ))}
        </div>

        <div className="ws-seg ws-type-tabs">
          {(["지정가", "시장가"] as const).map((t) => (
            <button key={t} className={orderType === t ? "active" : ""} onClick={() => setOrderType(t)}>
              {t}
            </button>
          ))}
        </div>

        <label className="ws-field">
          <span>가격</span>
          <div className="ws-stepper">
            <button disabled={orderType === "시장가"} onClick={() => setOrderPrice((p) => Math.max(mock.step, p - mock.step))} aria-label="한 호가 내리기">
              −
            </button>
            <input
              inputMode="numeric"
              disabled={orderType === "시장가"}
              value={orderType === "시장가" ? "시장가" : won(orderPrice)}
              onChange={(e) => setOrderPrice(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
            />
            <button disabled={orderType === "시장가"} onClick={() => setOrderPrice((p) => p + mock.step)} aria-label="한 호가 올리기">
              +
            </button>
          </div>
        </label>

        <label className="ws-field">
          <span>수량</span>
          <div className="ws-stepper">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="1주 빼기">
              −
            </button>
            <input inputMode="numeric" value={won(quantity)} onChange={(e) => setQuantity(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
            <button onClick={() => setQuantity((q) => q + 1)} aria-label="1주 더하기">
              +
            </button>
          </div>
        </label>

        {side === "매수" && (
          <div className="ws-ratio">
            {[0.1, 0.25, 0.5, 1].map((r) => (
              <button key={r} onClick={() => fillRatio(r)}>
                {r === 1 ? "최대" : `${r * 100}%`}
              </button>
            ))}
          </div>
        )}

        <dl className="ws-order-sum">
          <dt>주문 가능</dt>
          <dd>{won(BUYING_POWER)}원</dd>
          <dt>주문 금액</dt>
          <dd className={overBudget ? "down" : ""}>{won(total)}원</dd>
        </dl>

        <button className={`ws-order-submit ${side === "매수" ? "buy" : "sell"}`} disabled={quantity < 1 || overBudget || effectivePrice <= 0} onClick={submit}>
          {side} 주문
        </button>
        {done ? <p className="ws-order-done">{done}</p> : <small className="ws-muted">모의 주문이에요. 체결되면 노트와 연결할 수 있어요.</small>}
      </section>
    </>
  );
}
