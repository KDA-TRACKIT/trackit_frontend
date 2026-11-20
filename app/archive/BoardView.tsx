"use client";
// 전략보관함 · 보드: 손익 캘린더(청산한 거래의 실현손익) + 그날 기록 + 종목별 기록 타임라인 + 구매한 전략
//   pick 을 주면 날짜 · 기록을 눌러 재료로 담음 (AI 전략 만들기)
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { getPositions, type Position } from "../../lib/api/performance";
import { barDate, useDaily } from "./bars";
import { KINDS, KIND_COLOR, WEEK, countBy, dayTitle, topSymbols, type Item, type ItemKind } from "./items";
import { KindTag, PurchasedCards } from "./parts";

const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
const wonAbs = (n: number) => Math.round(Math.abs(n)).toLocaleString("ko-KR");
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}₩${wonAbs(n)}`;

/** 기록 종류 칩 (여러 개 켜고 끄기) */
export function KindChips({ items, kinds, onKinds }: { items: Item[]; kinds: Set<ItemKind>; onKinds: (k: Set<ItemKind>) => void }) {
  const c = countBy(items);
  return (
    <div className="ar-kchips">
      <span>기록 종류</span>
      {KINDS.map((k) => {
        const on = kinds.has(k.key);
        return (
          <button
            key={k.key}
            type="button"
            className={`ar-kchip ar-k-${k.key}${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => {
              const n = new Set(kinds);
              if (on) n.delete(k.key);
              else n.add(k.key);
              onKinds(n);
            }}
          >
            <i />
            {k.label} {c[k.key]}
          </button>
        );
      })}
    </div>
  );
}

export const ALL_KINDS = () => new Set<ItemKind>(KINDS.map((k) => k.key));

export default function BoardView({
  items,
  picked,
  onPick,
  onChart,
}: {
  items: Item[];
  /** 재료 고르기 (AI 만들기) */
  picked?: Set<string>;
  onPick?: (ids: string[], on: boolean) => void;
  /** 차트 보기로 (종목) */
  onChart?: (symbol: string) => void;
}) {
  const [kinds, setKinds] = useState(ALL_KINDS);
  const [symbol, setSymbol] = useState("");
  const [month, setMonth] = useState(() => {
    const t = new Date(Date.now() + 9 * 3_600_000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
  });
  const [today] = useState(() => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10));
  const [day, setDay] = useState<string>(today);

  const [positions, setPositions] = useState<Position[] | null>(null);
  const [pnlError, setPnlError] = useState<string | null>(null);
  useEffect(() => {
    getPositions("CLOSED")
      .then(setPositions)
      .catch((e: unknown) => {
        setPositions([]);
        setPnlError(e instanceof Error && /로그인|401|인증/.test(e.message) ? "로그인하면 손익이 보여요" : "손익을 불러오지 못했어요");
      });
  }, []);

  const prefix = `${month.y}-${String(month.m).padStart(2, "0")}`;
  const shown = useMemo(() => items.filter((i) => kinds.has(i.kind) && (!symbol || (symbol === "none" ? !i.symbol : i.symbol === symbol))), [items, kinds, symbol]);
  const monthItems = shown.filter((i) => i.date.startsWith(prefix));
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of monthItems) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [monthItems]);
  const pnlDay = useMemo(() => {
    const m = new Map<string, { sum: number; list: Position[] }>();
    for (const p of positions ?? []) {
      if (!p.closedAt || (symbol && p.symbol !== symbol)) continue;
      const d = kstDay(p.closedAt);
      const e = m.get(d) ?? { sum: 0, list: [] };
      e.sum += Number(p.realizedPnl ?? 0);
      e.list.push(p);
      m.set(d, e);
    }
    return m;
  }, [positions, symbol]);

  const first = new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const dates = Array.from({ length: daysIn }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);
  const monthPnl = dates.reduce((a, d) => a + (pnlDay.get(d)?.sum ?? 0), 0);
  const winDays = dates.filter((d) => (pnlDay.get(d)?.sum ?? 0) > 0).length;
  const lossDays = dates.filter((d) => (pnlDay.get(d)?.sum ?? 0) < 0).length;
  const move = (k: number) => {
    const n = month.m + k < 1 ? { y: month.y - 1, m: 12 } : month.m + k > 12 ? { y: month.y + 1, m: 1 } : { y: month.y, m: month.m + k };
    setMonth(n);
    setDay(`${n.y}-${String(n.m).padStart(2, "0")}-01`);
  };

  const dayItems = (byDay.get(day) ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const dayPnl = pnlDay.get(day);
  const syms = topSymbols(items);
  const pickedItems = onPick ? items.filter((i) => picked?.has(i.id)) : [];

  return (
    <div className="ar-board">
      <div className="mk-card ar-toolbar">
        <KindChips items={items} kinds={kinds} onKinds={setKinds} />
        <div className="ar-toolbar-right">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="종목">
            <option value="">종목 전체</option>
            {syms.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
            <option value="none">종목 없음</option>
          </select>
          <div className="ar-month">
            <button type="button" onClick={() => move(-1)} aria-label="이전 달">
              ‹
            </button>
            <strong>
              {month.y}년 {month.m}월
            </strong>
            <button type="button" onClick={() => move(1)} aria-label="다음 달">
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="ar-board-top">
        <section className="mk-card ar-cal">
          <div className="ar-sec-head">
            <div>
              <h3>{month.m}월 손익 캘린더</h3>
            </div>
            <div className="ar-cal-sum">
              <small>이번 달 손익</small>
              <strong className={monthPnl > 0 ? "up" : monthPnl < 0 ? "down" : ""}>{pnlDay.size ? signed(monthPnl) : "—"}</strong>
              <small>{pnlError ?? `수익 ${winDays}일 · 손실 ${lossDays}일`}</small>
            </div>
          </div>
          <div className="ar-cal-grid">
            {WEEK.map((w, i) => (
              <span key={w} className={`wk${i === 0 ? " sun" : ""}`}>
                {w}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {dates.map((d) => {
              const v = pnlDay.get(d)?.sum;
              const recs = byDay.get(d) ?? [];
              const dots = [...new Set(recs.map((r) => r.kind))];
              const future = d > today;
              const allPicked = !!onPick && recs.length > 0 && recs.every((r) => picked?.has(r.id));
              return (
                <button
                  key={d}
                  type="button"
                  disabled={future}
                  className={`ar-day-cell${d === day ? " on" : ""}${v ? (v > 0 ? " up" : " down") : ""}${future ? " future" : ""}${allPicked ? " picked" : ""}`}
                  onClick={() => {
                    setDay(d);
                    if (onPick && recs.length) onPick(recs.map((r) => r.id), !allPicked);
                  }}
                >
                  <span className={`n${new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? " sun" : ""}${d === today ? " today" : ""}`}>{Number(d.slice(8))}</span>
                  <span className="dots">
                    {dots.map((k) => (
                      <i key={k} style={{ background: KIND_COLOR[k] }} />
                    ))}
                  </span>
                  {v !== undefined && v !== 0 && <small>{signed(v).replace("₩", "")}</small>}
                  {d === today && <em>오늘</em>}
                  {allPicked && (
                    <b className="ar-cell-check">
                      <Check size={10} strokeWidth={3} />
                    </b>
                  )}
                </button>
              );
            })}
          </div>
          <div className="ar-legend">
            <span>
              <i className="sq up" />
              수익
            </span>
            <span>
              <i className="sq down" />
              손실
            </span>
            <span className="grow" />
            {KINDS.map((k) => (
              <span key={k.key}>
                <i style={{ background: KIND_COLOR[k.key] }} />
                {k.label}
              </span>
            ))}
          </div>
        </section>

        {onPick ? (
          <aside className="mk-card ar-dayside">
            <h3>선택한 재료 {pickedItems.length}개</h3>
            {pickedItems.length ? (
              <ul className="ar-tl">
                {pickedItems.map((i) => (
                  <li key={i.id}>
                    <time>
                      {i.date.slice(5).replace("-", ".")}
                      <small>{WEEK[new Date(`${i.date}T00:00:00Z`).getUTCDay()]}</small>
                    </time>
                    <i style={{ background: KIND_COLOR[i.kind] }} />
                    <div>
                      <b>{i.title}</b>
                      <small>
                        {i.symbolName ?? ""} {i.sub}
                      </small>
                    </div>
                    <button type="button" aria-label="빼기" onClick={() => onPick([i.id], false)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ar-empty-s">날짜나 기록 점을 눌러 담아 보세요.</p>
            )}
          </aside>
        ) : (
          <aside className="mk-card ar-dayside">
            <h3>{dayTitle(day)}</h3>
            {dayPnl && (
              <div className={`ar-daypnl ${dayPnl.sum > 0 ? "up" : dayPnl.sum < 0 ? "down" : ""}`}>
                <small>실현 손익</small>
                <strong>{signed(dayPnl.sum)}</strong>
                <span>{dayPnl.list.map((p) => `${p.symbol} ${Number(p.quantity).toLocaleString("ko-KR")}주 청산`).join(" · ")}</span>
              </div>
            )}
            <h4>그날의 기록 {dayItems.length}개</h4>
            {dayItems.length ? (
              <ul className="ar-tl">
                {dayItems.map((i) => (
                  <li key={i.id}>
                    <time>{i.time}</time>
                    <i style={{ background: KIND_COLOR[i.kind] }} />
                    <div>
                      <KindTag kind={i.kind} />
                      <b>{i.title}</b>
                      {i.sub && <small>{i.sub}</small>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ar-empty-s">이날 남긴 기록이 없어요.</p>
            )}
            {dayItems.length > 0 && (
              <div className="ar-dayside-act">
                {dayItems.find((i) => i.symbol) && onChart && (
                  <button type="button" className="mk-ghost" onClick={() => onChart(dayItems.find((i) => i.symbol)!.symbol!)}>
                    차트에서 보기
                  </button>
                )}
                {dayItems.find((i) => i.href) && (
                  <Link href={dayItems.find((i) => i.href)!.href!} className="mk-primary">
                    기록 열기
                  </Link>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      <Timeline items={monthItems} dates={dates} today={today} day={onPick ? null : day} picked={picked} onPick={onPick} />

      <div className="ar-section-title">
        <h3>
          구독한 전략 <small>열어 본 전략 {items.filter((i) => i.kind === "strategy").length}개</small>
        </h3>
        <Link href="/archive/purchases">구독 목록 ›</Link>
      </div>
      <PurchasedCards
        items={items.filter((i) => i.kind === "strategy")}
        picked={picked}
        onPick={onPick ? (id) => onPick([id], !picked?.has(id)) : undefined}
        cta={onPick ? "shop" : "ai"}
      />
    </div>
  );
}

/** 종목별 기록 타임라인: 가로 = 그 달 날짜, 세로 = 종목. 그날 주가 흐름 위에 기록 점 */
function Timeline({
  items,
  dates,
  today,
  day,
  picked,
  onPick,
}: {
  items: Item[];
  dates: string[];
  today: string;
  day: string | null;
  picked?: Set<string>;
  onPick?: (ids: string[], on: boolean) => void;
}) {
  const rows = topSymbols(items).slice(0, 5);
  const bars = useDaily(rows.map((r) => r.code));
  const none = items.filter((i) => !i.symbol);
  const n = dates.length;
  const x = (d: string) => ((dates.indexOf(d) + 0.5) / n) * 100;

  if (!rows.length && !none.length) return null;
  const row = (key: string, label: React.ReactNode, list: Item[], code?: string) => {
    const b = code ? (bars[code] ?? []).filter((v) => barDate(v.time) >= dates[0] && barDate(v.time) <= dates[n - 1]) : [];
    const lo = Math.min(...b.map((v) => v.close));
    const hi = Math.max(...b.map((v) => v.close));
    const y = (c: number) => (hi === lo ? 50 : 82 - ((c - lo) / (hi - lo)) * 64);
    const up = b.length > 1 && b[b.length - 1].close >= b[0].close;
    // 같은 날 여러 기록은 옆으로 살짝 겹쳐
    const seen = new Map<string, number>();
    return (
      <div key={key} className="ar-tl-row">
        <div className="ar-tl-label">{label}</div>
        <div className="ar-tl-track">
          {b.length > 1 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polyline points={b.map((v) => `${x(barDate(v.time))},${y(v.close)}`).join(" ")} fill="none" stroke={up ? "var(--c-up)" : "var(--c-down)"} strokeOpacity=".55" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {list.map((i) => {
            if (!dates.includes(i.date)) return null;
            const k = seen.get(i.date) ?? 0;
            seen.set(i.date, k + 1);
            const bar = b.find((v) => barDate(v.time) === i.date);
            const top = bar ? y(bar.close) : 50;
            const on = picked?.has(i.id);
            return (
              <button
                key={i.id}
                type="button"
                className={`ar-tl-dot${on ? " on" : ""}`}
                style={{ left: `calc(${x(i.date)}% + ${k * 9}px)`, top: `${top}%`, background: KIND_COLOR[i.kind] }}
                title={`${i.date.slice(5)} ${i.time} · ${i.title}`}
                onClick={onPick ? () => onPick([i.id], !on) : undefined}
              >
                {KINDS.find((q) => q.key === i.kind)!.short}
                {i.side && <span className={i.side === "매수" ? "buy" : "sell"}>{i.side === "매수" ? "▲" : "▼"}</span>}
                {on && (
                  <b>
                    <Check size={8} strokeWidth={3} />
                  </b>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="mk-card ar-tline">
      <div className="ar-sec-head">
        <div>
          <h3>종목별 기록 타임라인</h3>
        </div>
        <div className="ar-legend">
          {KINDS.map((k) => (
            <span key={k.key}>
              <i style={{ background: KIND_COLOR[k.key] }} />
              {k.label}
            </span>
          ))}
          <span>
            <b className="buy">▲</b> 매수
          </span>
          <span>
            <b className="sell">▼</b> 매도
          </span>
        </div>
      </div>
      <div className="ar-tl-head">
        <div className="ar-tl-label">{Number(dates[0].slice(5, 7))}월</div>
        <div className="ar-tl-days">
          {dates.map((d) => {
            const w = new Date(`${d}T00:00:00Z`).getUTCDay();
            return (
              <span key={d} className={`${w === 0 ? "sun" : ""}${d === day ? " on" : ""}${d > today ? " future" : ""}`}>
                {Number(d.slice(8))}
              </span>
            );
          })}
        </div>
      </div>
      <div className="ar-tl-body" style={{ ["--n" as string]: n }}>
        {rows.map((r) => {
          const b = bars[r.code] ?? [];
          const last = b[b.length - 1];
          const prev = b[b.length - 2];
          const ch = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
          return row(
            r.code,
            <>
              <b>{r.name}</b>
              <small>기록 {items.filter((i) => i.symbol === r.code).length}</small>
              {last && (
                <em className={ch === null ? "" : ch >= 0 ? "up" : "down"}>
                  {last.close.toLocaleString("ko-KR")} {ch === null ? "" : `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`}
                </em>
              )}
            </>,
            items.filter((i) => i.symbol === r.code),
            r.code,
          );
        })}
        {none.length > 0 &&
          row(
            "none",
            <>
              <b>종목 없음</b>
              <small>기록 {none.length}</small>
              <em>전략 · 노트 · 뉴스</em>
            </>,
            none,
          )}
      </div>
    </section>
  );
}
