"use client";
// 전략보관함 · 구매한 전략 → 트레이더를 누르면 (시안 2026-11-18 "구매한 전략 － 트레이더 클릭 시")
//   열람권으로 연 달 중 하나를 골라: 거래 내역(종목 고르기) · 전체/사전 노트 · 종목 차트 + 차트 메모 · 기타 정보
//   내용은 /strategy-data/{id}/{달} (열람권을 서버가 확인), 그 달 대표 종목이 아닌 종목 차트는 일봉을 따로 받음
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "../../../SiteHeader";
import MonthPicker from "./MonthPicker";
import UseStrategy from "./UseStrategy";
import { subscribed, usePasses } from "../../../../lib/purchases";
import { fetchStrategyMonth } from "../../../../lib/strategy-data";
import { fetchBars } from "../../../../lib/market-data";
import { pct, strategiesOf, tone, traderById } from "../../../marketplace/data";
import StrategyChart, { type SimCandle } from "../../../marketplace/StrategyChart";
import { useDark, type SimDetail } from "../../../marketplace/GuessFirst";
import "../../../marketplace/marketplace.css";
import "../../archive.css";
import BeeLoader from "../../../BeeLoader";

const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;
type Memo = { d: string; text: string; pre: boolean };

export default function PurchasedTraderPage() {
  const { id } = useParams<{ id: string }>();
  const t = traderById(id);
  const passes = usePasses();
  const dark = useDark();
  // 열람권으로 연 달 + 누구나 보는 무료 첫 전략
  const months = useMemo(
    () => [...new Set([...(t && subscribed(passes, id) ? strategiesOf(t).map((s) => s.month) : []), ...passes.filter((p) => p.traderId === id && p.used).map((p) => p.used!.month), ...(t ? strategiesOf(t).filter((s) => s.free).map((s) => s.month) : [])])].sort().reverse(),
    [passes, id, t],
  );
  const [pick, setPick] = useState<string | null>(null);
  const month = pick ?? months[0] ?? null;
  const [detail, setDetail] = useState<{ month: string; data: SimDetail | null } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "pre">("all");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<{ code: string; candles: SimCandle[] } | null>(null);

  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    fetchStrategyMonth(id, month)
      .then((data) => !cancelled && setDetail({ month, data }))
      .catch(() => !cancelled && setDetail({ month, data: null }));
    return () => {
      cancelled = true;
    };
  }, [id, month]);

  const m = detail?.month === month ? detail.data?.months.find((x) => x.month === month) : undefined;
  const trades = m?.trades ?? [];
  const carry = (m?.notes ?? []).filter((n) => n.type === "carry" && n.code);
  const codes = [...new Map([...trades.map((x) => [x.code, x.name] as const), ...carry.map((n) => [n.code!, n.name ?? n.code!] as const), ...(m ? [[m.symbol.code, m.symbol.name] as const] : [])]).entries()];
  const cur = code && codes.some(([c]) => c === code) ? code : (trades[0]?.code ?? m?.symbol.code ?? null);
  const curName = codes.find(([c]) => c === cur)?.[1] ?? cur ?? "";

  // 대표 종목이 아니면 그 달 앞뒤 일봉을 따로 받음
  useEffect(() => {
    if (!m || !cur || cur === m.symbol.code) return;
    const ac = new AbortController();
    const from = Date.parse(`${m.month}-01T00:00:00+09:00`) / 1000 - 60 * 86_400;
    const to = Date.parse(`${m.month}-01T00:00:00+09:00`) / 1000 + 40 * 86_400;
    fetchBars(cur, "1d", ac.signal)
      .then(({ bars }) => {
        const ymd = (s: number) => new Date((s + 9 * 3600) * 1000).toISOString().slice(0, 10);
        setExtra({ code: cur, candles: bars.filter((b) => b.time >= from && b.time <= to).map((b) => [ymd(b.time), b.open, b.high, b.low, b.close, b.volume] as SimCandle) });
      })
      .catch(() => !ac.signal.aborted && setExtra({ code: cur, candles: [] }));
    return () => ac.abort();
  }, [m, cur]);
  const candles = !m || !cur ? [] : cur === m.symbol.code ? m.candles : extra?.code === cur ? extra.candles : [];
  const last = candles.at(-1);

  // 차트 메모: 매수 근거(사전 기록) · 매도 근거 · 종목 노트
  const memos: Memo[] = [
    ...trades.filter((x) => x.code === cur).flatMap((x) => [
      { d: x.entry.d, text: x.entry.why, pre: true },
      { d: x.exit.d, text: x.exit.why, pre: false },
    ]),
    ...(m?.notes ?? []).filter((n) => n.code === cur && n.type !== "carry").map((n) => ({ d: n.d, text: n.text, pre: true })),
  ]
    .filter((x) => x.text)
    .sort((a, b) => a.d.localeCompare(b.d));
  const shownMemos = tab === "pre" ? memos.filter((x) => x.pre) : memos;
  const allNotes = (m?.notes ?? []).length + trades.length * 2;
  const preRate = trades.length ? Math.round((trades.filter((x) => x.entry.why).length / trades.length) * 100) : null;

  function search() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = codes.find(([c, n]) => c.includes(q) || n.toLowerCase().includes(q));
    if (hit) setCode(hit[0]);
  }

  return (
    <main className="mk-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap ar-pt">
        <Link href="/archive/purchases" className="ar-pt-back">
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          트레이더 목록
        </Link>
        <div className="ar-pt-head">
          <h1>
            {t?.name ?? id}의{" "}
            {months.length > 1 ? (
              <MonthPicker months={months} value={month ?? months[0]} onChange={(m) => (setPick(m), setCode(null))} />
            ) : (
              <span>{month ? `${Number(month.slice(5))}월` : ""}</span>
            )}{" "}
            전략
          </h1>
        </div>

        {!month ? (
          <p className="mk-card mk-empty">이 트레이더를 구독하면 전략을 볼 수 있어요.</p>
        ) : !m ? (
          detail ? <p className="mk-card mk-empty">전략을 불러오지 못했어요.</p> : <div className="mk-card mk-empty"><BeeLoader /></div>
        ) : (
          <>
            <section className="mk-card ar-pt-trades">
              <h2>거래 내역</h2>
              <div className="ar-pt-table">
                <div className="th">
                  <span>종목명</span>
                  <span>매수 시기</span>
                  <span>매도 시기</span>
                  <span title="매수가 대비 매도가 (수수료 빼기 전)">수익률 ⓘ</span>
                </div>
                <div className="tb">
                  {trades.map((x) => (
                    <button key={`${x.code}:${x.entry.d}`} type="button" className={x.code === cur ? "tr on" : "tr"} onClick={() => setCode(x.code)}>
                      <strong>{x.name}</strong>
                      <span>{md(x.entry.d)}</span>
                      <span>{md(x.exit.d)}</span>
                      <b className={tone(x.ret)}>{pct(x.ret)}</b>
                    </button>
                  ))}
                  {carry.map((n) => (
                    <button key={`carry:${n.code}`} type="button" className={n.code === cur ? "tr on" : "tr"} onClick={() => setCode(n.code!)}>
                      <strong>{n.name ?? n.code}</strong>
                      <span>
                        <em className="ar-pt-hold">보유 중</em>
                      </span>
                      <span />
                      <small>연결된 매매가 없습니다.</small>
                    </button>
                  ))}
                  {!trades.length && !carry.length && <p className="ar-pt-empty">이 달에는 매매가 없어요.</p>}
                </div>
              </div>
            </section>

            <div className="ar-pt-tools">
              <div className="ar-pt-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>
                  전체 노트
                </button>
                <button type="button" role="tab" aria-selected={tab === "pre"} onClick={() => setTab("pre")}>
                  사전 노트
                </button>
              </div>
              <form
                className="ar-pt-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  search();
                }}
              >
                <span aria-hidden>⌕</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${curName} (${cur})`} aria-label="종목 검색" list="ar-pt-codes" />
                <datalist id="ar-pt-codes">
                  {codes.map(([c, n]) => (
                    <option key={c} value={n} />
                  ))}
                </datalist>
                <button type="submit">검색</button>
              </form>
            </div>

            <section className="mk-card ar-pt-chart">
              <div className="ar-pt-chart-main">
                <div className="ar-pt-sym">
                  <strong>{curName}</strong> <small>{cur}</small>
                </div>
                {last && (
                  <p className="ar-pt-ohlc">
                    <b>일봉</b> 시 {last[1].toLocaleString("ko-KR")} 고 {last[2].toLocaleString("ko-KR")} 저 {last[3].toLocaleString("ko-KR")} 종 {last[4].toLocaleString("ko-KR")}
                  </p>
                )}
                {candles.length ? (
                  <StrategyChart candles={candles} trades={trades} notes={m.notes} ind={cur === m.symbol.code ? m.ind : undefined} code={cur ?? ""} dark={dark} currency={detail?.data?.market === "US" ? "USD" : "KRW"} />
                ) : (
                  cur !== m.symbol.code && extra?.code === cur ? <p className="mk-empty">이 종목의 그 달 차트 데이터가 없어요.</p> : <BeeLoader size="sm" />
                )}
              </div>
              <aside className="ar-pt-memos">
                <h3>차트 노트</h3>
                <small>
                  {curName} · 노트 {shownMemos.length}건
                </small>
                <ul>
                  {shownMemos.map((x, i) => (
                    <li key={i}>
                      <div>
                        {x.pre && <em>사전 기록</em>}
                        <time>{md(x.d)}</time>
                      </div>
                      <p>{x.text}</p>
                    </li>
                  ))}
                  {!shownMemos.length && <li className="empty">노트가 없어요.</li>}
                </ul>
              </aside>
            </section>

            <h2 className="ar-pt-etc-title">기타 정보</h2>
            <div className="ar-pt-etc">
              <div>
                <small>열람 가능한 노트</small>
                <b>{allNotes}건</b>
              </div>
              <div>
                <small>매매 거래</small>
                <b>{trades.length}건</b>
              </div>
              <div>
                <small title="매매가 끝난 종목 전체 중에서 매수/매도 기준이 사전에 기록된 종목의 비율">사전 기록 작성률 ⓘ</small>
                <b>{preRate === null ? "—" : `${preRate}%`}</b>
              </div>
              <div>
                <small>이행률</small>
                <b>{m.follow}%</b>
              </div>
            </div>

            <UseStrategy traderId={id} traderName={t?.name ?? id} months={months} current={month} />
          </>
        )}
      </div>
    </main>
  );
}
