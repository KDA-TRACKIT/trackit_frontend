"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchCosts,
  openBookStream,
  type OrderBook,
} from "../../lib/market-data";
import {
  maxBuyQuantity,
  orderCosts,
  pctText,
  type CostRates,
} from "../../lib/trade-costs";
import {
  PHASE_LABEL,
  isRegularPhase,
  useMarketPhase,
} from "../../lib/market-session";
import { BUYING_POWER, makeOrderBook } from "../../lib/mock/workshop";
import AlgoPanel from "./AlgoPanel";
import {
  freshPortfolio,
  orderAccounts,
  sendOrder,
  type OrderAccount,
  type OrderRequest,
} from "../../lib/api/orders";
import { errorMessage } from "../../lib/api/client";

const won = (value: number) => value.toLocaleString("ko-KR");

export type MockOrder = {
  side: "매수" | "매도";
  price: number;
  quantity: number;
};

type Props = {
  /** 종목코드 (실제 호가 조회) */
  code: string;
  symbolName: string;
  /** 현재가 */
  price: number;
  /** 전일 종가 (등락률 계산용) */
  prevClose: number;
  onOrder: (order: MockOrder) => void;
  /** 보유 수량 (매도 가능 수량). 모르면 0 */
  holding?: number;
  onClose: () => void;
};

/**
 * 매매하기 화면: 매매 창 위쪽에 3열 호가(매도잔량 | 가격 | 매수잔량), 아래에 주문 입력.
 * 호가를 누르면 바로 아래 주문 가격에 들어간다.
 * 로그인하고 증권사 계좌를 연결했으면 그 계좌로 실제 주문(백엔드 경유, 확인 화면에서 확정 뒤 한 번만),
 * 아니면 연습 주문(이 화면에만 기록)으로 받는다.
 */
export default function TradePanel({
  code,
  symbolName,
  price,
  prevClose,
  onOrder,
  onClose,
  holding = 0,
}: Props) {
  /** 직접 주문 / 알고리즘 규칙 */
  const [tab, setTab] = useState<"order" | "algo">("order");
  // 실제 호가: 키움 실시간(0D)을 백엔드가 SSE로 넘겨준다. 못 받으면 예시 호가로 대신하고 표시한다
  const [live, setLive] = useState<OrderBook | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);
  /** 마지막으로 받은 비어 있지 않은 호가 (장이 끝나 키움이 빈 호가를 주면 이걸 보여 준다) */
  const [lastGood, setLastGood] = useState<OrderBook | null>(null);
  useEffect(
    () =>
      openBookStream(code, {
        onBook: (book) => {
          setLive(book);
          setLiveFailed(false);
          if (book.asks.length + book.bids.length > 0) setLastGood(book);
        },
        // EventSource는 스스로 다시 붙는다. 끊긴 동안만 예시 호가로 표시
        onError: () => setLiveFailed(true),
      }),
    [code],
  );
  const mock = useMemo(() => makeOrderBook(price), [price]);
  // 연결은 됐는데 호가가 비었으면(장 마감 뒤) 예시 수량 대신 가격 칸만 두고 잔량 0
  const emptyBook = useMemo(() => ({ ...mock, asks: mock.asks.map((l) => ({ ...l, quantity: 0 })), bids: mock.bids.map((l) => ({ ...l, quantity: 0 })) }), [mock]);
  const connected = live !== null && !liveFailed;
  const liveHasBook = connected && live.asks.length + live.bids.length > 0;
  /** 화면 호가: 실시간 → (연결됐지만 빈 호가) 마지막 호가 또는 빈 칸 → (끊김) 예시 */
  const shownLive = liveHasBook ? live : connected ? lastGood : null;
  const book = shownLive ?? (connected ? emptyBook : mock);
  const isLive = shownLive !== null;
  /** 연결됐지만 보여 줄 호가가 없음 (장 마감 뒤 처음 연 경우) */
  const noBook = connected && !shownLive;
  const phase = useMarketPhase();
  // 호가 단위(KRX 가격대별 규칙)는 예시 호가 계산과 같다

  /** 보이는 단계: 기본 위아래 5단계, 펼치면 10단계 */
  const [depth, setDepth] = useState<5 | 10>(5);
  const asks = book.asks.slice(-depth); // 매도는 높은 가격 → 낮은 가격이라 현재가에 가까운 건 뒤쪽
  const bids = book.bids.slice(0, depth);
  const maxQuantity = Math.max(
    1,
    ...asks.map((l) => l.quantity),
    ...bids.map((l) => l.quantity),
  );
  const sum = (list: { quantity: number }[]) =>
    list.reduce((acc, l) => acc + l.quantity, 0);
  const totalAsk = shownLive ? shownLive.totalAsk : sum(book.asks);
  const totalBid = shownLive ? shownLive.totalBid : sum(book.bids);
  const bidShare =
    totalAsk + totalBid > 0 ? (totalBid / (totalAsk + totalBid)) * 100 : 50;

  const [side, setSide] = useState<"매수" | "매도">("매수");
  const [orderType, setOrderType] = useState<"지정가" | "시장가">("지정가");
  const [orderPrice, setOrderPrice] = useState(price);
  const [typedQty, setTypedQty] = useState(1);
  /** 슬라이더·비율 버튼으로 정한 비율. 있으면 수량은 (가능 수량 × 비율)로 따라간다. 직접 수량을 바꾸면 비움 */
  const [pct, setPct] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // 주문 계좌 (로그인 + 증권사 연결 시). 없으면 연습 주문
  const [accounts, setAccounts] = useState<OrderAccount[] | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  useEffect(() => {
    let alive = true;
    orderAccounts()
      .then((list) => {
        if (!alive) return;
        setAccounts(list);
        setAccountId(list[0]?.id ?? "");
      })
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);
  const account = accounts?.find((a) => a.id === accountId) ?? null;
  /** 수수료율은 계좌 종류(모의·실전)에 맞춘다. 계좌 없으면 연습 주문이라 모의 요율 */
  const accountMode = account?.mode ?? "mock";
  // 계좌의 예수금·보유 수량 (마지막 동기화 기준)
  //   Supabase 에 저장된 잔고 → 오래됐으면 백엔드가 증권사에서 새로 받아 저장. 주문이 접수되면 다시 받는다
  const [portfolio, setPortfolio] = useState<{
    id: string;
    cash: number | null;
    held: number;
    asOf: string | null;
    failed?: boolean;
  } | null>(null);
  const [portfolioTick, setPortfolioTick] = useState(0);
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    freshPortfolio(accountId, portfolioTick > 0)
      .then((pf) => {
        if (!alive) return;
        const held = Number(
          pf.positions.find((x) => x.symbol === code)?.quantity ?? 0,
        );
        setPortfolio({
          id: accountId,
          cash: pf.balance ? Number(pf.balance.cash) : null,
          held,
          asOf: pf.asOf,
        });
      })
      .catch(
        () =>
          alive &&
          setPortfolio({
            id: accountId,
            cash: null,
            held: 0,
            asOf: null,
            failed: true,
          }),
      );
    return () => {
      alive = false;
    };
  }, [accountId, code, portfolioTick]);
  const pf = account && portfolio?.id === account.id ? portfolio : null;
  const buyingPower = account ? (pf?.cash ?? 0) : BUYING_POWER;
  const heldQty = account ? (pf?.held ?? 0) : holding;

  /** 확인 화면에 띄운 주문 (확정하면 이 값 그대로 보낸다) */
  const [review, setReview] = useState<
    (OrderRequest & { accountLabel: string; amount: number }) | null
  >(null);
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // 거래비용 요율 (백엔드). 계좌가 실전이면 실전, 아니면 모의투자 수수료율. 못 받으면 비용 0 으로 보고 표시
  const [costs, setCosts] = useState<{
    code: string;
    rates: CostRates | null;
  } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetchCosts(code, ac.signal)
      .then((c) =>
        setCosts({
          code,
          rates: {
            fee: Number(
              accountMode === "real" ? c.feeRate.real : c.feeRate.mock,
            ),
            sellTax: Number(c.sellTaxRate),
          },
        }),
      )
      .catch(() => !ac.signal.aborted && setCosts({ code, rates: null }));
    return () => ac.abort();
  }, [code, accountMode]);
  const rates: CostRates = (costs?.code === code ? costs.rates : null) ?? {
    fee: 0,
    sellTax: 0,
  };
  const ratesKnown = costs?.code === code && costs.rates !== null;

  const effectivePrice = orderType === "시장가" ? price : orderPrice;
  /** 주문 가능 수량: 매수 = 수수료까지 낼 수 있는 수량, 매도 = 보유 수량 */
  const maxQty =
    side === "매수"
      ? maxBuyQuantity(buyingPower, effectivePrice, rates)
      : heldQty;
  const quantity = pct !== null ? Math.floor((maxQty * pct) / 100) : typedQty;
  const cost = orderCosts(side, effectivePrice, quantity, rates);
  const total = cost.amount;
  const overBudget = quantity > maxQty;
  // 슬라이더 손잡이는 고른 비율 그대로 둔다 (수량에서 거꾸로 계산하면 반올림 때문에 튀어서 끌기가 끊긴다)
  const percent =
    pct ?? (maxQty > 0 ? Math.min(100, (quantity / maxQty) * 100) : 0);

  /** 가능 수량의 몇 % 로 수량 정하기 (OKX 슬라이더처럼). 눈금 3% 안이면 눈금에 붙인다 */
  function setPercent(p: number) {
    const mark = [0, 25, 50, 75, 100].find((m) => Math.abs(m - p) <= 3);
    setPct(mark ?? p);
    setDone(null);
  }
  /** 수량을 직접 바꿈 (비율 모드 끝) */
  function setQuantity(next: number | ((q: number) => number)) {
    setPct(null);
    setTypedQty(typeof next === "function" ? next(quantity) : next);
  }

  function submit() {
    if (quantity < 1 || overBudget) return;
    setOrderError(null);
    if (account) {
      // 실제 주문은 확인 화면에서 한 번 더 확정
      setReview({
        side: side === "매수" ? "BUY" : "SELL",
        symbol: code,
        quantity,
        orderType: orderType === "시장가" ? "MARKET" : "LIMIT",
        ...(orderType === "지정가" ? { price: orderPrice } : {}),
        accountLabel: account.label,
        amount: cost.settle,
      });
      return;
    }
    onOrder({ side, price: effectivePrice, quantity });
    setDone(
      `${side} ${won(quantity)}주 · ${won(effectivePrice)}원 연습 주문을 기록했어요. (실제 주문 아님)`,
    );
  }

  /** 확인 화면의 "주문 확정": 보여 준 값 그대로 한 번만 보낸다. 실패하면 알리기만 하고 다시 보내지 않는다 */
  async function confirmOrder() {
    if (!review || !account || sending) return;
    setSending(true);
    setOrderError(null);
    const { accountLabel: _label, amount: _amount, ...order } = review;
    void _label;
    void _amount;
    try {
      const res = await sendOrder(account.id, order);
      onOrder({
        side: order.side === "BUY" ? "매수" : "매도",
        price: order.price ?? price,
        quantity: order.quantity,
      });
      setDone(
        `${order.side === "BUY" ? "매수" : "매도"} ${won(order.quantity)}주 주문이 접수됐어요 · 주문번호 ${res.orderNo}`,
      );
      setReview(null);
      // 접수 뒤 예수금·보유 수량을 증권사에서 다시 받는다 (조회만)
      setPortfolioTick((t) => t + 1);
    } catch (error) {
      setOrderError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const rate = (p: number) => ((p - prevClose) / prevClose) * 100;

  return (
    <>
      <section className="ws-panel ws-order" aria-label="매매 창">
        <div className="ws-order-title">
          <h2>매매</h2>
          {/* 주문 계좌: 제목 옆. 연결한 증권사 계좌가 있으면 실제 주문, 없으면 연습 주문 */}
          <div className="ws-order-account">
            {accounts === null ? (
              <small>계좌 확인 중…</small>
            ) : accounts.length ? (
              <>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="주문 계좌" title="주문 계좌">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ws-order-refresh"
                  onClick={() => setPortfolioTick((t) => t + 1)}
                  disabled={!pf}
                  aria-label="잔고 다시 받기"
                  title={
                    !pf
                      ? "잔고 불러오는 중…"
                      : pf.failed
                        ? "잔고를 못 받았어요 · 눌러서 다시 받기"
                        : pf.asOf
                          ? `잔고 ${new Date(pf.asOf).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준 · 눌러서 다시 받기`
                          : "저장된 잔고 없음 · 눌러서 받기"
                  }
                >
                  ↻
                </button>
              </>
            ) : (
              <small className="ws-order-practice" title="로그인하고 마이페이지에서 증권사 계좌를 연결하면 실제 주문을 낼 수 있어요">
                연습 주문
              </small>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="매매 창 닫기"
            title="닫고 노트 화면으로"
          >
            ✕
          </button>
        </div>

        <div className="ws-seg ws-trade-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "order"}
            className={tab === "order" ? "active" : ""}
            onClick={() => setTab("order")}
          >
            직접 주문
          </button>
          <button
            role="tab"
            aria-selected={tab === "algo"}
            className={tab === "algo" ? "active" : ""}
            onClick={() => setTab("algo")}
          >
            알고리즘
          </button>
        </div>

        {tab === "algo" ? (
          <AlgoPanel symbol={{ code, name: symbolName }} />
        ) : (
          <>
            <div className="ws-hoga" aria-label="호가">
              <div className="ws-hoga-head">
                <small
                  className={
                    noBook ? "closed" : !isLive ? "mock" : liveHasBook && (isRegularPhase(phase) || shownLive?.venue === "NXT") ? "live" : "closed"
                  }
                  title={
                    isLive && !isRegularPhase(phase) && shownLive?.venue !== "NXT"
                      ? "정규장이 아니라 호가가 바뀌지 않아요. 마지막 정규장 호가예요."
                      : undefined
                  }
                >
                  {noBook
                    ? `${PHASE_LABEL[phase]} · 지금은 호가 없음`
                    : !isLive
                      ? "예시 호가 · 연결 안 됨"
                      : liveHasBook && shownLive?.venue === "NXT"
                        ? `NXT ${PHASE_LABEL[phase]} · 실시간 호가 ${shownLive?.time ?? ""}`
                        : liveHasBook && isRegularPhase(phase)
                        ? `실시간 호가 · ${shownLive?.time ?? ""}`
                        : `${PHASE_LABEL[phase]} · 마지막 호가 ${shownLive?.time ?? ""}`}
                </small>
                <button
                  onClick={() => setDepth(depth === 5 ? 10 : 5)}
                  aria-expanded={depth === 10}
                >
                  {depth === 5 ? "10단계 ▾" : "5단계 ▴"}
                </button>
              </div>
              <div className="ws-hoga-ratio" title="총잔량 비율">
                <span className="down">
                  매도 {(100 - bidShare).toFixed(0)}%
                </span>
                <div>
                  <i style={{ width: `${100 - bidShare}%` }} />
                </div>
                <span className="up">매수 {bidShare.toFixed(0)}%</span>
              </div>
              <ol className="ws-hoga-list">
                {[
                  ...asks.map((l) => ({ ...l, kind: "ask" as const })),
                  ...bids.map((l) => ({ ...l, kind: "bid" as const })),
                ].map((level) => {
                  const r = rate(level.price);
                  const bar = (
                    <span className={`q ${level.kind}`}>
                      <i
                        style={{
                          width: `${(level.quantity / maxQuantity) * 100}%`,
                        }}
                      />
                      <em>{level.quantity > 0 ? won(level.quantity) : ""}</em>
                    </span>
                  );
                  return (
                    <li
                      key={`${level.kind}-${level.price}`}
                      className={`${level.kind}${level.price === price ? " current" : ""}${orderType === "지정가" && level.price === orderPrice ? " picked" : ""}`}
                    >
                      <button
                        onClick={() => {
                          setOrderType("지정가");
                          setOrderPrice(level.price);
                          setDone(null);
                        }}
                        title="이 가격을 주문 가격으로"
                      >
                        {level.kind === "ask" ? bar : <span className="q" />}
                        <span
                          className={`p ${r > 0 ? "up" : r < 0 ? "down" : ""}`}
                        >
                          <b>{won(level.price)}</b>
                          <small>
                            {r > 0 ? "+" : ""}
                            {r.toFixed(2)}%
                          </small>
                        </span>
                        {level.kind === "bid" ? bar : <span className="q" />}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="ws-hoga-total">
                <span>
                  <b className="down">{won(totalAsk)}</b> 매도 총잔량
                </span>
                <span>
                  매수 총잔량 <b className="up">{won(totalBid)}</b>
                </span>
              </div>
            </div>


            <div className="ws-seg ws-side-tabs" role="tablist">
              {(["매수", "매도"] as const).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={side === s}
                  className={
                    side === s ? `active ${s === "매수" ? "buy" : "sell"}` : ""
                  }
                  onClick={() => {
                    setSide(s);
                    setPct(null);
                    setDone(null);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="ws-seg ws-type-tabs">
              {(["지정가", "시장가"] as const).map((t) => (
                <button
                  key={t}
                  className={orderType === t ? "active" : ""}
                  onClick={() => setOrderType(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className="ws-field">
              <span>가격</span>
              <div className="ws-stepper">
                <button
                  disabled={orderType === "시장가"}
                  onClick={() =>
                    setOrderPrice((p) => Math.max(mock.step, p - mock.step))
                  }
                  aria-label="한 호가 내리기"
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  disabled={orderType === "시장가"}
                  value={orderType === "시장가" ? "시장가" : won(orderPrice)}
                  onChange={(e) =>
                    setOrderPrice(
                      Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                    )
                  }
                />
                <button
                  disabled={orderType === "시장가"}
                  onClick={() => setOrderPrice((p) => p + mock.step)}
                  aria-label="한 호가 올리기"
                >
                  +
                </button>
              </div>
            </label>

            <label className="ws-field">
              <span>수량</span>
              <div className="ws-stepper">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="1주 빼기"
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  value={won(quantity)}
                  onChange={(e) =>
                    setQuantity(
                      Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                    )
                  }
                />
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="1주 더하기"
                >
                  +
                </button>
              </div>
            </label>

            {/* 수량 비율: 가능 수량의 0~100% */}
            <div className="ws-pct">
              <div className="ws-pct-track">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  disabled={maxQty === 0}
                  aria-label="가능 수량 대비 비율"
                  style={{ ["--pct" as string]: `${percent}%` }}
                  className={side === "매수" ? "buy" : "sell"}
                />
              </div>
              <div className="ws-pct-marks">
                {[0, 25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    className={
                      Math.round(percent) >= p && maxQty > 0 ? "on" : ""
                    }
                    onClick={() => setPercent(p)}
                    disabled={maxQty === 0}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            <dl className="ws-order-sum">
              <dt>{side === "매수" ? "매수 가능" : "매도 가능"}</dt>
              <dd>
                {won(maxQty)}주
                {side === "매수" ? (
                  <small> · {won(buyingPower)}원</small>
                ) : (
                  <small> · 보유</small>
                )}
              </dd>
              <dt>주문 금액</dt>
              <dd>{won(total)}원</dd>
              <dt
                title={
                  ratesKnown
                    ? `${accountMode === "real" ? "실전" : "모의투자"} 수수료율 ${pctText(rates.fee)}`
                    : undefined
                }
              >
                수수료{ratesKnown && <small> {pctText(rates.fee)}</small>}
              </dt>
              <dd>{ratesKnown ? `${won(cost.fee)}원` : "—"}</dd>
              {side === "매도" && (
                <>
                  <dt title="증권거래세 + 농어촌특별세">
                    세금{ratesKnown && <small> {pctText(rates.sellTax)}</small>}
                  </dt>
                  <dd>{ratesKnown ? `${won(cost.tax)}원` : "—"}</dd>
                </>
              )}
              <dt className="ws-order-settle">
                {side === "매수" ? "총 결제 금액" : "받을 금액"}
              </dt>
              <dd className={`ws-order-settle${overBudget ? " down" : ""}`}>
                {won(cost.settle)}원
              </dd>
            </dl>
            {!ratesKnown && costs?.code === code && (
              <small className="ws-order-warn">
                수수료·세금 요율을 못 받아 비용 없이 계산했어요
              </small>
            )}
            {overBudget && (
              <small className="ws-order-warn">
                {side === "매수"
                  ? "주문 가능 금액을 넘었어요"
                  : "보유 수량보다 많아요"}
              </small>
            )}

            {review ? (
              <div
                className="ws-order-review"
                role="dialog"
                aria-label="주문 확인"
              >
                <strong>이 주문을 보낼까요?</strong>
                <dl>
                  <dt>계좌</dt>
                  <dd>{review.accountLabel}</dd>
                  <dt>종목</dt>
                  <dd>
                    {symbolName} {review.symbol}
                  </dd>
                  <dt>주문</dt>
                  <dd className={review.side === "BUY" ? "up" : "down"}>
                    {review.side === "BUY" ? "매수" : "매도"}{" "}
                    {won(review.quantity)}주 ·{" "}
                    {review.orderType === "MARKET"
                      ? "시장가"
                      : `지정가 ${won(review.price ?? 0)}원`}
                  </dd>
                  <dt>{review.side === "BUY" ? "예상 결제" : "예상 수령"}</dt>
                  <dd>{won(review.amount)}원</dd>
                </dl>
                {orderError && <p className="ws-order-error">{orderError}</p>}
                <div>
                  <button onClick={() => setReview(null)} disabled={sending}>
                    취소
                  </button>
                  <button
                    className={`primary ${review.side === "BUY" ? "buy" : "sell"}`}
                    onClick={() => void confirmOrder()}
                    disabled={sending}
                  >
                    {sending ? "보내는 중…" : "주문 확정"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className={`ws-order-submit ${side === "매수" ? "buy" : "sell"}`}
                disabled={quantity < 1 || overBudget || effectivePrice <= 0}
                onClick={submit}
              >
                {side} 주문{account ? "" : " (연습)"}
              </button>
            )}
            {done ? (
              <p className="ws-order-done">{done}</p>
            ) : (
              !account && <small className="ws-muted">연습 주문은 이 화면에만 기록돼요.</small>
            )}
          </>
        )}
      </section>
    </>
  );
}
