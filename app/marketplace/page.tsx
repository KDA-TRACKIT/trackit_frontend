"use client";
// 전략 쇼핑: 트레이더를 한 줄씩 비교 (검색 · 기간별 수익률 · 필터 · 정렬 · 쪽 나눔)
//   데이터는 아직 예시(./data). 수익 초록 · 손실 빨강
//   검색어 · 기간 · 정렬 · 필터 · 쪽은 주소(?q=…)에 둔다 → 트레이더를 눌렀다가 돌아와도 그대로 (lib/market-list)
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { rememberListUrl } from "../../lib/market-list";
import { SlidersHorizontal } from "lucide-react";
import SiteHeader from "../SiteHeader";
import { MARKETS, PERIODS, PERIOD_MONTHS, TRADERS, TYPES, oneStock, pct, tone, won, type Period, type Trader } from "./data";
import { FavButton, Pager, Range2, Spark } from "./parts";
import "./marketplace.css";
import { useLikeTotals } from "../../lib/feedback";
import { isFavorite, useFavorites } from "../../lib/favorites";

type Sort = "rec" | "pop" | "like" | "ret" | "price";
const SORTS: { key: Sort; label: string }[] = [
  { key: "rec", label: "추천순" },
  { key: "pop", label: "인기순" },
  { key: "like", label: "좋아요순" },
  { key: "ret", label: "수익률순" },
  { key: "price", label: "가격순" },
];
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
    sort: sort && SORTS.some((s) => s.key === sort) ? sort : "rec",
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
    const out = TRADERS.filter(hit);
    const likes = (t: Trader) => likeTotals[t.id] ?? 0;
    const ret = (t: Trader) => (oneStock(t, period) ? -Infinity : t.returns[period]);
    const score = (t: Trader) => likes(t) * 0.4 + t.follow + (oneStock(t, period) ? 0 : t.returns[period]);
    // 즐겨찾기한 트레이더를 맨 위에, 그 안에서는 고른 정렬대로
    const fav = (t: Trader) => (isFavorite(favs, t.id) ? 1 : 0);
    out.sort(
      (a, b) =>
        fav(b) - fav(a) ||
        (sort === "pop" ? b.buyers - a.buyers : sort === "like" ? likes(b) - likes(a) || b.buyers - a.buyers : sort === "ret" ? (ret(b) === ret(a) ? 0 : ret(b) > ret(a) ? 1 : -1) : sort === "price" ? a.price - b.price : score(b) - score(a)),
    );
    return out;
  }, [query, period, sort, filter, likeTotals, favs]);

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
        <h1 className="mk-title">전략 쇼핑</h1>

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
          {/* 처음 들어오면 전체 목록. 검색하거나 필터를 걸었을 때만 "결과" 로 */}
          {query.trim() ? (
            <strong>
              ‘{query.trim()}’ 검색 결과 <em>{list.length}</em>명
              <button
                type="button"
                className="mk-clear"
                onClick={() => update({ query: "", page: 1 })}
              >
                검색 지우기
              </button>
            </strong>
          ) : nFilter ? (
            <strong>
              필터 결과 <em>{list.length}</em>명
            </strong>
          ) : (
            <strong>
              전체 트레이더 <em>{list.length}</em>명
            </strong>
          )}
        </div>
        <div className="mk-toolbar">
          <div className="mk-periods" role="radiogroup" aria-label="수익률 기간">
            <span>수익률(%)</span>
            {PERIODS.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={period === p.key} className={period === p.key ? "on" : ""} onClick={() => update({ period: p.key })}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="mk-tools">
            {/* 정렬: 글자만 나란히, 고른 것만 진하게 */}
            <div className="mk-sorts" role="radiogroup" aria-label="정렬">
              {SORTS.map((s) => (
                <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} className={sort === s.key ? "on" : ""} onClick={() => update({ sort: s.key, page: 1 })}>
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" className={`mk-filter-btn${nFilter ? " on" : ""}`} onClick={() => setOpen(true)} aria-label={nFilter ? `필터 ${nFilter}개 적용됨` : "필터"}>
              <SlidersHorizontal size={15} aria-hidden />
              필터
              {nFilter > 0 && <span className="mk-filter-count">{nFilter}</span>}
            </button>
          </div>
        </div>

        {!shown.length ? (
          <p className="mk-card mk-empty">조건에 맞는 트레이더가 없어요. 검색어나 필터를 바꿔 보세요.</p>
        ) : (
          <div className="mk-table">
            <div className="mk-thead" aria-hidden>
              <span>트레이더</span>
              <span>열람권</span>
              <span>이행률</span>
              <span>{periodLabel} 수익률</span>
              <span>추이</span>
            </div>
            <ul className="mk-list">
              {shown.map((t, i) => (
                <li key={t.id}>
                  <Link href={`/marketplace/${t.id}`} className="mk-row">
                    <span className="mk-rank">{(cur - 1) * PER_PAGE + i + 1}</span>
                    <span className="mk-avatar" aria-hidden>
                      {t.name.slice(0, 1)}
                    </span>
                    <div className="mk-row-who">
                      <strong>
                        {t.name} <FavButton id={t.id} name={t.name} />
                      </strong>
                      <p>{t.tagline}</p>
                    </div>
                    <span className="mk-cell">{won(t.price)}</span>
                    <span className="mk-cell">{t.follow}%</span>
                    {oneStock(t, period) ? (
                      <>
                        <span className="mk-cell big" title="이 기간엔 매매가 없거나 한 종목만 매매해 수익률을 비교하지 않아요">-</span>
                        <span className="mk-row-spark mk-cell">-</span>
                      </>
                    ) : (
                      <>
                        <span className={`mk-cell big ${tone(t.returns[period])}`}>{pct(t.returns[period])}</span>
                        <span className="mk-row-spark">
                          {/* 고른 기간(월초부터)의 날마다 평가금 — 기간을 바꾸면 그래프도 바뀜 */}
                          <Spark equity={t.curves?.[period] ?? [10000]} w={110} h={34} />
                        </span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Pager page={cur} pages={pages} onPage={(p) => (setPage(p), window.scrollTo({ top: 0, behavior: "smooth" }))} />
        <p className="mk-policy-foot">
          <Link href="/marketplace/policy">이용 정책</Link>
        </p>
      </div>

      {open && (
        <FilterModal
          sort={sort}
          initial={filter}
          onClose={() => setOpen(false)}
          onApply={(f, s) => {
            update({ filter: f, sort: s, page: 1 });
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}

function FilterModal({ sort: sort0, initial, onClose, onApply }: { sort: Sort; initial: Filter; onClose: () => void; onApply: (f: Filter, s: Sort) => void }) {
  const [f, setF] = useState<Filter>(initial);
  const [sort, setSort] = useState<Sort>(sort0);
  return (
    <div className="mk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mk-modal" role="dialog" aria-modal="true" aria-label="필터" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="mk-modal-head">
          <strong>필터</strong>
          <button type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <span className="mk-range-label">정렬</span>
        <div className="mk-seg">
          {SORTS.map((s) => (
            <button key={s.key} type="button" className={sort === s.key ? "on" : ""} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
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
          <button type="button" className="mk-ghost" onClick={() => (setF(NO_FILTER), setSort("rec"))}>
            ↺ 초기화
          </button>
          <button type="button" className="mk-primary" onClick={() => onApply(f, sort)}>
            필터 적용하기
          </button>
        </div>
      </div>
    </div>
  );
}
