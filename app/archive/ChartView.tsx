"use client";
// 전략보관함 · 차트: 종목 카드 → 그 종목 일봉 위에 내 기록 점. 점을 누르면 그 기록 (AI 만들기에선 재료로 담기)
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, createSeriesMarkers, type IChartApi, type SeriesMarker, type Time } from "lightweight-charts";
import { barDate, isKrCode, useDaily } from "./bars";
import { KINDS, KIND_COLOR, WEEK, topSymbols, type Item, type ItemKind } from "./items";
import { KindChips, ALL_KINDS } from "./BoardView";
import { KindTag, PurchasedCards } from "./parts";
import type { Bar } from "../../lib/interval";
import { fixZoomPointer } from "../../lib/zoom-pointer";

const RANGES = [
  { key: 30, label: "1개월" },
  { key: 90, label: "3개월" },
  { key: 180, label: "6개월" },
  { key: 365, label: "1년" },
];
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const ago = (days: number) => new Date(Date.now() + 9 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);

function MiniLine({ bars, marks }: { bars: Bar[]; marks: { date: string; kind: ItemKind }[] }) {
  if (bars.length < 2) return <div className="ar-mini empty" />;
  const lo = Math.min(...bars.map((b) => b.close));
  const hi = Math.max(...bars.map((b) => b.close));
  const W = 200;
  const H = 44;
  const x = (i: number) => (i / (bars.length - 1)) * W;
  const y = (c: number) => (hi === lo ? H / 2 : H - 4 - ((c - lo) / (hi - lo)) * (H - 8));
  const up = bars[bars.length - 1].close >= bars[0].close;
  return (
    <svg className="ar-mini" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={bars.map((b, i) => `${x(i)},${y(b.close)}`).join(" ")} fill="none" stroke={up ? "var(--c-up)" : "var(--c-down)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {marks.map((m, k) => {
        const i = bars.findIndex((b) => barDate(b.time) >= m.date);
        if (i < 0) return null;
        return <circle key={k} cx={x(i)} cy={y(bars[i].close)} r="3" fill={KIND_COLOR[m.kind]} stroke="var(--c-surface)" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

export default function ChartView({
  items,
  initialSymbol,
  picked,
  onPick,
}: {
  items: Item[];
  initialSymbol?: string | null;
  picked?: Set<string>;
  onPick?: (ids: string[], on: boolean) => void;
}) {
  const [kinds, setKinds] = useState(ALL_KINDS);
  const [range, setRange] = useState(90);
  const from = ago(range);
  const shown = useMemo(() => items.filter((i) => kinds.has(i.kind) && i.date >= from), [items, kinds, from]);
  const syms = topSymbols(shown).filter((s) => isKrCode(s.code));
  const cards = syms.slice(0, 3);
  const [symbol, setSymbol] = useState<string | null>(initialSymbol ?? null);
  const sel = symbol ?? cards[0]?.code ?? "none";
  const bars = useDaily([...new Set([...cards.map((c) => c.code), sel])]);
  const none = shown.filter((i) => !i.symbol);
  const list = (sel === "none" ? none : shown.filter((i) => i.symbol === sel)).slice().sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const [focus, setFocus] = useState<string | null>(null);
  const selName = sel === "none" ? "종목 없는 기록" : (syms.find((s) => s.code === sel)?.name ?? items.find((i) => i.symbol === sel)?.symbolName ?? sel);

  const cardBars = (code: string) => (bars[code] ?? []).filter((b) => barDate(b.time) >= from);

  return (
    <div className="ar-chartview">
      <div className="mk-card ar-toolbar">
        <KindChips items={items} kinds={kinds} onKinds={setKinds} />
        <div className="ar-toolbar-right">
          <span className="ar-faint">기간</span>
          <div className="mk-periods">
            {RANGES.map((r) => (
              <button key={r.key} type="button" className={range === r.key ? "on" : ""} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ar-symcards">
        {cards.map((c) => {
          const b = cardBars(c.code);
          const last = b[b.length - 1];
          const prev = b[b.length - 2];
          const ch = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
          const recs = shown.filter((i) => i.symbol === c.code);
          const n = recs.filter((i) => picked?.has(i.id)).length;
          return (
            <button key={c.code} type="button" className={`mk-card ar-symcard${sel === c.code ? " on" : ""}`} onClick={() => setSymbol(c.code)}>
              <div className="ar-symcard-top">
                <b>{c.name}</b>
                {onPick && n ? (
                  <span className="ar-pill on">
                    <Check size={10} strokeWidth={3} /> {n}개 담음
                  </span>
                ) : (
                  <span className="ar-pill">기록 {recs.length}</span>
                )}
              </div>
              <div className="ar-symcard-price">
                <strong>{last ? last.close.toLocaleString("ko-KR") : "—"}</strong>
                {ch !== null && <em className={ch >= 0 ? "up" : "down"}>{`${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`}</em>}
              </div>
              <MiniLine bars={b} marks={recs.map((r) => ({ date: r.date, kind: r.kind }))} />
            </button>
          );
        })}
        <button type="button" className={`mk-card ar-symcard dashed${sel === "none" ? " on" : ""}`} onClick={() => setSymbol("none")}>
          <div className="ar-symcard-top">
            <b>종목 없는 기록</b>
            <span className="ar-pill">기록 {none.length}</span>
          </div>
          <p>
            {KINDS.filter((k) => none.some((i) => i.kind === k.key))
              .map((k) => `${k.label} ${none.filter((i) => i.kind === k.key).length}`)
              .join(" · ") || "없음"}
          </p>
          <small>구독한 전략 · 일반 노트 · 뉴스</small>
        </button>
      </div>

      <div className="ar-board-top">
        <section className="mk-card ar-bigchart">
          {sel === "none" ? (
            <div className="ar-sec-head">
              <div>
                <h3>종목 없는 기록</h3>
              </div>
            </div>
          ) : (
            <>
              <div className="ar-sec-head">
                <div>
                  <h3>
                    {selName} <small>{sel} · 일봉</small>
                  </h3>
                  <Price bars={bars[sel] ?? []} />
                </div>
              </div>
              <RecordChart
                bars={(bars[sel] ?? []).filter((b) => barDate(b.time) >= from)}
                recs={list}
                picked={picked}
                onDot={(ids) => {
                  setFocus(ids[0]);
                  if (onPick) onPick(ids, !ids.every((id) => picked?.has(id)));
                }}
              />
              <div className="ar-legend">
                <span>
                  <b className="buy">▲</b> 매수
                </span>
                <span>
                  <b className="sell">▼</b> 매도
                </span>
                {KINDS.filter((k) => k.key !== "strategy").map((k) => (
                  <span key={k.key}>
                    <i style={{ background: KIND_COLOR[k.key] }} />
                    {k.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="mk-card ar-dayside">
          <h3>
            {selName} 기록 {list.length}개
          </h3>
          {list.length ? (
            <ul className="ar-tl">
              {list.map((i) => {
                const on = picked?.has(i.id);
                return (
                  <li key={i.id} className={`${focus === i.id ? "focus" : ""}${on ? " picked" : ""}`} onClick={onPick ? () => onPick([i.id], !on) : () => setFocus(i.id)}>
                    <time>
                      {i.date.slice(5).replace("-", ".")}
                      <small>{WEEK[new Date(`${i.date}T00:00:00Z`).getUTCDay()]}</small>
                    </time>
                    <i style={{ background: KIND_COLOR[i.kind] }} />
                    <div>
                      <KindTag kind={i.kind} />
                      <b>{i.title}</b>
                      {i.sub && <small>{i.sub}</small>}
                      {focus === i.id && i.text !== i.title && <p>{i.text}</p>}
                      {focus === i.id && i.href && !onPick && <Link href={i.href}>열기 ›</Link>}
                    </div>
                    {onPick && <span className={`ar-check${on ? " on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ar-empty-s">이 기간에 남긴 기록이 없어요.</p>
          )}
        </aside>
      </div>

      {!onPick && (
        <>
          <div className="ar-section-title">
            <h3>
              구독한 전략 <small>열어 본 전략 {items.filter((i) => i.kind === "strategy").length}개</small>
            </h3>
            <Link href="/archive/purchases">구독 목록 ›</Link>
          </div>
          <PurchasedCards items={items.filter((i) => i.kind === "strategy")} cta="ai" />
        </>
      )}
    </div>
  );
}

function Price({ bars }: { bars: Bar[] }) {
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (!last) return <p>시세를 불러오는 중…</p>;
  const d = prev ? last.close - prev.close : 0;
  return (
    <div className="ar-price">
      <strong>{last.close.toLocaleString("ko-KR")}</strong>
      {prev && (
        <em className={d >= 0 ? "up" : "down"}>
          {d >= 0 ? "▲" : "▼"}
          {Math.abs(d).toLocaleString("ko-KR")} {`${d >= 0 ? "+" : "−"}${Math.abs((d / prev.close) * 100).toFixed(2)}%`}
        </em>
      )}
    </div>
  );
}

/** 일봉 + 거래량, 기록 날짜에 점 (매수 ▲ · 매도 ▼) */
function RecordChart({ bars, recs, picked, onDot }: { bars: Bar[]; recs: Item[]; picked?: Set<string>; onDot: (ids: string[]) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const onDotRef = useRef(onDot);
  useEffect(() => {
    onDotRef.current = onDot;
  }, [onDot]);

  useEffect(() => {
    const box = el.current;
    if (!box || !bars.length) return;
    const dark = document.documentElement.dataset.theme === "dark";
    const css = getComputedStyle(document.documentElement);
    const up = css.getPropertyValue("--c-up").trim() || "#1f9d55";
    const down = css.getPropertyValue("--c-down").trim() || "#e03131";
    // 화면 맞춤(zoom)일 때 마우스 좌표 바로잡기 (lib/zoom-pointer.ts)
    const unfixZoom = fixZoomPointer(box);
    const chart = createChart(box, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#aab2c0" : "#667085", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#222833" : "#f0f2f6" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    const candle = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false });
    const t = (b: Bar) => barDate(b.time) as Time;
    candle.setData(bars.map((b) => ({ time: t(b), open: b.open, high: b.high, low: b.low, close: b.close })));
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
    vol.setData(bars.map((b) => ({ time: t(b), value: b.volume, color: b.close >= b.open ? `${up}55` : `${down}55` })));

    // 기록 날짜 → 그 날(또는 다음 거래일) 봉
    const days = bars.map((b) => barDate(b.time));
    const at = (d: string) => days.find((x) => x >= d);
    const byBar = new Map<string, Item[]>();
    for (const r of recs) {
      const d = at(r.date);
      if (d) byBar.set(d, [...(byBar.get(d) ?? []), r]);
    }
    const markers: SeriesMarker<Time>[] = [];
    for (const [d, list] of [...byBar.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      for (const r of list) {
        if (r.side) markers.push({ time: d as Time, position: r.side === "매수" ? "belowBar" : "aboveBar", shape: r.side === "매수" ? "arrowUp" : "arrowDown", color: r.side === "매수" ? up : down, text: `${r.side}` });
      }
      const k = list[0].kind;
      markers.push({
        time: d as Time,
        position: "inBar",
        shape: "circle",
        color: list.every((r) => picked?.has(r.id)) ? "#5b3fd1" : KIND_COLOR[k],
        size: 1.4,
        text: list.length > 1 ? `${list.length}` : KINDS.find((q) => q.key === k)!.short,
      });
    }
    createSeriesMarkers(candle, markers);
    chart.timeScale().fitContent();
    chart.subscribeClick((p) => {
      if (!p.time) return;
      const list = byBar.get(String(p.time));
      if (list?.length) onDotRef.current(list.map((r) => r.id));
    });
    return () => {
      unfixZoom();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, recs, picked]);

  if (!bars.length) return <div className="ar-chartbox ar-empty-s">시세를 불러오는 중이거나, 일봉을 볼 수 없는 종목이에요.</div>;
  return <div ref={el} className="ar-chartbox" />;
}
