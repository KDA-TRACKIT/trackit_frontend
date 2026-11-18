"use client";
// 로그인한 사용자의 홈: 화면의 숫자는 모두 실제 내역에서 온다
// - 지표 4칸: GET /performance (최근 1개월, 증권사 체결로 만든 청산 포지션 기준, 수수료·세금 포함)
// - 누적 수익률 그래프: GET /positions?status=CLOSED (최근 1개월 안에 청산된 포지션을 시간순으로 누적)
// - 최근 거래 표: 일지별 체결 + 확정 노트(매매일지)를 체결 시각으로 짝지음
// - 증권사 연결: 체결은 "동기화"해야 들어온다 → 연결돼 있으면 어디까지 반영됐는지와 "지금 불러오기"
// - 맨 위 배너 자리는 시안 그대로 비워 둠
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SiteHeader from "./SiteHeader";
import HomeBanner from "./HomeBanner";
import HomePolicies from "./HomePolicies";
import { errorMessage } from "../lib/api/client";
import { getPerformance, getPositions, kstDate, recentTrades, type PerformanceReport, type Position, type Trade } from "../lib/api/performance";
import { searchSymbols } from "../lib/market-data";
import { initRecordSource, useRecords, type TradeRecord } from "../lib/records";
import { getSyncStatus, listConnections, syncNow, type BrokerConnection, type SyncStatus } from "../lib/api/orders";
import "./home.css";
import TraderCarousel from "./TraderCarousel";

/** 리포트 기간: 최근 1개월 (시안의 날짜 축과 같은 폭) */
const REPORT_DAYS = 30;

/** 연결된 증권사 계좌 하나와 동기화 상태 */
type BrokerAccount = { id: string; label: string; status: SyncStatus | null };
type Loaded = { report: PerformanceReport; closed: Position[]; trades: (Trade & { journalTitle: string | null })[]; accounts: BrokerAccount[] };

/** 연결된 계좌(사용 중)와 각 계좌의 동기화 상태. 실패하면 빈 목록 (홈의 다른 숫자는 그대로 보여 준다) */
async function brokerAccounts(): Promise<BrokerAccount[]> {
  const conns: BrokerConnection[] = await listConnections().catch(() => []);
  const list = conns.flatMap((c) =>
    c.accounts
      .filter((a) => a.status === "ACTIVE")
      .map((a) => ({ id: a.id, label: c.label ?? `${c.broker.name}${c.mode === "mock" ? " 모의" : ""}` })),
  );
  return Promise.all(list.map(async (a) => ({ ...a, status: await getSyncStatus(a.id).catch(() => null) })));
}

const num = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? null : Number(s));
const won = (n: number, sign = false) => `${sign && n > 0 ? "+" : n < 0 ? "−" : ""}₩${Math.abs(Math.round(n)).toLocaleString("ko-KR")}`;
const pct = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(digits)}%`;
const tone = (n: number | null) => (n === null || n === 0 ? "" : n > 0 ? "up" : "down");

/** UTC ISO → KST { date: YYYY-MM-DD, time: HH:MM } */
function kst(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

export default function HomeDashboard() {
  /** 다시 시도 누를 때마다 +1 */
  const [attempt, setAttempt] = useState(0);
  /** 받아 온 결과. key 가 지금 요청(시도 번호)과 같을 때만 화면에 쓴다 → 다시 시도하면 자동으로 "불러오는 중" */
  const [result, setResult] = useState<{ key: number; data?: Loaded; error?: string } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const records = useRecords();

  const key = attempt;
  useEffect(() => {
    const from = kstDate(REPORT_DAYS - 1);
    const to = kstDate();
    let cancelled = false;
    Promise.all([getPerformance(from, to), getPositions("CLOSED"), recentTrades(), brokerAccounts()])
      .then(([report, closed, trades, accounts]) => {
        const inRange = closed.filter((p) => p.closedAt && kst(p.closedAt).date >= from && kst(p.closedAt).date <= to);
        if (!cancelled) setResult({ key, data: { report, closed: inRange, trades, accounts } });
      })
      .catch((e) => {
        if (!cancelled) setResult({ key, error: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  const current = result?.key === key ? result : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    void initRecordSource();
  }, []);

  // 종목 이름 (체결엔 코드만 있음)
  const recent = useMemo(() => data?.trades.slice(0, 6) ?? [], [data]);
  useEffect(() => {
    const codes = [...new Set(recent.map((t) => t.symbol))].filter((c) => !names[c]);
    if (!codes.length) return;
    Promise.all(codes.map((c) => searchSymbols(c).then((list) => [c, list.find((s) => s.code === c)?.name ?? c] as const).catch(() => [c, c] as const))).then((pairs) =>
      setNames((cur) => ({ ...cur, ...Object.fromEntries(pairs) })),
    );
  }, [recent, names]);

  return (
    <main className="home">
      <SiteHeader active="home" />
      <HomeBanner />
      <section id="trader-board" className="trader-board section-wrap">
        <div className="section-heading">
          <h2>트레이더 보드</h2>
          <Link className="heading-link" href="/marketplace">
            전략 쇼핑 <span>→</span>
          </Link>
        </div>
        <TraderCarousel />
      </section>
      <section className="report section-wrap">
        <div className="section-heading">
          <h2>트레이딩 성과 리포트</h2>
          <Link className="heading-link" href="/mypage/activity/trades">
            성과 리포트 <span>→</span>
          </Link>
        </div>
        {error ? (
          <div className="home-state">
            <p>{error}</p>
            <button type="button" onClick={load}>
              다시 시도
            </button>
          </div>
        ) : (
          <div className="report-grid">
            <ReturnChart data={data} />
            <div className="metric-grid">
              <Metric label="평균 수익" value={data ? fmtOr(num(data.report.performance.avgRealizedPnl), (n) => won(n, true)) : null} tone={tone(num(data?.report.performance.avgRealizedPnl))} />
              <Metric label="거래 횟수" value={data ? `${data.report.performance.tradeCount.toLocaleString("ko-KR")}건` : null} />
              <Metric label="평균 손익비" value={data ? fmtOr(num(data.report.performance.profitLossRatio), (n) => `${n.toFixed(2)} : 1`) : null} />
              <Metric label="최대 낙폭" value={data ? fmtOr(num(data.report.performance.maxDrawdownPnl), (n) => (n === 0 ? "₩0" : won(-n))) : null} tone={num(data?.report.performance.maxDrawdownPnl) ? "down" : ""} />
            </div>
          </div>
        )}
      </section>
      <section id="trading-log" className="trades section-wrap">
        <div className="section-heading">
          <h2>최근 거래 기록과 매매일지</h2>
          <Link className="heading-link" href="/workshop">
            작업실 열기 <span>→</span>
          </Link>
        </div>
        <TradeTable rows={recent} loading={!data && !error} names={names} records={records} accounts={data?.accounts ?? []} onSynced={load} />
        <HomePolicies />
      </section>
    </main>
  );
}

function fmtOr(n: number | null, f: (n: number) => string) {
  return n === null ? "—" : f(n);
}

function Metric({ label, value, tone: t = "" }: { label: string; value: string | null; tone?: string }) {
  return (
    <div className="metric">
      <p>{label}</p>
      {value === null ? <strong className="skel-line" aria-busy="true" /> : <strong className={t}>{value}</strong>}
    </div>
  );
}

/** 누적 수익률: 청산 포지션을 청산 시각 순으로 쌓아 (누적 손익 ÷ 누적 매수 원가) */
function ReturnChart({ data }: { data: Loaded | null }) {
  const series = useMemo(() => {
    if (!data) return null;
    const list = [...data.closed].sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""));
    let pnl = 0;
    let cost = 0;
    return list.map((p) => {
      pnl += Number(p.realizedPnl ?? 0);
      cost += Number(p.avgEntryPrice) * Number(p.quantity);
      return { t: new Date(p.closedAt!).getTime(), v: cost > 0 ? pnl / cost : 0 };
    });
  }, [data]);

  const last = series?.length ? series[series.length - 1].v : null;
  const W = 580;
  const H = 130;
  const chart = useMemo(() => {
    if (!series || series.length < 2) return null;
    const vals = [0, ...series.map((s) => s.v)];
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 0.002) {
      hi += 0.001;
      lo -= 0.001;
    }
    const t0 = series[0].t;
    const t1 = series[series.length - 1].t || t0 + 1;
    const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * W;
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
    const points = series.map((s) => `${x(s.t).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");
    const ticks = Array.from({ length: 5 }, (_, i) => hi - ((hi - lo) * i) / 4);
    const dates = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(t0 + ((t1 - t0) * i) / 5 + 9 * 3_600_000);
      return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
    });
    return { points, ticks, dates, zeroY: y(0) };
  }, [series]);

  return (
    <div className="chart-card">
      <p>누적 수익률 추이</p>
      {data === null ? (
        <strong className="skel-line" aria-busy="true" />
      ) : (
        <strong className={tone(last)}>{last === null ? "—" : pct(last)}</strong>
      )}
      {chart ? (
        <div className="chart">
          <div className="y-labels">
            {chart.ticks.map((t, i) => (
              <span key={i}>{pct(t, Math.abs(t) < 0.1 ? 1 : 0)}</span>
            ))}
          </div>
          <div className="chart-body">
            <div className="grid-lines" />
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="누적 수익률 차트">
              <line x1="0" x2={W} y1={chart.zeroY} y2={chart.zeroY} className="zero-line" />
              <polyline points={chart.points} fill="none" className={`line ${tone(last)}`} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="x-labels">
              {chart.dates.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="chart chart-empty">{data === null ? "" : series && series.length === 1 ? "청산한 거래가 하나뿐이에요" : "이 기간에 청산한 거래가 없어요"}</div>
      )}
    </div>
  );
}

/** 최근 체결 + 그 체결에 남긴 매매일지(확정 노트). 노트는 같은 종목·같은 날·같은 분의 체결에 연결된 것 */
function TradeTable({
  rows,
  loading,
  names,
  records,
  accounts,
  onSynced,
}: {
  rows: (Trade & { journalTitle: string | null })[];
  loading: boolean;
  names: Record<string, string>;
  records: TradeRecord[];
  accounts: BrokerAccount[];
  onSynced: () => void;
}) {
  if (loading)
    return (
      <div className="trade-table">
        <div className="trade-head">
          <span>일시</span>
          <span>종목</span>
          <span>체결</span>
          <span>체결 금액</span>
          <span>매매일지</span>
          <span />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="trade-row skel-row">
            <span className="skel-line" />
          </div>
        ))}
      </div>
    );
  if (rows.length === 0)
    return accounts.length ? (
      <div className="home-state">
        <p>증권사 체결이 아직 반영되지 않았어요</p>
        <SyncBar accounts={accounts} onSynced={onSynced} />
      </div>
    ) : (
      <div className="home-state">
        <p>아직 체결된 거래가 없어요</p>
        <Link href="/mypage/account">증권사 계좌 연결하기</Link>
      </div>
    );
  return (
    <div className="trade-table">
      <div className="trade-head">
        <span>일시</span>
        <span>종목</span>
        <span>체결</span>
        <span>체결 금액</span>
        <span>매매일지</span>
        <span />
      </div>
      {rows.map((t) => {
        const when = kst(t.executedAt);
        const side = t.side === "BUY" ? "매수" : "매도";
        const memo = records.find((r) => r.symbol === t.symbol && r.date === when.date && r.executionTime?.slice(0, 5) === when.time);
        const name = names[t.symbol] ?? t.symbol;
        const href = `/workshop?symbol=${t.symbol}&name=${encodeURIComponent(name)}&market=${encodeURIComponent(t.market)}`;
        return (
          <div className="trade-row" key={t.id}>
            <span className="num">
              {when.date.slice(5).replace("-", ".")}  {when.time}
            </span>
            <span>{name}</span>
            <span>
              <em className={t.side === "BUY" ? "up" : "down"}>{side}</em> · {Number(t.quantity).toLocaleString("ko-KR")}주
            </span>
            <span className="num">{won(Number(t.quantity) * Number(t.price))}</span>
            <span className={memo ? "memo" : "memo empty"}>{memo ? memo.text : "작성 전"}</span>
            <Link href={href}>
              {memo ? "일지 보기" : "일지 작성"} <span>→</span>
            </Link>
          </div>
        );
      })}
      {accounts.length > 0 && <SyncBar accounts={accounts} onSynced={onSynced} compact />}
    </div>
  );
}

/** "11.12 14:00" (KST) */
function stamp(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString();
  return `${d.slice(5, 7)}.${d.slice(8, 10)} ${d.slice(11, 16)}`;
}

/**
 * 증권사 체결 반영 상태 + 지금 불러오기.
 * 누르면 연결된 계좌마다 동기화를 바로 실행하고(서버 시간 예산 안에서), 끝나면 홈 숫자를 다시 읽는다.
 * 다 못 받으면 서버가 다시 대기로 돌려 두므로 한 번 더 누르면 이어 받는다
 */
function SyncBar({ accounts, onSynced, compact }: { accounts: BrokerAccount[]; onSynced: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const through = accounts
    .map((a) => a.status?.syncedThrough?.EXECUTIONS ?? null)
    .filter((v): v is string => !!v)
    .sort()[0];
  const running = accounts.some((a) => a.status?.active);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const results = await Promise.all(accounts.map((a) => syncNow(a.id)));
      const more = results.some((r) => r.status === "QUEUED" || r.status === "RUNNING");
      setNote(more ? "일부만 받았어요. 한 번 더 누르면 이어서 받아요" : null);
      onSynced();
    } catch (e) {
      setNote(errorMessage(e));
    }
    setBusy(false);
  }

  return (
    <div className={compact ? "home-sync compact" : "home-sync"}>
      <span>
        {accounts.map((a) => a.label).join(", ")} · {through ? `${stamp(through)}까지 반영` : "아직 불러온 적 없음"}
        {running && !busy ? " · 불러오는 중" : ""}
      </span>
      <button type="button" onClick={() => void run()} disabled={busy}>
        {busy ? "불러오는 중…" : compact ? "새로 불러오기" : "지금 불러오기"}
      </button>
      {note && <small>{note}</small>}
    </div>
  );
}
