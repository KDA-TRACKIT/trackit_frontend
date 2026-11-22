"use client";
// 내 계좌 (시안 2026-11-18): 총 자산 · 연결된 계좌 · 기간별 투자 성과 · 보유 종목 · 전체 거래 기록
//   계좌 · 잔고: 마지막으로 저장된 잔고(증권사에 새로 묻지 않음) + 현재가(화면 공통 시세 줄)
//   성과: 백엔드 /performance (청산 포지션 기준 실현손익) · /positions?status=CLOSED (누적 그래프)
//   거래 기록: 내 체결 (/journals/{id}/trades + /trades/unlinked). 값이 없으면 "—" (지어내지 않음)
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../../lib/api/client";
import { accountPortfolio, listConnections, type BrokerConnection } from "../../../lib/api/orders";
import { getPerformance, getPositions, kstDate, recentTrades, type PerformanceReport, type Position, type Trade } from "../../../lib/api/performance";
import { useQuotes } from "../../../lib/live-quotes";
import type { Portfolio } from "../../../lib/types/trading";
import ConnectFlow from "./ConnectFlow";
import { Card, Empty, PageHead, PeriodTabs, inPeriod, type Period } from "../ui";
import BeeLoader from "../../BeeLoader";

type Account = { id: string; broker: string; mode: "mock" | "real"; no: string; portfolio: Portfolio | null };
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(Math.round(n)).toLocaleString("ko-KR")}원`;
const tone = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "");
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

const RANGES = [
  { key: "day", label: "일", from: () => kstDate(0), title: "오늘 수익" },
  { key: "week", label: "주", from: () => kstDate(6), title: "이번 주 수익" },
  { key: "month", label: "월", from: () => `${kstDate(0).slice(0, 8)}01`, title: "이번 달 수익" },
  { key: "year", label: "년", from: () => `${kstDate(0).slice(0, 4)}-01-01`, title: "올해 수익" },
  { key: "all", label: "전체", from: () => "2000-01-01", title: "전체 수익" },
] as const;

export default function WalletPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(() => {
    listConnections()
      .then(async (list: BrokerConnection[]) => {
        const rows = list.flatMap((c) => c.accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, broker: c.broker.name, mode: c.mode, no: a.accountNoMasked })));
        const withPf = await Promise.all(rows.map(async (r) => ({ ...r, portfolio: await accountPortfolio(r.id).catch(() => null) })));
        setAccounts(withPf);
        setError(null);
      })
      .catch((e) => {
        setAccounts([]);
        setError(errorMessage(e));
      });
  }, []);
  useEffect(load, [load]);

  // 보유 종목 현재가 (국내 6자리 · 미국 티커 모두 시세 줄에서)
  const codes = useMemo(() => [...new Set((accounts ?? []).flatMap((a) => a.portfolio?.positions.map((p) => p.symbol) ?? []))].sort(), [accounts]);
  const { quotes } = useQuotes(codes);

  const holdings = (accountId: string | "all") =>
    (accounts ?? [])
      .filter((a) => accountId === "all" || a.id === accountId)
      .flatMap((a) => a.portfolio?.positions ?? [])
      .reduce<Map<string, { symbol: string; qty: number; cost: number }>>((m, p) => {
        const cur = m.get(p.symbol) ?? { symbol: p.symbol, qty: 0, cost: 0 };
        const q = Number(p.quantity);
        m.set(p.symbol, { symbol: p.symbol, qty: cur.qty + q, cost: cur.cost + q * Number(p.avgPrice) });
        return m;
      }, new Map());

  const valueOf = (a: Account) => {
    let value = 0;
    let pnl = 0;
    let priced = true;
    for (const p of a.portfolio?.positions ?? []) {
      const q = Number(p.quantity);
      const price = quotes[p.symbol]?.price;
      if (!price) priced = false;
      value += q * (price ?? Number(p.avgPrice));
      pnl += price ? q * (price - Number(p.avgPrice)) : 0;
    }
    return { value, pnl, priced, cash: Number(a.portfolio?.balance?.cash ?? 0) };
  };
  const total = (accounts ?? []).reduce((s, a) => {
    const v = valueOf(a);
    return s + v.value + v.cash;
  }, 0);

  const connectFlow = connecting && (
    <ConnectFlow
      onClose={(changed) => {
        setConnecting(false);
        if (changed) load();
      }}
    />
  );

  // 시안: 연결한 계좌가 없으면 안내 카드 하나만 ("연결된 계좌가 없습니다." + 계좌 연결하기)
  if (accounts?.length === 0 && !error)
    return (
      <>
        <PageHead title="내 계좌" />
        <Card className="mp-wallet-none">
          <strong>연결된 계좌가 없습니다.</strong>
          <button type="button" className="mp-btn primary" onClick={() => setConnecting(true)}>
            계좌 연결하기
          </button>
        </Card>
        {connectFlow}
      </>
    );

  return (
    <>
      <PageHead title="내 계좌" />
      {accounts === null ? <Card className="mp-wallet-empty"><Empty text="계좌를 불러오는 중…" /></Card> : accounts.length === 0 ? (
        <Card className="mp-wallet-empty">
          <Empty text={error ? "연결된 계좌를 불러오지 못했습니다." : "연결된 계좌가 없습니다."}>
            {error && <p className="mp-wallet-error" role="alert">{error}</p>}
            <button type="button" className="mp-btn primary" onClick={error ? load : () => setConnecting(true)}>{error ? "다시 불러오기" : "계좌 연결하기"}</button>
          </Empty>
        </Card>
      ) : <>
      <Card className="mp-wallet-top">
        <div className="mp-wallet-total">
          <div>
            <span>총 자산</span>
            <strong>{accounts?.length ? won(total) : "—"}</strong>
          </div>
          <div>
            <span>가입 이후 누적 수익률</span>
            <strong className="muted" title="입금·출금 기록이 연결되면 계산돼요">
              —
            </strong>
          </div>
        </div>
        <div className="mp-wallet-sub">
          <h2>연결된 계좌</h2>
          <button type="button" className="mp-btn soft small" onClick={() => setConnecting(true)}>
            + 계좌 연결
          </button>
        </div>
        <div className="mp-grid-table" style={{ ["--cols" as string]: "1fr 1fr 1.1fr 1.2fr 1.2fr 1.2fr" }}>
          <div className="th">
            <span>증권사</span>
            <span>계좌 유형</span>
            <span>계좌번호</span>
            <span>평가금액</span>
            <span>예수금</span>
            <span>평가손익</span>
          </div>
          {accounts?.map((a) => {
            const v = valueOf(a);
            return (
              <div key={a.id} className="tr">
                <span>{a.broker}</span>
                <span>{a.mode === "mock" ? "모의투자" : "위탁종합"}</span>
                <span className="num">{a.no}</span>
                <span className="num">{a.portfolio ? won(v.value) : "—"}</span>
                <span className="num">{a.portfolio?.balance ? won(v.cash) : "—"}</span>
                <span className={`num ${tone(v.pnl)}`}>{a.portfolio?.positions.length ? signed(v.pnl) : "—"}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <PerformanceCard />

      <HoldingsCard accounts={accounts ?? []} holdings={holdings} quotes={quotes} />

      <TradesCard />
      </>}

      {connectFlow}
    </>
  );
}

/** 기간별 투자 성과: 실현손익(청산 기준) · 매매 · 승률 · 수수료 + 누적 실현손익 그래프 */
function PerformanceCard() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("month");
  const r = RANGES.find((x) => x.key === range)!;
  const [loaded, setLoaded] = useState<{ key: string; data: PerformanceReport | null } | null>(null);
  const report = loaded?.key === range ? loaded.data : null;
  const [closed, setClosed] = useState<Position[] | null>(null);
  useEffect(() => {
    let off = false;
    getPerformance(r.from(), kstDate(0))
      .then((d) => !off && setLoaded({ key: r.key, data: d }))
      .catch(() => !off && setLoaded({ key: r.key, data: null }));
    return () => {
      off = true;
    };
  }, [r]);
  useEffect(() => {
    getPositions("CLOSED")
      .then(setClosed)
      .catch(() => setClosed([]));
  }, []);
  const p = report?.performance;
  const realized = p ? Number(p.realizedPnl) : null;
  const fees = report ? Number(report.costs.feesAndTaxes) : null;
  const points = useMemo(() => {
    const from = r.from();
    const list = (closed ?? []).filter((c) => c.closedAt && c.closedAt.slice(0, 10) >= from).sort((a, b) => a.closedAt!.localeCompare(b.closedAt!));
    const out: { t: string; v: number }[] = [];
    for (const c of list) out.push({ t: c.closedAt!.slice(5, 10).replace("-", "."), v: (out.at(-1)?.v ?? 0) + Number(c.realizedPnl ?? 0) });
    return out;
  }, [closed, r]);

  return (
    <Card>
      <div className="mp-perf-head">
        <h2>
          기간별 투자 성과 <small>{r.label === "전체" ? "전체 기간" : `${r.from().replaceAll("-", ".")} ~`}</small>
        </h2>
        <div className="mp-perf-tabs" role="radiogroup" aria-label="기간">
          {RANGES.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={x.key === range} className={x.key === range ? "on" : ""} onClick={() => setRange(x.key)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mp-perf-stats">
        <div>
          <span>{r.title} (실현)</span>
          <strong className={`big ${realized !== null ? tone(realized) : ""}`}>{realized !== null ? signed(realized) : "—"}</strong>
        </div>
        <div>
          <span>매매</span>
          <strong>{p ? `${p.tradeCount}건` : "—"}</strong>
        </div>
        <div>
          <span>승률</span>
          <strong>{p?.winRate ? `${Math.round(Number(p.winRate) * (Number(p.winRate) <= 1 ? 100 : 1))}%` : "—"}</strong>
        </div>
        <div>
          <span>수수료 · 세금</span>
          <strong>{fees !== null ? won(fees) : "—"}</strong>
        </div>
      </div>
      <p className="mp-perf-label">누적 실현손익 추이</p>
      <LineChart points={points} />
    </Card>
  );
}

function LineChart({ points }: { points: { t: string; v: number }[] }) {
  if (points.length < 2) return <div className="mp-chart-empty">청산한 매매가 2건 이상이면 그래프가 보여요.</div>;
  const W = 820;
  const H = 120;
  const min = Math.min(0, ...points.map((p) => p.v));
  const max = Math.max(0, ...points.map((p) => p.v));
  const y = (v: number) => H - 10 - ((v - min) / (max - min || 1)) * (H - 20);
  const x = (i: number) => 40 + (i / (points.length - 1)) * (W - 60);
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  return (
    <svg className="mp-line" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="누적 실현손익 추이">
      <line x1="40" x2={W - 20} y1={y(0)} y2={y(0)} className="zero" />
      <polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} />
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={H + 14} textAnchor="middle">
          {points[i].t}
        </text>
      ))}
    </svg>
  );
}

function HoldingsCard({
  accounts,
  holdings,
  quotes,
}: {
  accounts: Account[];
  holdings: (id: string | "all") => Map<string, { symbol: string; qty: number; cost: number }>;
  quotes: Record<string, { name: string; price: number }>;
}) {
  const [account, setAccount] = useState<string>("all");
  const rows = [...holdings(account).values()];
  return (
    <Card
      title="보유 종목"
      action={
        <select className="mp-plain-select" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="계좌">
          <option value="all">전체 계좌</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.broker} {a.no}
            </option>
          ))}
        </select>
      }
    >
      <div className="mp-grid-table" style={{ ["--cols" as string]: "1.4fr 1fr 1fr 0.8fr 0.8fr 1.1fr 0.8fr" }}>
        <div className="th">
          <span>종목명</span>
          <span>평균 매입가</span>
          <span>현재가</span>
          <span>보유수량</span>
          <span>매도 가능</span>
          <span>평가손익</span>
          <span>수익률</span>
        </div>
        {rows.map((h) => {
          const q = quotes[h.symbol];
          const avg = h.qty ? h.cost / h.qty : 0;
          const pnl = q ? h.qty * q.price - h.cost : null;
          return (
            <div key={h.symbol} className="tr">
              <span>{q?.name ?? h.symbol}</span>
              <span className="num">{won(avg)}</span>
              <span className="num">{q ? won(q.price) : "—"}</span>
              <span className="num">{h.qty.toLocaleString("ko-KR")}주</span>
              <span className="num">{h.qty.toLocaleString("ko-KR")}주</span>
              <span className={`num ${pnl !== null ? tone(pnl) : ""}`}>{pnl !== null ? signed(pnl) : "—"}</span>
              <span className={`num ${pnl !== null ? tone(pnl) : ""}`}>{pnl !== null && h.cost ? pct((pnl / h.cost) * 100) : "—"}</span>
            </div>
          );
        })}
      </div>
      {rows.length === 0 && <Empty text="보유 종목이 없어요." />}
    </Card>
  );
}

/** 전체 거래 기록: 내 체결 + 매매일지(일지에 묶였으면 보기) */
function TradesCard() {
  const [trades, setTrades] = useState<(Trade & { journalTitle: string | null })[] | null>(null);
  const [side, setSide] = useState<"all" | "BUY" | "SELL">("all");
  const [symbol, setSymbol] = useState("all");
  useEffect(() => {
    recentTrades()
      .then(setTrades)
      .catch(() => setTrades([]));
  }, []);
  const codes = useMemo(() => [...new Set((trades ?? []).map((t) => t.symbol))].sort(), [trades]);
  const { quotes } = useQuotes(codes);
  const name = (c: string) => quotes[c]?.name ?? c;
  const list = (trades ?? []).filter((t) => (side === "all" || t.side === side) && (symbol === "all" || t.symbol === symbol));
  const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", ".");

  return (
    <Card>
      <div className="mp-perf-head">
        <h2>전체 거래 기록</h2>
      </div>
      <div className="mp-grid-table" style={{ ["--cols" as string]: "1fr 0.8fr 1.3fr 0.7fr 1fr 1.1fr 0.9fr" }}>
        <div className="th">
          <span>거래일</span>
          <select className="mp-th-select" value={side} onChange={(e) => setSide(e.target.value as typeof side)} aria-label="구분">
            <option value="all">구분 ▾</option>
            <option value="BUY">매수</option>
            <option value="SELL">매도</option>
          </select>
          <select className="mp-th-select" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="종목">
            <option value="all">종목 ▾</option>
            {codes.map((c) => (
              <option key={c} value={c}>
                {name(c)}
              </option>
            ))}
          </select>
          <span>수량</span>
          <span>체결 단가</span>
          <span>거래 금액</span>
          <span>매매일지</span>
        </div>
        {list.slice(0, 200).map((t) => {
          const q = Number(t.quantity);
          const p = Number(t.price);
          return (
            <div key={t.id} className="tr">
              <span className="num">{kst(t.executedAt)}</span>
              <span className={t.side === "BUY" ? "up" : "down"}>{t.side === "BUY" ? "매수" : "매도"}</span>
              <span>{name(t.symbol)}</span>
              <span className="num">{q.toLocaleString("ko-KR")}주</span>
              <span className="num">{won(p)}</span>
              <span className="num">{won(p * q)}</span>
              <span>
                {t.journalId ? (
                  <Link className="mp-text-link" href={`/workshop?symbol=${encodeURIComponent(t.symbol)}&name=${encodeURIComponent(name(t.symbol))}`}>
                    보기
                  </Link>
                ) : (
                  <small className="mp-muted">연결된 노트 없음</small>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {trades === null && <BeeLoader size="sm" />}
      {trades && list.length === 0 && <Empty text={trades.length ? "조건에 맞는 거래가 없어요." : "거래 내역을 연결하면 매수·매도 기록과 관련 매매일지를 확인할 수 있습니다."} />}
    </Card>
  );
}
