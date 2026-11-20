"use client";
// 전략보관함 공용 조각: 기록 카드 · 종류 태그 · 보기 전환 · 구매한 전략 카드
import Link from "next/link";
import { Check, LayoutGrid, LineChart, List, Sparkles } from "lucide-react";
import { Spark } from "../marketplace/parts";
import { pct, tone, traderById } from "../marketplace/data";
import { kindLabel, shortDate, type Item, type ItemKind } from "./items";

export type View = "list" | "board" | "chart";

export function KindTag({ kind }: { kind: ItemKind }) {
  return <span className={`ar-tag ar-k-${kind}`}>{kindLabel(kind)}</span>;
}

export function ViewToggle({ view, onView }: { view: View; onView: (v: View) => void }) {
  const opts: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: "list", label: "목록", icon: <List size={14} /> },
    { key: "board", label: "보드", icon: <LayoutGrid size={14} /> },
    { key: "chart", label: "차트", icon: <LineChart size={14} /> },
  ];
  return (
    <div className="ar-views" role="tablist" aria-label="보기">
      {opts.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={view === o.key} className={view === o.key ? "on" : ""} onClick={() => onView(o.key)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 기록 카드. pick 을 주면 체크해서 재료로 고를 수 있음 */
export function ItemCard({ item, picked, onPick }: { item: Item; picked?: boolean; onPick?: () => void }) {
  const sideTone = item.side === "매수" ? "ar-buy" : item.side === "매도" ? "ar-sell" : "";
  return (
    <article className={`mk-card ar-item${picked ? " picked" : ""}${onPick ? " pickable" : ""}`} onClick={onPick}>
      <div className="ar-item-top">
        {onPick && (
          <span className={`ar-check${picked ? " on" : ""}`} aria-hidden>
            {picked && <Check size={12} strokeWidth={3} />}
          </span>
        )}
        <KindTag kind={item.kind} />
        <small>{item.symbolName ?? (item.kind === "strategy" ? "" : "종목 없음")}</small>
      </div>
      <strong>{item.title}</strong>
      {item.sub && <p className={`ar-item-sub ${sideTone}`}>{item.sub}</p>}
      {item.text && item.text !== item.title && <p className="ar-item-text">{item.text}</p>}
      <div className="ar-item-foot">
        <time>
          {shortDate(item.date)} {item.time}
        </time>
        {item.href && (
          <Link href={item.href} onClick={(e) => e.stopPropagation()}>
            {item.kind === "strategy" ? "전략 보기 ›" : "열기 ›"}
          </Link>
        )}
      </div>
    </article>
  );
}

/** 구매한 전략 카드 (보드 · 차트 · AI 만들기 아래) */
export function PurchasedCards({ items, picked, onPick, cta }: { items: Item[]; picked?: Set<string>; onPick?: (id: string) => void; cta: "ai" | "shop" }) {
  return (
    <div className="ar-bought">
      {items.map((i) => {
        const t = i.traderId ? traderById(i.traderId) : undefined;
        const on = picked?.has(i.id);
        return (
          <article key={i.id} className={`mk-card ar-bought-card${on ? " picked" : ""}${onPick ? " pickable" : ""}`} onClick={onPick ? () => onPick(i.id) : undefined}>
            <div className="ar-bought-top">
              {onPick && (
                <span className={`ar-check${on ? " on" : ""}`} aria-hidden>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              )}
              <b className="ar-avatar">{t?.name.slice(0, 1) ?? "?"}</b>
              <span>
                {t?.name ?? i.sub}
              </span>
            </div>
            <strong>{i.title}</strong>
            <div className="ar-bought-mid">
              <div>
                <small>그 달 수익률</small>
                <em className={tone(i.ret ?? 0)}>{i.ret === undefined ? "—" : pct(i.ret)}</em>
              </div>
              {t?.curves?.["1m"] && <Spark equity={t.curves["1m"]} w={120} h={36} />}
            </div>
            <div className="ar-bought-foot">
              <small>{i.follow !== undefined ? `이행률 ${i.follow}%` : i.sub}</small>
              {i.href && (
                <Link href={i.href} onClick={(e) => e.stopPropagation()}>
                  전략 보기 ›
                </Link>
              )}
            </div>
          </article>
        );
      })}
      {cta === "ai" ? (
        <Link href="/archive/ai" className="ar-cta">
          <Sparkles size={20} />
          <strong>AI로 새 전략 만들기</strong>
          <p>구매한 전략과 내 기록을 골라 합치면 나만의 전략으로 정리해요.</p>
          <span>만들러 가기 ›</span>
        </Link>
      ) : (
        <Link href="/marketplace" className="ar-cta shop">
          <strong>전략을 더 담고 싶다면</strong>
          <p>전략 마켓에서 월별 전략을 열면 바로 재료로 쓸 수 있어요.</p>
          <span>전략 마켓 ›</span>
        </Link>
      )}
    </div>
  );
}
