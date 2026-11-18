"use client";
// 아카이브 · 목록: 왼쪽 분류 + 종목 · 기간 필터 + 카드
import { useMemo, useState } from "react";
import { KINDS, countBy, filterItems, topSymbols, type Item, type ItemKind } from "./items";
import { ItemCard } from "./parts";

export const PERIOD_OPTS = [
  { key: 0, label: "전체" },
  { key: -1, label: "오늘" },
  { key: 7, label: "1주일" },
  { key: 30, label: "1개월" },
  { key: 90, label: "3개월" },
];

/** 종목 · 기간 칩 (목록 · AI 만들기 같이 씀) */
export function SymbolPeriodFilter({
  items,
  symbol,
  onSymbol,
  days,
  onDays,
  kinds,
}: {
  items: Item[];
  symbol: string | null;
  onSymbol: (s: string | null) => void;
  days: number;
  onDays: (d: number) => void;
  kinds?: React.ReactNode;
}) {
  const [more, setMore] = useState(false);
  const syms = topSymbols(items);
  const shown = more ? syms : syms.slice(0, 4);
  return (
    <div className="mk-card ar-filterbox">
      {kinds}
      <div className="ar-frow">
        <span>종목</span>
        <div className="ar-chips">
          <button type="button" className={!symbol ? "on" : ""} onClick={() => onSymbol(null)}>
            전체
          </button>
          {shown.map((s) => (
            <button key={s.code} type="button" className={symbol === s.code ? "on" : ""} onClick={() => onSymbol(symbol === s.code ? null : s.code)}>
              {s.name}
            </button>
          ))}
          {items.some((i) => !i.symbol) && (
            <button type="button" className={symbol === "none" ? "on" : ""} onClick={() => onSymbol(symbol === "none" ? null : "none")}>
              종목 없음
            </button>
          )}
          {syms.length > 4 && (
            <button type="button" className="ar-more" onClick={() => setMore(!more)}>
              {more ? "접기" : `+ 더보기 ${syms.length - 4}`}
            </button>
          )}
        </div>
      </div>
      <div className="ar-frow">
        <span>기간</span>
        <div className="mk-periods">
          {PERIOD_OPTS.map((p) => (
            <button key={p.key} type="button" className={days === p.key ? "on" : ""} onClick={() => onDays(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ListView({ items, q, loading }: { items: Item[]; q: string; loading: boolean }) {
  const [kind, setKind] = useState<ItemKind | "all">("all");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [days, setDays] = useState(0);
  const [old, setOld] = useState(false);

  const base = useMemo(() => filterItems(items, { symbol, days, q }), [items, symbol, days, q]);
  const counts = countBy(base);
  const shown = useMemo(() => {
    const l = kind === "all" ? base : base.filter((i) => i.kind === kind);
    return old ? [...l].reverse() : l;
  }, [base, kind, old]);

  return (
    <div className="ar-list">
      <aside className="mk-card ar-side-nav">
        <small>분류</small>
        <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>
          <i className="ar-dot ar-k-all" />
          전체 <b>{base.length}</b>
        </button>
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}>
            <i className={`ar-dot ar-k-${k.key}`} />
            {k.label} <b>{counts[k.key]}</b>
          </button>
        ))}
      </aside>
      <div className="ar-list-main">
        <SymbolPeriodFilter items={items} symbol={symbol} onSymbol={setSymbol} days={days} onDays={setDays} />
        <div className="ar-result">
          <strong>
            {kind === "all" ? "전체" : KINDS.find((k) => k.key === kind)!.label} 기록 {shown.length}개
          </strong>
          <button type="button" onClick={() => setOld(!old)}>
            {old ? "오래된순" : "최신순"} ▾
          </button>
        </div>
        {loading && !items.length ? (
          <div className="mk-card mk-empty">불러오는 중…</div>
        ) : !shown.length ? (
          <div className="mk-card mk-empty">{items.length ? "이 조건에 맞는 기록이 없어요." : "아직 남긴 기록이 없어요. 트레이딩 로그나 오른쪽 아래 메모 버튼으로 남겨 보세요."}</div>
        ) : (
          <div className="ar-grid">
            {shown.map((i) => (
              <ItemCard key={i.id} item={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
