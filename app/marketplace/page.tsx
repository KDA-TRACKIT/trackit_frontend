"use client";
// 전략 마켓: 트레이더를 한 줄씩 비교 (검색 · 기간별 수익률 · 필터 · 정렬 · 쪽 나눔)
//   데이터는 아직 예시(./data). 수익 초록 · 손실 빨강
//   검색어 · 기간 · 정렬 · 필터 · 쪽은 주소(?q=…)에 둔다 → 트레이더를 눌렀다가 돌아와도 그대로 (lib/market-list)
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { rememberListUrl } from "../../lib/market-list";
import { fitZoom } from "../../lib/fit-script";
import { SlidersHorizontal } from "lucide-react";
import SiteHeader from "../SiteHeader";
import { MARKETS, PERIODS, TRADERS, TYPES, listed, oneStock, pct, sellable, tone, won, type Period, type Trader } from "./data";
import { FavButton, Pager, Range2, Spark } from "./parts";
import "./marketplace.css";
import { getMarketRankings, type MarketRankings } from "../../lib/api/market-rankings";
import { useMyTrader } from "../../lib/my-trader";

const SORT_OPTIONS = [
  { key: "sales", label: "판매순" },
  { key: "pop", label: "인기순" },
  { key: "ret", label: "수익률순" },
  { key: "price-asc", label: "가격 낮은 순" },
  { key: "price", label: "가격 높은 순" },
] as const;
type Sort = (typeof SORT_OPTIONS)[number]["key"];
const DEFAULT_SORT: Sort = "pop";
type Filter = { mdd: [number, number]; ret: [number, number]; price: [number, number]; types: string[]; markets: string[] };
const NO_FILTER: Filter = { mdd: [0, 100], ret: [-100, 100], price: [0, 50000], types: [], markets: [] };
const PER_PAGE = 10;

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const filterCount = (f: Filter) =>
  (f.mdd[0] !== 0 || f.mdd[1] !== 100 ? 1 : 0) + (f.ret[0] !== -100 || f.ret[1] !== 100 ? 1 : 0) + (f.price[0] !== 0 || f.price[1] !== 50000 ? 1 : 0) + f.types.length + f.markets.length;

type ListState = { query: string; period: Period; sort: Sort; filter: Filter; page: number };

const range = (v: string | null, d: [number, number]): [number, number] => {
  const [a, b] = (v ?? "").split("~").map(Number);
  return v && Number.isFinite(a) && Number.isFinite(b) ? [a, b] : d;
};
const list2 = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

/** 주소 → 목록 상태 (없는 값은 기본값) */
function readState(sp: URLSearchParams): ListState {
  const period = sp.get("period") as Period | null;
  const sort = sp.get("sort");
  const sortOption = sort === "price-asc" ? sort : sort?.replace(/-asc$/, "");
  return {
    query: sp.get("q") ?? "",
    period: period && PERIODS.some((p) => p.key === period) ? period : "3m",
    sort: SORT_OPTIONS.find(({ key }) => key === sortOption)?.key ?? DEFAULT_SORT,
    filter: {
      mdd: range(sp.get("mdd"), NO_FILTER.mdd),
      ret: range(sp.get("ret"), NO_FILTER.ret),
      price: range(sp.get("price"), NO_FILTER.price),
      types: list2(sp.get("types")),
      markets: list2(sp.get("markets")),
    },
    page: Math.max(1, Number(sp.get("page")) || 1),
  };
}

/** 목록 상태 → 주소 (기본값은 빼서 짧게) */
function writeState(s: ListState) {
  const sp = new URLSearchParams();
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  if (s.query.trim()) sp.set("q", s.query.trim());
  if (s.period !== "3m") sp.set("period", s.period);
  if (s.sort !== DEFAULT_SORT) sp.set("sort", s.sort);
  if (!same(s.filter.mdd, NO_FILTER.mdd)) sp.set("mdd", s.filter.mdd.join("~"));
  if (!same(s.filter.ret, NO_FILTER.ret)) sp.set("ret", s.filter.ret.join("~"));
  if (!same(s.filter.price, NO_FILTER.price)) sp.set("price", s.filter.price.join("~"));
  if (s.filter.types.length) sp.set("types", s.filter.types.join(","));
  if (s.filter.markets.length) sp.set("markets", s.filter.markets.join(","));
  if (s.page > 1) sp.set("page", String(s.page));
  return sp.toString();
}

export default function MarketplacePage() {
  // useSearchParams 는 정적 빌드에서 Suspense 안에 있어야 함
  return (
    <Suspense fallback={<main className="mk-page" />}>
      <MarketplaceList />
    </Suspense>
  );
}

function MarketplaceList() {
  const [rankings, setRankings] = useState<MarketRankings | null>(null);
  const myTrader = useMyTrader();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const state = useMemo(() => readState(new URLSearchParams(sp.toString())), [sp]);
  const { query, period, sort, filter, page } = state;
  const [open, setOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [asOf] = useState(() => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "."));

  /** 상태 바꾸기 = 주소 바꾸기 (기록은 쌓지 않음: 뒤로 가기는 전 화면으로) */
  const update = (patch: Partial<ListState>) => {
    const qs = writeState({ ...state, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setPage = (p: number) => update({ page: p });

  // 트레이더 상세의 "트레이더 목록" 이 이 주소로 돌아오게
  useEffect(() => {
    rememberListUrl(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
  }, [pathname, sp]);

  useEffect(() => {
    const controller = new AbortController();
    void getMarketRankings(controller.signal).then((data) => {
      if (!controller.signal.aborted) setRankings(data);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (t: Trader) =>
      (!q || [t.name, t.tagline, t.intro, ...t.styles, ...t.indicators].some((s) => s.toLowerCase().includes(q))) &&
      -t.mdd >= filter.mdd[0] &&
      -t.mdd <= filter.mdd[1] &&
      ((filter.ret[0] === NO_FILTER.ret[0] && filter.ret[1] === NO_FILTER.ret[1]) ||
        (!oneStock(t, period) && t.returns[period] >= filter.ret[0] && t.returns[period] <= filter.ret[1])) &&
      t.price >= filter.price[0] &&
      (filter.price[1] >= 50000 || t.price <= filter.price[1]) &&
      (!filter.types.length || filter.types.includes(t.type)) &&
      (!filter.markets.length || filter.markets.includes(t.market));
    // 판매 심사로 숨기지 않음 (거르는 장치는 팀에서 따로 만듦)
    const out = TRADERS.filter(listed).filter(hit);
    const ret = (t: Trader) => (oneStock(t, period) ? -Infinity : t.returns[period]);
    const counts = sort === "sales" ? rankings?.subscribers : rankings?.honey;
    out.sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price") return b.price - a.price;
      if (sort === "ret") return ret(b) === ret(a) ? 0 : ret(b) > ret(a) ? 1 : -1;

      return (counts?.[b.id] ?? 0) - (counts?.[a.id] ?? 0);
    });
    return out;
  }, [query, period, sort, filter, rankings]);

  const per = PER_PAGE;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * per, cur * per);
  const periodLabel = PERIODS.find((p) => p.key === period)!.label;
  const returnLabel = period === "1m" ? "실시간 수익률" : `${periodLabel} 수익률`;
  const nFilter = filterCount(filter);

  return (
    <main className="mk-page mk-trader-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap">
        <h1 className="mk-title">트레이더</h1>

        <form
          className="mk-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ query: String(new FormData(e.currentTarget).get("q") ?? ""), page: 1 });
          }}
        >
          {/* 주소의 검색어가 바뀌면(돌아오기 · 지우기) 칸도 그 값으로 다시 */}
          <input key={query} name="q" defaultValue={query} placeholder="트레이더 이름, 매매 방식 등으로 검색하세요" aria-label="트레이더 검색" />
          <button type="submit">검색</button>
        </form>

        <div className="mk-result-head">
          <strong>
            {query.trim() ? `‘${query.trim()}’ ` : ""}검색 결과 <em>{list.length}</em>건
            {query.trim() && (
              <button type="button" className="mk-clear" onClick={() => update({ query: "", page: 1 })}>
                검색 지우기
              </button>
            )}
          </strong>
          <button type="button" className={`mk-filter-btn${nFilter ? " on" : ""}`} onClick={() => setOpen(true)} aria-label={nFilter ? `필터 ${nFilter}개 적용됨` : "필터"}>
            <SlidersHorizontal size={15} aria-hidden />
            필터
            {nFilter > 0 && <span className="mk-filter-count">{nFilter}</span>}
          </button>
        </div>
        <div className="mk-toolbar">
          <div className="mk-periods" role="radiogroup" aria-label="수익률 기간">
            {PERIODS.map((p) => {
              const tab = (
                <button key={p.key} type="button" role="radio" aria-checked={period === p.key} className={period === p.key ? "on" : ""} onClick={() => update({ period: p.key })}>
                  {p.label}
                </button>
              );
              if (p.key !== "all") return tab;
              // '전체' 오른쪽 위 작은 ? (탭과 겹치지 않게 바로 옆) — 누르면 어디로 가지 않고, 올리거나(누르면 초점) 말풍선으로 기간만 보여 줌
              return (
                <div key={p.key} className="mk-period-all">
                  {tab}
                  {period === "all" && (
                    <span className="mk-help" onMouseEnter={fitTip} onFocus={fitTip}>
                      <button type="button" className="mk-help-btn" aria-label="'전체' 기간 설명" aria-describedby="mk-help-all">
                        {/* 글꼴마다 '?' 높이가 달라 원 가운데에서 어긋나므로 그림으로 그림 (그림 상자 = 물음표 테두리 → 원 정가운데) */}
                        <svg viewBox="2.5 1.5 7 12.3" width="5" height="8.8" aria-hidden="true">
                          <path d="M3.5 5a2.5 2.5 0 1 1 4.415 1.607C7.401 7.22 6 7.6 6 8.3v.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="6" cy="12.65" r="1.15" fill="currentColor" />
                        </svg>
                      </button>
                      <span id="mk-help-all" role="tooltip" className="mk-help-tip">
                        전체는 첫 기록 달부터 {asOf}까지
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mk-tools">
            <div className="mk-sortdd" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setSortOpen(false)}>
              <button type="button" className="mk-sortdd-btn" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen((v) => !v)}>
                {SORT_OPTIONS.find(({ key }) => key === sort)?.label} <Image src="/marketplace/sort-chevron.svg" alt="" width={14} height={14} />
              </button>
              {sortOpen && (
                <ul className="mk-sortdd-list" role="listbox" aria-label="정렬">
                  {SORT_OPTIONS.map(({ key: k, label }) => (
                    <li key={k} className={k === "price-asc" ? "sep" : ""}>
                      <button type="button" role="option" aria-selected={sort === k} className={sort === k ? "on" : ""} onClick={() => (update({ sort: k, page: 1 }), setSortOpen(false))}>
                        {label} {sort === k && <span aria-hidden>✓</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {!shown.length ? (
          <p className="mk-card mk-empty">조건에 맞는 트레이더가 없어요. 검색어나 필터를 바꿔 보세요.</p>
        ) : (
          <div className="mk-trader-panel">
            <div className="mk-trader-columns" aria-hidden="true">
              <span>트레이더</span><span>수익률 추이</span><span>수익률</span><span>이행률</span><span>월 구독료</span>
            </div>
            <ul className="mk-trader-rows">
              {shown.map((trader) => (
                <TraderRow key={trader.id} trader={trader} period={period} returnLabel={returnLabel} honey={rankings?.honey[trader.id] ?? 0} mine={myTrader === trader.id} subscribers={rankings ? (rankings.subscribers[trader.id] ?? 0) : null} />
              ))}
            </ul>
          </div>
        )}
        <Pager page={cur} pages={pages} doubleChevron onPage={(p) => (setPage(p), window.scrollTo({ top: 0, behavior: "smooth" }))} />
      </div>

      {open && (
        <FilterModal
          initial={filter}
          onClose={() => setOpen(false)}
          onApply={(f) => {
            update({ filter: f, page: 1 });
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}

function TraderRow({ trader, period, returnLabel, honey, mine, subscribers }: { trader: Trader; period: Period; returnLabel: string; honey: number; /** 내가 올린 전략 */ mine: boolean; /** 지금 구독 중인 사람 수 (아직 못 받았으면 null) */ subscribers: number | null }) {
  const showReturn = !oneStock(trader, period);
  const curve = trader.curves?.[period];
  return (
    <li className="mk-trader-row">
      <FavButton id={trader.id} name={trader.name} outlineIcon={<Image src="/marketplace/favorite-star.svg" alt="" width={20} height={20} />} onIcon={<Image src="/marketplace/favorite-star-on.svg" alt="" width={20} height={20} />} />
      <Link className="mk-trader-row-link" href={`/marketplace/${trader.id}`}>
        <div className="mk-trader-who">
          <div className="mk-trader-name-line">
            <strong className="mk-trader-name">{trader.name}</strong>
            {mine && <span className="mk-mine">내 전략</span>}
            <span className="mk-trader-honey" title="받은 꿀 합계">
              <Image src="/home/leaderboard-honey.svg" alt="받은 꿀" width={11.42} height={14.3401} />
              {honey}
            </span>
            {subscribers !== null && <span className="mk-subs" title="지금 구독 중인 사람 수">구독자 {subscribers.toLocaleString("ko-KR")}명</span>}
          </div>
          <small>#{trader.tagline.replace(/^#\s*/, "")}</small>
        </div>
        <div className="mk-trader-trend" aria-hidden="true">
          {showReturn && curve ? <Spark equity={curve} w={140} h={44} /> : <span>—</span>}
        </div>
        <div className="mk-trader-metric">
          <span className="mk-trader-metric-label">{returnLabel}</span>
          {showReturn ? (
            <b className={tone(trader.returns[period])}>{pct(trader.returns[period])}</b>
          ) : (
            <b title="이 기간엔 매매가 없거나 한 종목만 매매해 수익률을 비교하지 않아요">—</b>
          )}
          {period === "all" && trader.monthly.length > 0 && <small className="mk-trader-span">{spanOf(trader)}</small>}
        </div>
        <div className="mk-trader-metric"><span className="mk-trader-metric-label">이행률</span><b>{trader.follow}%</b></div>
        <div className="mk-trader-metric mk-trader-price"><span className="mk-trader-metric-label">월 구독료</span><b>{sellable(trader) ? won(trader.price) : "—"}</b>{mine && <small className="mk-trader-span">내가 판매 중</small>}</div>
      </Link>
    </li>
  );
}

// 필터: 낙폭 · 수익률 · 가격 · 유형 · 국가 (정렬은 목록 위 드롭다운에서만)
function FilterModal({ initial, onClose, onApply }: { initial: Filter; onClose: () => void; onApply: (f: Filter) => void }) {
  const [f, setF] = useState<Filter>(initial);
  return (
    <div className="mk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mk-modal" role="dialog" aria-modal="true" aria-label="필터" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="mk-modal-head">
          <strong>필터</strong>
          <button type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <Range2 label="최대 낙폭 범위" min={0} max={100} step={1} value={f.mdd} onChange={(mdd) => setF({ ...f, mdd })} format={(n) => `${n}%`} />
        <Range2 label="수익률 범위" min={-100} max={100} step={1} value={f.ret} onChange={(ret) => setF({ ...f, ret })} format={(n) => `${n > 0 ? "+" : ""}${n}%`} />
        <Range2 label="구독 가격" min={0} max={50000} step={1000} value={f.price} onChange={(price) => setF({ ...f, price })} format={(n) => (n >= 50000 ? "₩50,000+" : won(n))} />
        <span className="mk-range-label">전략 유형</span>
        <div className="mk-checks">
          {TYPES.map((t) => (
            <label key={t.key} className={f.types.includes(t.key) ? "on" : ""}>
              <span>
                <b>{t.key}</b>
                <small>{t.desc}</small>
              </span>
              <input type="checkbox" checked={f.types.includes(t.key)} onChange={() => setF({ ...f, types: toggle(f.types, t.key) })} />
            </label>
          ))}
        </div>
        <span className="mk-range-label">거래 국가</span>
        <div className="mk-checks">
          {MARKETS.map((m) => (
            <label key={m} className={f.markets.includes(m) ? "on" : ""}>
              <span>
                <b>{m}</b>
              </span>
              <input type="checkbox" checked={f.markets.includes(m)} onChange={() => setF({ ...f, markets: toggle(f.markets, m) })} />
            </label>
          ))}
        </div>
        <div className="mk-modal-foot">
          <button type="button" className="mk-ghost" onClick={() => setF(NO_FILTER)}>
            ↺ 초기화
          </button>
          <button type="button" className="mk-primary" onClick={() => onApply(f)}>
            필터 적용하기
          </button>
        </div>
      </div>
    </div>
  );
}

/** '전체' 도움말 말풍선이 화면 밖으로 나가지 않게 좌우로 밀기 (휴대폰에선 '전체'가 둘째 줄 왼쪽 끝으로 내려감). 꼬리는 계속 ? 를 가리킴 */
function fitTip(e: SyntheticEvent<HTMLElement>) {
  const tip = e.currentTarget.querySelector<HTMLElement>(".mk-help-tip");
  if (!tip) return;
  tip.style.setProperty("--dx", "0px");
  // 화면 맞춤(zoom)일 때도 getBoundingClientRect · 화면 폭(clientWidth)은 보이는 크기 → 그대로 재고, 밀 거리만 zoom 으로 나눠 CSS 크기로
  const z = fitZoom();
  const r = tip.getBoundingClientRect();
  const edge = 12;
  const max = document.documentElement.clientWidth - edge;
  const dx = r.left < edge ? edge - r.left : r.right > max ? max - r.right : 0;
  tip.style.setProperty("--dx", `${Math.round(dx / z)}px`);
}

/** 전체 기간: 첫 기록 달 ~ 마지막 달 (예: 24.12 ~ 26.11) */
function spanOf(t: Trader) {
  const ym = (m: string) => `${m.slice(2, 4)}.${m.slice(5, 7)}`;
  return `${ym(t.monthly[0].month)} ~ ${ym(t.monthly[t.monthly.length - 1].month)}`;
}
