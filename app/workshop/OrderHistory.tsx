"use client";
// 주문 내역 (매매 중, 기업 정보 위): 연결한 증권사 계좌의 오늘 주문. 미체결 주문은 정정·취소
//   정정·취소는 주문과 같은 규칙: 확인 화면에서 "확정"을 눌러야 한 번만 보내고, 실패해도 다시 보내지 않는다
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../lib/api/client";
import { cancelOrder, modifyOrder, orderAccounts, todayOrders, type OrderAccount, type TodayOrder } from "../../lib/api/orders";

type Row = TodayOrder & { account: OrderAccount };
type Action =
  | { kind: "modify"; row: Row; price: number; quantity: number; review: boolean }
  | { kind: "cancel"; row: Row };

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const hhmm = (t: string) => (t.length >= 5 ? t.slice(0, 5) : t);
/** 장중엔 10초마다 다시 받는다 (체결되면 미체결에서 빠짐) */
const REFRESH_MS = 10_000;

export default function OrderHistory({ symbol, refreshKey = 0 }: { symbol: string; refreshKey?: number }) {
  const [accounts, setAccounts] = useState<OrderAccount[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [onlySymbol, setOnlySymbol] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    orderAccounts()
      .then((list) => alive && setAccounts(list))
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async (list: OrderAccount[]) => {
    const all: Row[] = [];
    let failed: string | null = null;
    for (const account of list) {
      try {
        const orders = await todayOrders(account.id);
        all.push(...orders.map((o) => ({ ...o, account })));
      } catch (e) {
        failed = errorMessage(e);
      }
    }
    return { all, failed };
  }, []);

  useEffect(() => {
    if (!accounts?.length) return;
    let alive = true;
    void load(accounts).then(({ all, failed }) => {
      if (!alive) return;
      setRows(all);
      setError(failed);
    });
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [accounts, load, tick, refreshKey]);

  async function confirm() {
    if (!action || sending) return;
    const { row } = action;
    setSending(true);
    setError(null);
    try {
      if (action.kind === "cancel") {
        const res = await cancelOrder(row.account.id, row.orderNo, { symbol: row.symbol });
        setNotice(`${row.name || row.symbol} 주문 ${row.orderNo} 잔량 ${won(row.remaining)}주 취소를 접수했어요 · 주문번호 ${res.orderNo}`);
      } else {
        const res = await modifyOrder(row.account.id, row.orderNo, {
          symbol: row.symbol,
          price: action.price,
          ...(action.quantity < row.remaining ? { quantity: action.quantity } : {}),
        });
        setNotice(`${row.name || row.symbol} 주문 ${row.orderNo}을 ${won(action.price)}원 · ${won(action.quantity)}주로 정정 접수했어요 · 주문번호 ${res.orderNo}`);
      }
      setAction(null);
      setTimeout(() => setTick((t) => t + 1), 1500);
    } catch (e) {
      // 실패해도 다시 보내지 않는다. 알리기만
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  if (accounts === null) return null;
  if (!accounts.length) {
    return (
      <section className="ws-panel ws-orders" aria-label="주문 내역">
        <h2>주문 내역</h2>
        <p className="ws-muted">증권사 계좌를 연결하면 오늘 주문과 미체결 주문을 여기서 정정·취소할 수 있어요.</p>
      </section>
    );
  }

  const shown = (rows ?? []).filter((r) => (filter === "open" ? r.open : true) && (!onlySymbol || r.symbol === symbol));
  const openCount = (rows ?? []).filter((r) => r.open).length;

  return (
    <section className="ws-panel ws-orders" aria-label="주문 내역">
      <header className="ws-orders-head">
        <h2>주문 내역</h2>
        <div className="ws-orders-tabs" role="tablist">
          <button role="tab" aria-selected={filter === "open"} className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>
            미체결 {openCount}
          </button>
          <button role="tab" aria-selected={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            오늘 전체 {rows?.length ?? 0}
          </button>
        </div>
        <label className="ws-orders-only">
          <input type="checkbox" checked={onlySymbol} onChange={(e) => setOnlySymbol(e.target.checked)} />이 종목만
        </label>
        <button className="ws-orders-refresh" onClick={() => setTick((t) => t + 1)} title="증권사에서 다시 받기" aria-label="주문 내역 새로고침">
          ↻
        </button>
      </header>

      {notice && <p className="ws-orders-notice">{notice}</p>}
      {error && <p className="ws-orders-error">{error}</p>}

      <div className="ws-orders-table">
        <table>
          <thead>
            <tr>
              <th>시각</th>
              <th>종목</th>
              <th>구분</th>
              <th>유형</th>
              <th className="num">주문가</th>
              <th className="num">주문</th>
              <th className="num">체결</th>
              <th className="num">미체결</th>
              <th>상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={10} className="ws-orders-empty">
                  주문 내역을 불러오는 중…
                </td>
              </tr>
            )}
            {rows !== null && shown.length === 0 && (
              <tr>
                <td colSpan={10} className="ws-orders-empty">
                  {filter === "open" ? "미체결 주문이 없어요." : "오늘 주문이 없어요."}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const editing = action?.row.orderNo === r.orderNo && action.row.account.id === r.account.id ? action : null;
              return (
                <OrderRow
                  key={`${r.account.id}:${r.orderNo}`}
                  row={r}
                  action={editing}
                  sending={sending}
                  onAction={setAction}
                  onConfirm={() => void confirm()}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderRow({ row, action, sending, onAction, onConfirm }: { row: Row; action: Action | null; sending: boolean; onAction: (a: Action | null) => void; onConfirm: () => void }) {
  const sideText = row.side === "BUY" ? "매수" : "매도";
  return (
    <>
      <tr className={action ? "editing" : ""}>
        <td>{hhmm(row.time)}</td>
        <td>
          <strong>{row.name || row.symbol}</strong>
          <small>{row.orderNo}</small>
        </td>
        <td className={row.side === "BUY" ? "up" : "down"}>
          {sideText}
          {row.kind !== "일반" && <small>{row.kind}</small>}
        </td>
        <td>{row.orderType || "—"}</td>
        <td className="num">{row.price ? won(row.price) : "시장가"}</td>
        <td className="num">{won(row.quantity)}</td>
        <td className="num">{won(row.filled)}</td>
        <td className={`num${row.remaining > 0 ? " strong" : ""}`}>{won(row.remaining)}</td>
        <td>{row.status || "—"}</td>
        <td className="ws-orders-actions">
          {row.open && !action && (
            <>
              <button onClick={() => onAction({ kind: "modify", row, price: row.price || 0, quantity: row.remaining, review: false })}>정정</button>
              <button className="danger" onClick={() => onAction({ kind: "cancel", row })}>
                취소
              </button>
            </>
          )}
        </td>
      </tr>
      {action && (
        <tr className="ws-orders-edit">
          <td colSpan={10}>
            {action.kind === "cancel" ? (
              <div className="ws-orders-confirm">
                <span>
                  <b className={row.side === "BUY" ? "up" : "down"}>{sideText}</b> {row.name || row.symbol} 주문 {row.orderNo}의 남은 <b>{won(row.remaining)}주</b>를 취소할까요?
                </span>
                <button onClick={() => onAction(null)} disabled={sending}>
                  닫기
                </button>
                <button className="danger primary" onClick={onConfirm} disabled={sending}>
                  {sending ? "보내는 중…" : "취소 확정"}
                </button>
              </div>
            ) : action.review ? (
              <div className="ws-orders-confirm">
                <span>
                  {row.name || row.symbol} 주문 {row.orderNo}: {row.price ? `${won(row.price)}원` : "시장가"} · {won(row.remaining)}주 → <b>{won(action.price)}원 · {won(action.quantity)}주</b> (지정가)로 정정할까요?
                </span>
                <button onClick={() => onAction({ ...action, review: false })} disabled={sending}>
                  고치기
                </button>
                <button className="primary" onClick={onConfirm} disabled={sending}>
                  {sending ? "보내는 중…" : "정정 확정"}
                </button>
              </div>
            ) : (
              <div className="ws-orders-form">
                <label>
                  <span>정정 가격</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={action.price || ""}
                    onChange={(e) => onAction({ ...action, price: Math.max(0, Math.round(Number(e.target.value))) })}
                  />
                </label>
                <label>
                  <span>수량 (남은 {won(row.remaining)}주까지)</span>
                  <input
                    type="number"
                    min={1}
                    max={row.remaining}
                    step={1}
                    value={action.quantity || ""}
                    onChange={(e) => onAction({ ...action, quantity: Math.min(row.remaining, Math.max(0, Math.round(Number(e.target.value)))) })}
                  />
                </label>
                <button onClick={() => onAction(null)}>닫기</button>
                <button className="primary" disabled={!(action.price > 0) || !(action.quantity > 0)} onClick={() => onAction({ ...action, review: true })}>
                  정정 확인
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
