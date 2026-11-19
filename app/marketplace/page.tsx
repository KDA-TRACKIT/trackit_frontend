"use client";
// 전략 마켓: 트레이더를 한 줄씩 비교 (검색 · 기간별 수익률 · 필터 · 정렬 · 쪽 나눔)
//   데이터는 아직 예시(./data). 수익 초록 · 손실 빨강
//   검색어 · 기간 · 정렬 · 필터 · 쪽은 주소(?q=…)에 둔다 → 트레이더를 눌렀다가 돌아와도 그대로 (lib/market-list)
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { rememberListUrl } from "../../lib/market-list";
import { SlidersHorizontal } from "lucide-react";
import SiteHeader from "../SiteHeader";
import { MARKETS, PERIODS, PERIOD_MONTHS, TRADERS, TYPES, listed, oneStock, pct, sellable, tone, won, type Period, type Trader } from "./data";
import { FavButton, Pager, Range2, Spark } from "./parts";
import { GradeBadge } from "./GradeParts";
import HoneyPot from "../HoneyPot";
import "./marketplace.css";
import { useSupabaseUser } from "../mypage/context";
import { readInvestment, type Investment } from "../mypage/investment/InvestmentFields";
import { useLikeTotals } from "../../lib/feedback";
import { isFavorite, useFavorites } from "../../lib/favorites";

// 정렬 4가지 × 높은순(↓) · 낮은순(↑) (시안: 정렬 드롭다운 8가지). 주소에는 "ret" · "ret-asc"
type SortKey = "rec" | "pop" | "ret" | "price";
type Sort = SortKey | `${SortKey}-asc`;
const SORTS: { key: SortKey; label: string }[] = [
  { key: "rec", label: "추천순" },
  { key: "pop", label: "인기순" },
  { key: "ret", label: "수익률순" },
  { key: "price", label: "가격순" },
];
// 추천 · 인기 · 수익률은 높은 순만 (뒤집어 볼 일이 거의 없음), 가격만 낮은 순 · 높은 순 둘 다
const SORT_ALL: Sort[] = ["rec", "pop", "ret", "price-asc", "price"];
const sortKey = (s: Sort) => s.replace(/-asc$/, "") as SortKey;
const sortAsc = (s: Sort) => s.endsWith("-asc");
const sortLabel = (s: Sort) => (s === "price-asc" ? "가격 낮은 순" : s === "price" ? "가격 높은 순" : SORTS.find((x) => x.key === sortKey(s))!.label);
type Filter = { mdd: [number, number]; ret: [number, number]; price: [number, number]; types: string[]; markets: string[] };
const NO_FILTER: Filter = { mdd: [0, 100], ret: [-100, 100], price: [0, 50000], types: [], markets: [] };
const PER_PAGE = 8;

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
  const sort = sp.get("sort") as Sort | null;
  return {
    query: sp.get("q") ?? "",
    period: period && PERIODS.some((p) => p.key === period) ? period : "3m",
    sort: sort && SORT_ALL.includes(sort) ? sort : sort && SORT_ALL.includes(sortKey(sort)) ? sortKey(sort) : (sort as string | null) === "like" ? "pop" : "rec",
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
  if (s.sort !== "rec") sp.set("sort", s.sort);
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
  const likeTotals = useLikeTotals();
  const favs = useFavorites();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const state = useMemo(() => readState(new URLSearchParams(sp.toString())), [sp]);
  const { query, period, sort, filter, page } = state;
  const [open, setOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const mine = useMyInvestment();
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
    const likes = (t: Trader) => likeTotals[t.id] ?? 0;
    const ret = (t: Trader) => (oneStock(t, period) ? -Infinity : t.returns[period]);
    // 추천순: 내 투자 정보(매매 방식 · 참고 지표 · 시장 · 기간)와 트레이더가 겹칠수록 위로. 투자 정보가 없으면 좋아요 · 이행률 · 수익률
    const base = (t: Trader) => likes(t) * 0.4 + t.follow + (oneStock(t, period) ? 0 : t.returns[period]);
    const score = (t: Trader) => (mine ? similarity(mine, t) * 1000 : 0) + base(t);
    // 즐겨찾기한 트레이더를 맨 위에, 그 안에서는 고른 정렬대로
    const fav = (t: Trader) => (isFavorite(favs, t.id) ? 1 : 0);
    out.sort(
      (a, b) =>
        fav(b) - fav(a) ||
        // 지금 살 수 있는(등급 D 이상) 트레이더 먼저
        Number(sellable(b)) - Number(sellable(a)) ||
        (sortAsc(sort) ? -1 : 1) *
          (sortKey(sort) === "pop" ? b.buyers - a.buyers || likes(b) - likes(a) : sortKey(sort) === "ret" ? (ret(b) === ret(a) ? 0 : ret(b) > ret(a) ? 1 : -1) : sortKey(sort) === "price" ? b.price - a.price : score(b) - score(a)),
    );
    return out;
  }, [query, period, sort, filter, likeTotals, favs, mine]);

  const per = PER_PAGE;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * per, cur * per);
  const periodLabel = PERIODS.find((p) => p.key === period)!.label;
  const nFilter = filterCount(filter);

  return (
    <main className="mk-page">
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
          <input key={query} name="q" defaultValue={query} placeholder="트레이더 이름, 매매 방식 검색" aria-label="트레이더 검색" />
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
          <small className="mk-asof">{asOf} 기준</small>
        </div>
        <div className="mk-toolbar">
          <div className="mk-periods" role="radiogroup" aria-label="수익률 기간">
            <span>수익률(%)</span>
            {PERIODS.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={period === p.key} className={period === p.key ? "on" : ""} onClick={() => update({ period: p.key })} title={p.key === "all" ? "트레이더마다 첫 기록 달부터 지금까지" : undefined}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="mk-tools">
            {/* 정렬: 드롭다운 (추천 · 인기 · 수익률 · 가격 낮은/높은 순) */}
            <div className="mk-sortdd" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setSortOpen(false)}>
              <button type="button" className="mk-sortdd-btn" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen((v) => !v)}>
                {sortLabel(sort)} ▾
              </button>
              {sortOpen && (
                <ul className="mk-sortdd-list" role="listbox" aria-label="정렬">
                  {SORT_ALL.map((k, i) => (
                    <li key={k} className={i === 3 ? "sep" : ""}>
                      <button type="button" role="option" aria-selected={sort === k} className={sort === k ? "on" : ""} onClick={() => (update({ sort: k, page: 1 }), setSortOpen(false))}>
                        {sortLabel(k)} {sort === k && <span aria-hidden>✓</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className={`mk-filter-btn${nFilter ? " on" : ""}`} onClick={() => setOpen(true)} aria-label={nFilter ? `필터 ${nFilter}개 적용됨` : "필터"}>
              <SlidersHorizontal size={15} aria-hidden />
              필터
              {nFilter > 0 && <span className="mk-filter-count">{nFilter}</span>}
            </button>
          </div>
        </div>
        {period === "all" && <p className="mk-period-hint">전체 = 트레이더마다 첫 기록 달부터 {asOf}까지. 카드에 각 트레이더의 기간을 적어 뒀어요.</p>}

        {!shown.length ? (
          <p className="mk-card mk-empty">조건에 맞는 트레이더가 없어요. 검색어나 필터를 바꿔 보세요.</p>
        ) : (
          <ul className="mk-cards">
            {shown.map((t) => (
              <li key={t.id}>
                <Link href={`/marketplace/${t.id}`} className="mk-tcard">
                  <div className="mk-tcard-who">
                    <small>{t.tagline}</small>
                    <strong>
                      <FavButton id={t.id} name={t.name} /> {t.name} <span className="mk-heart" title="받은 꿀 합계"><HoneyPot count={likeTotals[t.id] ?? 0} /> {likeTotals[t.id] ?? 0}</span> <GradeBadge grade={t.grade?.grade} unrated={t.grade?.unrated} small />
                    </strong>
                    <p>{t.intro}</p>
                  </div>
                  <div className="mk-tcard-stat">
                    <small>가격</small>
                    <b>{sellable(t) ? won(t.price) : "판매 중지"}</b>
                  </div>
                  <div className="mk-tcard-stat">
                    <small>전략 이행률</small>
                    <b>{t.follow}%</b>
                  </div>
                  <div className="mk-tcard-stat">
                    <small>
                      {periodLabel} 수익률
                      {period === "all" && t.monthly.length > 0 && <em className="mk-span">{spanOf(t)}</em>}
                    </small>
                    {oneStock(t, period) ? (
                      <b title="이 기간엔 매매가 없거나 한 종목만 매매해 수익률을 비교하지 않아요">-</b>
                    ) : (
                      <b className={`big ${tone(t.returns[period])}`}>{pct(t.returns[period])}</b>
                    )}
                  </div>
                  <div className="mk-tcard-spark">
                    <small>수익률 추이</small>
                    {oneStock(t, period) ? <span>-</span> : <Spark equity={t.curves?.[period] ?? [10000]} w={110} h={34} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager page={cur} pages={pages} onPage={(p) => (setPage(p), window.scrollTo({ top: 0, behavior: "smooth" }))} />
        <p className="mk-policy-foot">
          <Link href="/marketplace/policy">이용 정책</Link>
        </p>
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
        <Range2 label="전략 가격" min={0} max={50000} step={1000} value={f.price} onChange={(price) => setF({ ...f, price })} format={(n) => (n >= 50000 ? "₩50,000+" : won(n))} />
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

/** 내 투자 정보 (로그인했으면 계정의 investment). 추천순에 씀 */
function useMyInvestment(): Investment | null {
  const { user } = useSupabaseUser();
  return useMemo(() => {
    if (!user) return null;
    const inv = readInvestment((user.user_metadata ?? {}) as Record<string, unknown>);
    return inv.styles.length || inv.indicators.length || inv.market || inv.period ? inv : null;
  }, [user]);
}

/** 내 투자 정보와 트레이더가 겹치는 정도 (매매 방식 2점 · 참고 지표 1점 · 시장 2점 · 기간 1점) */
function similarity(me: Investment, t: Trader) {
  const norm = (x: string) => x.replace(/\s/g, "");
  const common = (a: string[], b: string[]) => a.filter((x) => b.some((y) => norm(y) === norm(x))).length;
  const marketHit = (me.market.includes("국내") && t.market === "국내 주식") || ((me.market.includes("미국") || me.market.includes("해외")) && t.market === "해외 주식") ? 1 : 0;
  const periodHit = (me.period.includes("단기") && t.type === "단기 매매") || (me.period.includes("중기") && t.type === "스윙") || (me.period.includes("장기") && t.type === "추세 추종") ? 1 : 0;
  return common(me.styles, t.styles) * 2 + common(me.indicators, t.indicators) + marketHit * 2 + periodHit;
}

/** 전체 기간: 첫 기록 달 ~ 마지막 달 (예: 24.12 ~ 26.11) */
function spanOf(t: Trader) {
  const ym = (m: string) => `${m.slice(2, 4)}.${m.slice(5, 7)}`;
  return `${ym(t.monthly[0].month)} ~ ${ym(t.monthly[t.monthly.length - 1].month)}`;
}
