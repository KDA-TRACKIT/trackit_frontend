"use client";
// 로그인한 사용자의 홈: 화면의 숫자는 모두 실제 내역에서 온다
// - 월간 수익률·이행률: GET /performance (이번 달 청산 포지션 기준)
// - 누적 수익률 그래프: GET /positions?status=CLOSED (최근 1개월 안에 청산된 포지션을 시간순으로 누적)
// - 최근 거래 표: 일지별 체결 + 확정 노트(매매일지)를 체결 시각으로 짝지음
// - 증권사 연결: 체결은 "동기화"해야 들어온다 → 연결돼 있으면 어디까지 반영됐는지와 "지금 불러오기"
// - 주간 기록: 체결과 확정 메모를 한국 날짜로 묶는다
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SiteHeader from "./SiteHeader";
import HomeBanner from "./HomeBanner";
import HomePolicies from "./HomePolicies";
import { errorMessage } from "../lib/api/client";
import { getPerformance, getPositions, kstDate, recentTrades, type PerformanceReport, type Position, type Trade } from "../lib/api/performance";
import { searchSymbols } from "../lib/market-data";
import { initRecordSource, useRecords } from "../lib/records";
import { getSyncStatus, listConnections, syncNow, type BrokerConnection, type SyncStatus } from "../lib/api/orders";
import "./home.css";
import TraderCarousel from "./TraderCarousel";
import HomeWeeklyRecords, { workshopLink } from "./HomeWeeklyRecords";
import { weekDays } from "../lib/home-calendar";
import Image from "next/image";

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
    const from = `${kstDate().slice(0, 7)}-01`;
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
  const recent = useMemo(() => data?.trades ?? [], [data]);
  const currentWeek = weekDays(kstDate());
  const weekNotes = [...records].filter((record) => record.date >= currentWeek[0] && record.date <= currentWeek[6]).sort((a, b) => `${b.date}${b.noteTime}`.localeCompare(`${a.date}${a.noteTime}`)).slice(0, 3);
  const adherence = num(data?.report.performance.adherenceRate);
  const adherencePercent = adherence === null ? null : Math.min(100, Math.max(0, adherence <= 1 ? adherence * 100 : adherence));
  useEffect(() => {
    const codes = [...new Set(recent.map((t) => t.symbol))].filter((c) => !names[c]);
    if (!codes.length) return;
    Promise.all(codes.map((c) => searchSymbols(c).then((list) => [c, list.find((s) => s.code === c)?.name ?? c] as const).catch(() => [c, c] as const))).then((pairs) =>
      setNames((cur) => ({ ...cur, ...Object.fromEntries(pairs) })),
    );
  }, [recent, names]);

  return (
    <main className="home home-redesign">
      <div className="home-header-wrap">
      <SiteHeader active="home" />
        <Image className="home-brand-icon" src="/home/brand.png" alt="" width={32} height={32} />
      </div>
      <HomeBanner />
      <section className="home-overview home-container" aria-label="나의 투자 요약">
        <ReturnChart data={data} failed={!!error} />
        <div className="home-overview-side">
          <div className="home-stat-row">
            <Link className="home-stat-card" href="/mypage/activity/trades">
              <h2>이행률</h2><div className="home-stat-value"><strong>{adherencePercent === null ? "—" : `${Math.round(adherencePercent)}%`}</strong><span>{data ? `${data.report.judgments.total}건 기준` : error ? "확인 불가" : "불러오는 중"}</span></div>
              <div className="home-progress" role="progressbar" aria-label="전략 이행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={adherencePercent ?? undefined}><span style={{ width: `${adherencePercent ?? 0}%` }} /></div>
            </Link>
            <Link className="home-stat-card" href="/mypage/sales/settlements">
              <h2>판매 등급</h2><div className="home-stat-value"><strong>—</strong><span>판매 관리에서 확인</span></div><div className="home-progress" aria-hidden="true"><span style={{ width: 0 }} /></div>
            </Link>
          </div>
          <div className="home-week-memos">
            <h2>이번 주 메모</h2>
            {weekNotes.length ? weekNotes.map((record) => <Link key={record.id} href={workshopLink(record.symbol, record.symbolName, record.date)}><strong>{record.symbolName ?? record.topic ?? "시장 전반"}</strong><time>{record.noteTime.slice(0, 5)}</time><span>{record.text}</span></Link>) : <p>이번 주에 저장된 메모가 없습니다.</p>}
          </div>
        </div>
      </section>
      {error && <div className="home-data-notice home-container" role="status"><span>{error}</span><button type="button" onClick={load}>다시 시도</button></div>}
      <section id="trader-board" className="home-leaderboard">
        <div className="home-container">
          <div className="home-section-heading"><h2>트레이더 리더보드</h2><Link className="home-action" href="/marketplace">전략 쇼핑 <span aria-hidden="true">→</span></Link></div>
          <TraderCarousel />
        </div>
      </section>
      <HomeWeeklyRecords trades={recent} records={records} names={names} loading={!data && !error} failed={!!error} />
      {!!data?.accounts.length && <div className="home-container"><SyncBar accounts={data.accounts} onSynced={load} compact /></div>}
    </main>
  );
}

/** 누적 수익률: 청산 포지션을 청산 시각 순으로 쌓아 (누적 손익 ÷ 누적 매수 원가) */
function ReturnChart({ data, failed = false }: { data: Loaded | null; failed?: boolean }) {
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
    <div className="chart-card home-month-chart">
      <div className="home-chart-heading"><p>{Number(kstDate().slice(5, 7))}월 수익률</p><span>이번 달 청산 기준</span></div>
      {data === null ? (
        failed ? <strong>—</strong> : <strong className="skel-line" aria-busy="true" />
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
        <div className="chart chart-empty">{failed ? "수익률을 불러오지 못했습니다." : data === null ? "불러오는 중…" : series && series.length === 1 ? "청산한 거래가 하나뿐이에요" : "이 기간에 청산한 거래가 없어요"}</div>
      )}
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
