"use client";
// 전략 상세 — 어느 경로로 열어도 같은 화면 (2026-11-21 통일, Figma '통일안 · 어느 경로로 열어도 같은 전략 상세')
//   전략 마켓(/marketplace/{id}/strategies/{전략 번호})과 전략보관함(/archive/purchases/{id}/{전략 번호})이 이 화면 하나를 씀
//   경로마다 다른 건 상단 메뉴 활성 상태와 뒤로 가기 글자뿐
//   순서: 전략 머리(트레이더 · 기간 · 다른 전략) → 지표 5개 → 매매 규칙 → 거래 내역(달 칩 · 계획 열)
//        → 노트 탭 · 종목 검색 → 차트 + 차트 노트(이 종목 / 전략 전체) → 산 전략 활용하기
//   차트와 노트는 전략보관함 모양 (차트 한 장 + 옆 노트). 예전 전략 마켓의 '월별 대표 차트'는 달 칩, '이 전략의 기록'은 차트 노트 '전략 전체'로
//   내용은 /strategy-data/{id}/{전략 번호} (서버가 구독을 확인하고 그 전략 기간의 달 기록을 보냄). 구독 전이면 잠금 + 구독 버튼
//   주소 끝이 달(YYYY-MM)이면 그 달이 들어 있는 전략을 열고 그 달 칩을 고른 채로 시작 (예전 달 단위 링크)
import { ChevronDown, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SiteHeader from "../SiteHeader";
import BeeLoader from "../BeeLoader";
import UseStrategy from "../archive/purchases/[id]/UseStrategy";
import { opened, subscribed, usePasses } from "../../lib/purchases";
import { fetchStrategyMonth } from "../../lib/strategy-data";
import { fetchBars } from "../../lib/market-data";
import { markFreeView } from "../../lib/free-views";
import { useMyTrader } from "../../lib/my-trader";
import { pct, periodLabel, strategiesOf, strategyOf, tone, traderById, type Strategy } from "./data";
import { StrategyButton, useNotice } from "./parts";
import StrategyChart, { type SimCandle } from "./StrategyChart";
import { useDark, type SimDetail, type SimMonth } from "./GuessFirst";
import "./marketplace.css";
import "../archive/archive.css";
import "./strategy-detail.css";

export type StrategyEntry = "market" | "archive";

/** 노트 한 줄: 매매의 매수 근거(사전 기록) · 매도 이유 + 기록(종목 노트 · 복기 · 증시 노트 · 이어진 보유) */
type Kind = "plan" | "exit" | "stock" | "review" | "market" | "carry";
type Rec = {
  d: string;
  kind: Kind;
  month: string;
  code?: string;
  name?: string;
  text: string;
};
const KIND: Record<Kind, string> = {
  plan: "사전 기록",
  exit: "매도",
  stock: "종목 노트",
  review: "복기",
  market: "증시 노트",
  carry: "이어진 보유",
};
/** '사전 노트' 탭에 드는 것: 매수 전에 남긴 근거 · 종목 노트 (복기 · 매도 이유는 사후) */
const PRE: Kind[] = ["plan", "stock"];
/** 같은 날 안의 순서 */
const ORDER: Record<Kind, number> = {
  market: 0,
  stock: 1,
  plan: 2,
  carry: 3,
  exit: 4,
  review: 5,
};
const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;

export default function StrategyDetail({ entry, traderId, strategyKey }: { entry: StrategyEntry; traderId: string; strategyKey: string }) {
  const t = traderById(traderId);
  const s = t ? strategyOf(t, strategyKey) : undefined;
  const passes = usePasses();
  const my = useMyTrader();
  const dark = useDark();
  const { notify, node } = useNotice();
  const own = !!t && my === t.id;
  // 구독 중이거나 예전에 달로 연 기록이 있으면 열림. 내가 올린 전략이면 구독 없이 봄 (서버 /strategy-data 도 같은 판정)
  const isOpen = !!t && !!s && (own || [s.key, ...s.months].some((r) => opened(passes, t.id, r)));
  const unlocked = !!s?.free || isOpen;
  const sKey = s?.key ?? "";
  const reqKey = `${traderId}/${sKey}/${isOpen}`;
  const [detail, setDetail] = useState<{
    key: string;
    data: SimDetail | null;
  } | null>(null);

  useEffect(() => {
    if (!sKey) return;
    let cancelled = false;
    fetchStrategyMonth(traderId, sKey)
      .then((data) => !cancelled && setDetail({ key: reqKey, data }))
      .catch(() => !cancelled && setDetail({ key: reqKey, data: null }));
    return () => {
      cancelled = true;
    };
  }, [traderId, sKey, reqKey]);

  // 무료 전략을 열면 전략보관함에 남김 (구독 없이 본 것도)
  const freeKey = t && s?.free ? `${t.id}|${t.name}|${s.key}|${s.title}` : "";
  useEffect(() => {
    if (!freeKey) return;
    const [id, name, key, ...title] = freeKey.split("|");
    markFreeView({
      traderId: id,
      traderName: name,
      month: key,
      title: title.join("|"),
    });
  }, [freeKey]);

  // 이 전략 기간의 달 기록 (오래된 것부터)
  const monthsKey = s?.months.join(",") ?? "";
  const loading = detail?.key !== reqKey;
  const ms: SimMonth[] = loading || !detail?.data ? [] : detail.data.months.filter((x) => monthsKey.split(",").includes(x.month)).sort((a, b) => a.month.localeCompare(b.month));
  const allTrades = ms.flatMap((m) => m.trades);

  // 달 칩 (주소가 달이면 그 달로 시작) · 고른 매매(달 + 종목) · 노트 탭 · 노트 범위 · 검색
  const [mon, setMon] = useState<string | null>(/^\d{4}-\d{2}$/.test(strategyKey) ? strategyKey : null);
  const [sel, setSel] = useState<{ month: string; code: string } | null>(null);
  const [tab, setTab] = useState<"all" | "pre">("all");
  const [scope, setScope] = useState<"symbol" | "all">("symbol");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<{
    key: string;
    candles: SimCandle[];
  } | null>(null);

  const curMonth = mon && ms.some((m) => m.month === mon) ? mon : null;
  // 기본: 고른 달(없으면 마지막 달)의 대표 종목 = 예전 '월별 대표 차트'
  const base = curMonth ? ms.find((m) => m.month === curMonth) : ms.at(-1);
  const cur = sel && ms.some((m) => m.month === sel.month) ? sel : base ? { month: base.month, code: base.symbol.code } : null;
  const curKey = cur ? `${cur.month}:${cur.code}` : "";
  const curM = cur ? ms.find((m) => m.month === cur.month) : undefined;

  // 종목 이름 (차트 대표 종목 · 매매 · 종목 노트)
  const names = new Map<string, string>();
  for (const m of ms) {
    names.set(m.symbol.code, m.symbol.name);
    for (const x of m.trades) names.set(x.code, x.name);
    for (const n of m.notes ?? []) if (n.code && n.name) names.set(n.code, n.name);
  }
  const curName = cur ? (names.get(cur.code) ?? cur.code) : "";

  // 대표 종목이 아니면 그 달 앞뒤 일봉을 따로 받음 (curKey = "YYYY-MM:종목코드", repCode = 그 달 대표 종목)
  const repCode = curM?.symbol.code ?? "";
  useEffect(() => {
    const month = curKey.slice(0, 7);
    const code = curKey.slice(8);
    if (!repCode || !code || code === repCode) return;
    const ac = new AbortController();
    const start = Date.parse(`${month}-01T00:00:00+09:00`) / 1000;
    const from = start - 60 * 86_400;
    const to = start + 40 * 86_400;
    fetchBars(code, "1d", ac.signal)
      .then(({ bars }) => {
        const ymd = (sec: number) => new Date((sec + 9 * 3600) * 1000).toISOString().slice(0, 10);
        setExtra({
          key: curKey,
          candles: bars.filter((b) => b.time >= from && b.time <= to).map((b) => [ymd(b.time), b.open, b.high, b.low, b.close, b.volume] as SimCandle),
        });
      })
      .catch(() => !ac.signal.aborted && setExtra({ key: curKey, candles: [] }));
    return () => ac.abort();
  }, [curKey, repCode]);
  const candles = !curM || !cur ? [] : cur.code === curM.symbol.code ? curM.candles : extra?.key === curKey ? extra.candles : [];
  const last = candles.at(-1);

  // 노트 (전략 기간 전체, 날짜순)
  const recs: Rec[] = ms
    .flatMap((m) => [
      ...m.trades.flatMap((x): Rec[] => [
        {
          d: x.entry.d,
          kind: "plan",
          month: m.month,
          code: x.code,
          name: x.name,
          text: x.entry.why,
        },
        {
          d: x.exit.d,
          kind: "exit",
          month: m.month,
          code: x.code,
          name: x.name,
          text: x.exit.why,
        },
      ]),
      ...(m.notes ?? []).map((n): Rec => ({
        d: n.d,
        kind: n.type,
        month: m.month,
        code: n.code,
        name: n.name,
        text: n.text,
      })),
    ])
    .filter((r) => r.text)
    .sort((a, b) => a.d.localeCompare(b.d) || ORDER[a.kind] - ORDER[b.kind]);
  const byTab = (list: Rec[]) => (tab === "pre" ? list.filter((r) => PRE.includes(r.kind)) : list);
  // 이 종목: 고른 매매가 있는 달의 그 종목 것 (차트에 보이는 달과 같게). 전략 전체: 증시 노트 · 이어진 보유까지 날짜순
  const symbolList = cur ? byTab(recs.filter((r) => r.month === cur.month && r.code === cur.code && r.kind !== "market" && r.kind !== "carry")) : [];
  const allList = byTab(recs);
  const shown = scope === "all" ? allList : symbolList;

  // 산 전략 활용하기가 근거로 쓰는 달: 구독으로 연 달 + 예전에 연 달 + 무료 전략 (전략보관함과 같은 계산)
  const tList = t ? strategiesOf(t) : [];
  const openMonths = t
    ? [
        ...new Set([
          ...(subscribed(passes, t.id) ? tList.flatMap((x) => x.months) : []),
          ...passes.filter((p) => p.traderId === t.id && p.used).map((p) => p.used!.month),
          ...tList.filter((x) => x.free).flatMap((x) => x.months),
        ]),
      ]
        .sort()
        .reverse()
    : [];

  const back =
    entry === "market"
      ? {
          href: t ? `/marketplace/${t.id}` : "/marketplace",
          label: t?.name ?? "전략 마켓",
        }
      : { href: "/archive/purchases", label: "트레이더 목록" };
  const hrefOf = (key: string) => (entry === "market" ? `/marketplace/${traderId}/strategies/${key}` : `/archive/purchases/${traderId}/${key}`);

  if (!t || !s) {
    return (
      <main className="mk-page">
        <SiteHeader active={entry === "market" ? "marketplace" : "archive"} />
        <div className="mk-wrap ar-wrap sd">
          <Link href={back.href} className="ar-pt-back">
            <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
            {back.label}
          </Link>
          <p className="mk-card mk-empty">전략을 찾을 수 없어요.</p>
        </div>
      </main>
    );
  }

  const years = new Set(ms.map((m) => m.month.slice(0, 4)));
  const monthChip = (m: string) => (years.size > 1 ? `${m.slice(2, 4)}년 ${Number(m.slice(5))}월` : `${Number(m.slice(5))}월`);
  const loaded = unlocked && !loading && ms.length > 0;
  const tradeCount = loaded ? allTrades.length : (s.trades ?? 0);
  const noteCount = loaded ? recs.length : s.memos;
  const preRate = loaded && allTrades.length ? `${Math.round((allTrades.filter((x) => x.entry.why).length / allTrades.length) * 100)}%` : "—";
  const rows = (curMonth ? ms.filter((m) => m.month === curMonth) : ms).flatMap((m) => m.trades.map((tr) => ({ month: m.month, tr }))).sort((a, b) => a.tr.entry.d.localeCompare(b.tr.entry.d));
  const market = detail?.data?.market;

  function search() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = [...names].find(([c, n]) => c.toLowerCase().includes(q) || n.toLowerCase().includes(q));
    if (!hit) return notify(`이 전략에 '${query.trim()}' 종목이 없어요.`);
    const code = hit[0];
    const has = (m: SimMonth) => m.symbol.code === code || m.trades.some((x) => x.code === code) || (m.notes ?? []).some((n) => n.code === code);
    // 고른 달에 있으면 그 달, 아니면 그 종목이 나온 가장 최근 달 (달 칩은 전체로)
    const target = (curMonth ? ms.find((m) => m.month === curMonth && has(m)) : undefined) ?? [...ms].reverse().find(has);
    if (!target) return;
    if (curMonth && target.month !== curMonth) setMon(null);
    setSel({ month: target.month, code });
    setQuery("");
  }

  return (
    <main className="mk-page">
      <SiteHeader active={entry === "market" ? "marketplace" : "archive"} />
      <div className="mk-wrap ar-wrap sd">
        <Link href={back.href} className="ar-pt-back">
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          {back.label}
        </Link>

        <div className="sd-body">
          {/* 1. 전략 머리: 트레이더 · 시장 · 섹터 · 기간 / 제목 / 정정 표시 / 같은 트레이더의 다른 전략 */}
          <section className="mk-card sd-head">
            <div className="sd-head-top">
              <small>
                {t.name} · {s.market} · {s.sector} · {periodLabel(s, t.asOf)}
                {s.free ? " · 무료" : ""}
              </small>
              <StrategyPicker list={tList} current={s.key} hrefOf={hrefOf} traderName={t.name} asOf={t.asOf} />
            </div>
            <h1>
              {s.title}
              {own && <span className="mk-mine">내 전략</span>}
            </h1>
            {/* 원본은 그대로 보존, 정정 · 사후 해설은 따로 (구독 구매 정책) */}
            <p className="mk-sim-origin">✓ 최초 확정본 그대로 · 정정 0건</p>
          </section>

          {/* 2. 지표 (예전 전략 마켓 숫자 + 전략보관함 기타 정보) */}
          <div className="ar-pt-etc sd-stats">
            <div>
              <small>기간 수익률</small>
              <b className={tone(s.ret)}>{pct(s.ret)}</b>
            </div>
            <div>
              <small>매매 거래</small>
              <b>{tradeCount}건</b>
            </div>
            <div>
              <small>열람 가능한 노트</small>
              <b>{noteCount}건</b>
            </div>
            <div>
              <small title="매매가 끝난 종목 전체 중에서 매수 기준이 사전에 기록된 매매의 비율">사전 기록 작성률 ⓘ</small>
              <b>{preRate}</b>
            </div>
            <div>
              <small title="계획(진입 · 손절 · 목표)대로 한 매매의 비율 (이행률)">계획대로 한 비율</small>
              <b>{s.follow}%</b>
            </div>
          </div>

          {!unlocked && my === undefined ? (
            <div className="mk-card mk-empty">
              <BeeLoader />
            </div>
          ) : !unlocked ? (
            <section className="mk-card mk-sim-lock">
              <strong>이 전략에 담긴 것 (구매 전 미리 보기)</strong>
              <ul className="mk-sim-peek">
                <li>
                  <span>이 기간에 진입한 매매</span>
                  <b>{s.trades ?? 0}건</b>
                </li>
                <li>
                  <span>메모</span>
                  <b>{s.memos}개</b>
                </li>
                <li>
                  <span>다룬 종목</span>
                  <b>{s.symbols?.length ? s.symbols.join(", ") : "매매 없음 (관찰 · 노트)"}</b>
                </li>
                {s.sample && (
                  <li className="wide">
                    <span>전략 설명 샘플</span>
                    <b>“{s.sample}”</b>
                  </li>
                )}
              </ul>
              <p>열면 매매 규칙, 거래 내역, 차트에 그은 선과 매수 · 매도, 노트를 날짜순으로, 계획대로 했는지까지 볼 수 있어요. 매매는 진입한 날이 들어 있는 전략에 들어가요.</p>
              <div className="mk-buyrow">
                <StrategyButton trader={t} strategy={s} className="mk-primary" notify={notify} />
              </div>
            </section>
          ) : loading ? (
            <div className="mk-card mk-empty">
              <BeeLoader />
            </div>
          ) : !ms.length || !detail?.data ? (
            <p className="mk-card mk-empty">이 전략 내용을 불러오지 못했어요.</p>
          ) : (
            <>
              {/* 3. 매매 규칙: 그 기간에 쓰던 규칙 · 종목은 그 기간에 실제로 매매한 것 */}
              <section className="mk-card mk-sim-rule">
                <h2>매매 규칙 · {s.rule?.name ?? detail.data.rule.name}</h2>
                <p>{s.rule?.desc ?? detail.data.rule.desc}</p>
                <small>매매 종목: {s.symbols?.length ? s.symbols.join(" · ") : "이 기간엔 매매 없음 (관찰 · 노트)"}</small>
              </section>

              {/* 4. 거래 내역: 기간 안의 매매 전부. 달 칩을 고르면 그 달 매매만, 차트는 그 달 대표 종목으로 */}
              <section className="mk-card ar-pt-trades sd-trades">
                <div className="sd-trades-head">
                  <h2>거래 내역</h2>
                  {ms.length > 1 && (
                    <div className="sd-chips" role="group" aria-label="달 고르기">
                      <button type="button" aria-pressed={!curMonth} onClick={() => (setMon(null), setSel(null))}>
                        전체 {allTrades.length}건
                      </button>
                      {ms.map((m) => (
                        <button key={m.month} type="button" aria-pressed={curMonth === m.month} onClick={() => (setMon(m.month), setSel(null))}>
                          {monthChip(m.month)} {m.trades.length}건
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ar-pt-table sd-table">
                  <div className="th">
                    <span>종목명</span>
                    <span>매수 시기</span>
                    <span>매도 시기</span>
                    <span title="매수가 대비 매도가 (수수료 빼기 전)">수익률 ⓘ</span>
                    <span>계획</span>
                  </div>
                  <div className="tb">
                    {rows.map(({ month, tr }) => {
                      const on = !!cur && cur.month === month && cur.code === tr.code;
                      return (
                        <button key={`${month}:${tr.code}:${tr.entry.d}`} type="button" className={on ? "tr on" : "tr"} aria-pressed={on} onClick={() => setSel({ month, code: tr.code })}>
                          <strong>{tr.name}</strong>
                          <span>{md(tr.entry.d)}</span>
                          <span>{md(tr.exit.d)}</span>
                          <b className={tone(tr.ret)}>{pct(tr.ret)}</b>
                          <span>
                            <i className={tr.followed ? "sd-plan ok" : "sd-plan no"}>{tr.followed ? "계획대로" : "계획과 다름"}</i>
                          </span>
                        </button>
                      );
                    })}
                    {!rows.length && <p className="ar-pt-empty">{curMonth ? "이 달에는 매매가 없어요." : "이 기간에는 매매가 없어요."}</p>}
                  </div>
                </div>
              </section>

              {/* 5. 노트 탭 · 종목 검색 */}
              <div className="ar-pt-tools">
                <div className="ar-pt-tabs" role="tablist" aria-label="노트 종류">
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
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={cur ? `${curName} (${cur.code})` : "종목 검색"} aria-label="종목 검색" list="sd-codes" />
                  <datalist id="sd-codes">
                    {[...names].map(([c, n]) => (
                      <option key={c} value={n} />
                    ))}
                  </datalist>
                  <button type="submit">검색</button>
                </form>
              </div>

              {/* 6. 차트 + 차트 노트 (전략보관함 모양) */}
              {cur && curM && (
                <section className="mk-card ar-pt-chart">
                  <div className="ar-pt-chart-main">
                    <div className="ar-pt-sym">
                      <strong>{curName}</strong> <small>{cur.code}</small>
                    </div>
                    {last && (
                      <p className="ar-pt-ohlc">
                        <b>일봉</b> 시 {last[1].toLocaleString("ko-KR")} 고 {last[2].toLocaleString("ko-KR")} 저 {last[3].toLocaleString("ko-KR")} 종 {last[4].toLocaleString("ko-KR")}
                      </p>
                    )}
                    {candles.length ? (
                      <StrategyChart
                        candles={candles}
                        trades={curM.trades}
                        notes={curM.notes}
                        ind={cur.code === curM.symbol.code ? curM.ind : undefined}
                        code={cur.code}
                        dark={dark}
                        currency={market === "US" ? "USD" : "KRW"}
                      />
                    ) : cur.code !== curM.symbol.code && extra?.key === curKey ? (
                      <p className="mk-empty">이 종목의 그 달 차트 데이터가 없어요.</p>
                    ) : (
                      <BeeLoader size="sm" />
                    )}
                  </div>
                  <aside className="ar-pt-memos sd-memos">
                    <h3>차트 노트</h3>
                    <div className="sd-scope" role="tablist" aria-label="노트 범위">
                      <button type="button" role="tab" aria-selected={scope === "symbol"} onClick={() => setScope("symbol")}>
                        {curName} {symbolList.length}건
                      </button>
                      <button type="button" role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")}>
                        전략 전체 {allList.length}건
                      </button>
                    </div>
                    <ul>
                      {shown.map((r, i) => (
                        <li key={`${r.d}:${r.kind}:${i}`}>
                          <div>
                            <em className={`sd-kind ${r.kind}`}>{KIND[r.kind]}</em>
                            {scope === "all" && r.name && <b>{r.name}</b>}
                            <time>{md(r.d)}</time>
                          </div>
                          <p>{r.text}</p>
                        </li>
                      ))}
                      {!shown.length && <li className="empty">{tab === "pre" ? "사전 노트가 없어요." : "노트가 없어요."}</li>}
                    </ul>
                  </aside>
                </section>
              )}

              {/* 7. 산 전략 활용하기 (구매자용, 내 전략에선 숨김) */}
              {!own && openMonths.length > 0 && <UseStrategy traderId={t.id} traderName={t.name} months={openMonths} current={curMonth ?? ms.at(-1)!.month} />}
            </>
          )}
        </div>
      </div>
      {node}
    </main>
  );
}

/** 같은 트레이더의 다른 전략 고르기 (예전 전략보관함의 '달 고르기' 자리). 같은 경로 안에서 옮겨 감 */
function StrategyPicker({ list, current, hrefOf, traderName, asOf }: { list: Strategy[]; current: string; hrefOf: (key: string) => string; traderName: string; asOf?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (list.length < 2) return null;
  return (
    <div className="sd-picker" ref={ref}>
      <button type="button" className="sd-picker-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {traderName}의 다른 전략
        <ChevronDown size={16} strokeWidth={2.4} aria-hidden />
      </button>
      {open && (
        <ul className="sd-picker-menu" role="menu" aria-label={`${traderName}의 전략`}>
          {list.map((x) => (
            <li key={x.key}>
              <Link href={hrefOf(x.key)} role="menuitem" aria-current={x.key === current ? "page" : undefined} className={x.key === current ? "on" : ""} onClick={() => setOpen(false)}>
                <b>{x.title}</b>
                <small>
                  {x.sector} · {periodLabel(x, asOf)}
                  {x.free ? " · 무료" : ""}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
