"use client";
// 전략 쇼핑: 트레이더를 한 줄씩 비교 (검색 · 기간별 수익률 · 필터 · 정렬 · 쪽 나눔)
//   데이터는 아직 예시(./data). 수익 초록 · 손실 빨강
import Link from "next/link";
import { useMemo, useState } from "react";
import SiteHeader from "../SiteHeader";
import { MARKETS, PERIODS, TRADERS, TYPES, pct, tone, won, type Period, type Trader } from "./data";
import { FavButton, Pager, Range2, Spark } from "./parts";
import "./marketplace.css";

type Sort = "rec" | "pop" | "ret" | "price";
const SORTS: { key: Sort; label: string }[] = [
  { key: "rec", label: "추천순" },
  { key: "pop", label: "인기순" },
  { key: "ret", label: "수익률순" },
  { key: "price", label: "가격순" },
];
type Filter = { mdd: [number, number]; ret: [number, number]; price: [number, number]; types: string[]; markets: string[] };
const NO_FILTER: Filter = { mdd: [0, 100], ret: [-100, 100], price: [0, 50000], types: [], markets: [] };
const PER_PAGE = 8;
const PERIOD_MONTHS: Record<Period, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "3y": 24, all: 24 };

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const filterCount = (f: Filter) =>
  (f.mdd[0] !== 0 || f.mdd[1] !== 100 ? 1 : 0) + (f.ret[0] !== -100 || f.ret[1] !== 100 ? 1 : 0) + (f.price[0] !== 0 || f.price[1] !== 50000 ? 1 : 0) + f.types.length + f.markets.length;

export default function MarketplacePage() {
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [period, setPeriod] = useState<Period>("3m");
  const [sort, setSort] = useState<Sort>("rec");
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (t: Trader) =>
      (!q || [t.name, t.tagline, t.intro, ...t.styles, ...t.indicators].some((s) => s.toLowerCase().includes(q))) &&
      -t.mdd >= filter.mdd[0] &&
      -t.mdd <= filter.mdd[1] &&
      t.returns[period] >= filter.ret[0] &&
      t.returns[period] <= filter.ret[1] &&
      t.price >= filter.price[0] &&
      (filter.price[1] >= 50000 || t.price <= filter.price[1]) &&
      (!filter.types.length || filter.types.includes(t.type)) &&
      (!filter.markets.length || filter.markets.includes(t.market));
    const out = TRADERS.filter(hit);
    const score = (t: Trader) => t.likes * 0.4 + t.follow + t.returns[period];
    out.sort((a, b) => (sort === "pop" ? b.likes - a.likes : sort === "ret" ? b.returns[period] - a.returns[period] : sort === "price" ? a.price - b.price : score(b) - score(a)));
    return out;
  }, [query, period, sort, filter]);

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
            setQuery(typed);
            setPage(1);
          }}
        >
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="매매 방식, 이름 등으로 검색해 보세요" aria-label="트레이더 검색" />
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
                onClick={() => {
                  setQuery("");
                  setTyped("");
                  setPage(1);
                }}
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
          <small>2026.11.16 기준</small>
        </div>
        <div className="mk-toolbar">
          <div className="mk-periods" role="radiogroup" aria-label="수익률 기간">
            <span>수익률(%)</span>
            {PERIODS.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={period === p.key} className={period === p.key ? "on" : ""} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="mk-tools">
            <button type="button" className={`mk-filter-btn ${nFilter ? "on" : ""}`} onClick={() => setOpen(true)}>
              필터{nFilter ? ` ${nFilter}` : ""}
            </button>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!shown.length ? (
          <p className="mk-card mk-empty">조건에 맞는 트레이더가 없어요. 검색어나 필터를 바꿔 보세요.</p>
        ) : (
          <ul className="mk-list">
            {shown.map((t) => (
              <li key={t.id}>
                <Link href={`/marketplace/${t.id}`} className="mk-card mk-row">
                  <div className="mk-row-who">
                    <small>{t.tagline}</small>
                    <strong>
                      {t.name} <span className="mk-like">♥ {t.likes}</span> <FavButton id={t.id} name={t.name} />
                    </strong>
                    <p>{t.intro}</p>
                  </div>
                  <dl className="mk-row-num">
                    <dt>전략 가격</dt>
                    <dd>
                      {won(t.price)}
                      <small> / 월</small>
                    </dd>
                  </dl>
                  <dl className="mk-row-num">
                    <dt>전략 이행률</dt>
                    <dd>{t.follow}%</dd>
                  </dl>
                  <dl className="mk-row-num">
                    <dt>{periodLabel} 수익률</dt>
                    <dd className={`big ${tone(t.returns[period])}`}>{pct(t.returns[period])}</dd>
                  </dl>
                  <div className="mk-row-spark">
                    <small>수익률 추이</small>
                    <Spark values={t.monthly.slice(-Math.max(PERIOD_MONTHS[period], 3)).map((m) => m.ret)} />
                    <small>
                      최대 낙폭 <b className="loss">{pct(t.mdd)}</b>
                    </small>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager page={cur} pages={pages} onPage={(p) => (setPage(p), window.scrollTo({ top: 0, behavior: "smooth" }))} />
      </div>

      {open && (
        <FilterModal
          sort={sort}
          initial={filter}
          onClose={() => setOpen(false)}
          onApply={(f, s) => {
            setFilter(f);
            setSort(s);
            setPage(1);
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
