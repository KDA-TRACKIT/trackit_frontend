"use client";
// 내 노트에서 올린 전략의 상세 (2026-11-22): GET /market/strategies/{id}/content
//   머리(판매자 · 시장 · 섹터 · 기간) → 숫자(노트 · 매매 · 기간) → 차트(고른 종목 일봉 + 매수 · 매도 · 노트 쓴 날) + Note(이 종목 / 전체) → 매매 내역
//   노트 · 매매는 본인 · 지금 구독 중인 사람만 (아니면 잠금 안내). 기간 안 노트는 판매자가 고르지 않고 다 들어감
//   지수 · 선물 · 환율 노트는 같은 시장의 모든 섹터 전략에 같이 들어가 있음 (서버 lib/market/common-notes)
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import SiteHeader from "../../../SiteHeader";
import BeeLoader from "../../../BeeLoader";
import { apiRequest, errorMessage } from "../../../../lib/api/client";
import { isSpecialCode } from "../../../../lib/special-symbols";
import NotesChart from "./NotesChart";
import "../../marketplace.css";
import "../../../archive/archive.css";
import "../../strategy-detail.css";

type Note = { id: string; at: string; symbol: string; name: string; text: string; kind: string | null; plan: boolean };
type Trade = { id: string; symbol: string; side: "BUY" | "SELL"; price: number; quantity: number; currency: string; at: string };
type Content = {
  id: string;
  title: string;
  sector: string;
  market: string | null;
  periodStart: string;
  periodEnd: string | null;
  ongoing: boolean;
  seller: { name: string };
  counts: { notes: number; trades: number };
  mine: boolean;
  access: "full" | "locked";
  notes?: Note[];
  trades?: Trade[];
};

const KST = 9 * 3_600_000;
const ymd = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
/** 끝은 다음 날 0시로 저장돼 있어 마지막 날로 */
const lastDay = (iso: string) => new Date(Date.parse(iso) - 1 + KST).toISOString().slice(0, 10);
const dot = (d: string) => d.replace(/-/g, ".");
const md = (iso: string) => ymd(iso).slice(5).replace("-", ".");
const marketLabel = (m: string | null) => (m === "US" ? "해외 주식" : m === "KR" ? "국내 주식" : m);
const price = (n: number, cur: string) => (cur === "KRW" ? `${Math.round(n).toLocaleString("ko-KR")}원` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

export default function MarketStrategyPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [scope, setScope] = useState<"symbol" | "all">("all");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let live = true;
    apiRequest<Content>(`/market/strategies/${id}/content`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorMessage(e)));
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      live = false;
      mo.disconnect();
    };
  }, [id]);

  // 종목 목록: 매매한 종목 먼저, 그다음 노트가 많은 종목 (지수 · 선물 · 환율도 종목처럼)
  const symbols = useMemo(() => {
    const m = new Map<string, { code: string; name: string; notes: number; trades: number }>();
    for (const n of data?.notes ?? []) {
      const g = m.get(n.symbol) ?? { code: n.symbol, name: n.name, notes: 0, trades: 0 };
      g.notes += 1;
      m.set(n.symbol, g);
    }
    for (const t of data?.trades ?? []) {
      const g = m.get(t.symbol) ?? { code: t.symbol, name: t.symbol, notes: 0, trades: 0 };
      g.trades += 1;
      m.set(t.symbol, g);
    }
    return [...m.values()].sort((a, b) => b.trades - a.trades || b.notes - a.notes);
  }, [data]);
  const cur = sel ?? symbols[0]?.code ?? null;
  const curName = symbols.find((s) => s.code === cur)?.name ?? cur ?? "";
  const curTrades = useMemo(() => (data?.trades ?? []).filter((t) => t.symbol === cur), [data, cur]);
  const curNotes = useMemo(() => (data?.notes ?? []).filter((n) => n.symbol === cur), [data, cur]);
  const noteDays = useMemo(() => curNotes.map((n) => ymd(n.at)), [curNotes]);
  const shownNotes = [...(scope === "symbol" ? curNotes : (data?.notes ?? []))].reverse();

  if (error) {
    return (
      <main className="mk-page">
        <SiteHeader active="marketplace" />
        <div className="mk-wrap">
          <p className="mk-card mk-empty">{error}</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mk-page">
        <SiteHeader active="marketplace" />
        <div className="mk-wrap">
          <div className="mk-card mk-empty">
            <BeeLoader />
          </div>
        </div>
      </main>
    );
  }

  const from = ymd(data.periodStart);
  const to = data.periodEnd ? lastDay(data.periodEnd) : ymd(new Date().toISOString());
  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap ar-wrap sd">
        <Link href="/marketplace" className="ar-pt-back">
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          전략 마켓
        </Link>

        <div className="sd-body">
          <section className="mk-card sd-head">
            <div className="sd-head-top">
              <small>
                {[data.seller.name, marketLabel(data.market), data.sector].filter(Boolean).join(" · ")} · {dot(from)} ~ {data.ongoing ? `${dot(to)} (진행 중)` : dot(to)}
              </small>
            </div>
            <h1>
              {data.title}
              {data.mine && <span className="mk-mine">내 전략</span>}
            </h1>
          </section>

          <div className="ar-pt-etc sd-stats">
            <div>
              <small>노트</small>
              <b>{data.counts.notes}건</b>
            </div>
            <div>
              <small>매매 거래</small>
              <b>{data.counts.trades}건</b>
            </div>
            <div>
              <small>기간</small>
              <b>{Math.max(1, Math.round((Date.parse(`${to}T00:00:00+09:00`) - Date.parse(`${from}T00:00:00+09:00`)) / 86_400_000) + 1)}일</b>
            </div>
          </div>

          {data.access === "locked" ? (
            <section className="mk-card mk-sim-lock">
              <h2>구독하면 볼 수 있어요</h2>
              <p>
                이 기간에 {data.seller.name}님이 쓴 노트 {data.counts.notes}건과 매매 {data.counts.trades}건이 모두 들어 있어요.
              </p>
            </section>
          ) : (
            <>
              {symbols.length > 0 && (
                <div className="sd-chips ms-symbols" role="group" aria-label="종목 고르기">
                  {symbols.map((s) => (
                    <button key={s.code} type="button" aria-pressed={cur === s.code} onClick={() => setSel(s.code)}>
                      {s.name}
                      {isSpecialCode(s.code) ? "" : ` ${s.notes + s.trades}`}
                    </button>
                  ))}
                </div>
              )}

              <section className="mk-card ar-pt-chart">
                <div className="ar-pt-chart-main">
                  <div className="ar-pt-sym">
                    <strong>{curName}</strong> <small>{cur}</small>
                  </div>
                  {cur ? <NotesChart code={cur} from={from} to={to} trades={curTrades} noteDays={noteDays} dark={dark} /> : <p className="mk-empty">이 기간에 쓴 노트가 없어요.</p>}
                </div>
                <aside className="ar-pt-memos sd-memos">
                  <h3>Note</h3>
                  <div className="sd-scope" role="tablist" aria-label="노트 범위">
                    <button type="button" role="tab" aria-selected={scope === "symbol"} onClick={() => setScope("symbol")}>
                      {curName} {curNotes.length}건
                    </button>
                    <button type="button" role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")}>
                      전체 {data.notes?.length ?? 0}건
                    </button>
                  </div>
                  <ul>
                    {shownNotes.map((n) => (
                      <li key={n.id}>
                        <div>
                          <em className={`sd-kind ${n.plan ? "plan" : isSpecialCode(n.symbol) ? "market" : "stock"}`}>{n.plan ? "사전 기록" : isSpecialCode(n.symbol) ? "시장 노트" : "종목 노트"}</em>
                          {scope === "all" && <b>{n.name}</b>}
                          <time>{md(n.at)}</time>
                        </div>
                        <p>{n.text}</p>
                      </li>
                    ))}
                    {!shownNotes.length && <li className="empty">노트가 없어요.</li>}
                  </ul>
                </aside>
              </section>

              <section className="mk-card ar-pt-trades sd-trades">
                <div className="sd-trades-head">
                  <h2>거래 내역</h2>
                </div>
                <div className="ar-pt-table sd-table ms-trades">
                  <div className="th">
                    <span>종목명</span>
                    <span>날짜</span>
                    <span>구분</span>
                    <span>가격</span>
                    <span>수량</span>
                  </div>
                  <div className="tb">
                    {(data.trades ?? [])
                      .slice()
                      .reverse()
                      .map((t) => (
                        <button key={t.id} type="button" className={cur === t.symbol ? "tr on" : "tr"} onClick={() => setSel(t.symbol)}>
                          <strong>{symbols.find((s) => s.code === t.symbol)?.name ?? t.symbol}</strong>
                          <span>{md(t.at)}</span>
                          <span className={t.side === "BUY" ? "up" : "down"}>{t.side === "BUY" ? "매수" : "매도"}</span>
                          <span>{price(t.price, t.currency)}</span>
                          <span>{t.quantity.toLocaleString("ko-KR")}</span>
                        </button>
                      ))}
                    {!data.trades?.length && <p className="ar-pt-empty">이 기간에는 매매가 없어요.</p>}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
