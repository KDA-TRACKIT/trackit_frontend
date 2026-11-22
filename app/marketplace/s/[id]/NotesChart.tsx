"use client";
// 올린 전략 상세의 차트 (2026-11-22): 고른 종목의 일봉 + 매수 · 매도 표시 + 노트 쓴 날 점
//   일봉은 트레이딩 로그와 같은 곳에서 받음 (국내 · 미국 · 지수 · 선물). 기간 앞뒤로 조금 넉넉히
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, type SeriesMarker, type Time } from "lightweight-charts";
import { fetchBars, searchAllSymbols, type UsExchange } from "../../../../lib/market-data";
import { isSpecialCode } from "../../../../lib/special-symbols";
import type { Bar } from "../../../../lib/mock/workshop";

type Trade = { side: "BUY" | "SELL"; price: number; at: string };

const KST = 9 * 3600;
const dayKey = (sec: number) => new Date((sec + KST) * 1000).toISOString().slice(0, 10);

export default function NotesChart({ code, from, to, trades, noteDays, dark }: { code: string; from: string; to: string; trades: Trade[]; noteDays: string[]; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ code: string; bars: Bar[] } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      let exchange: UsExchange | undefined;
      if (!/^\d{6}$/.test(code) && !isSpecialCode(code)) {
        const hit = (await searchAllSymbols(code, ac.signal).catch(() => [])).find((s) => s.code === code && s.exchange);
        exchange = hit?.exchange;
      }
      const { bars } = await fetchBars(code, "1d", ac.signal, 3000, exchange);
      return bars;
    };
    load()
      .then((bars) => !ac.signal.aborted && setData({ code, bars }))
      .catch(() => !ac.signal.aborted && setData({ code, bars: [] }));
    return () => ac.abort();
  }, [code]);

  const bars = data?.code === code ? data.bars : null;
  useEffect(() => {
    const el = host.current;
    if (!el || !bars?.length) return;
    // 기간 앞 40일 · 뒤 10일까지
    const lo = Date.parse(`${from}T00:00:00+09:00`) / 1000 - 40 * 86_400;
    const hi = Date.parse(`${to}T23:59:59+09:00`) / 1000 + 10 * 86_400;
    const shown = bars.filter((b) => b.time >= lo && b.time <= hi);
    if (!shown.length) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#c9d1dc" : "#5b6474", attributionLogo: false },
      grid: { vertLines: { color: dark ? "#232a36" : "#f0f2f6" }, horzLines: { color: dark ? "#232a36" : "#f0f2f6" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 4 },
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: "#e5484d", downColor: "#2f6fde", borderVisible: false, wickUpColor: "#e5484d", wickDownColor: "#2f6fde" });
    candle.setData(shown.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    // 일봉 자리: 그날 KST 날짜의 봉
    const byDay = new Map(shown.map((b) => [dayKey(b.time), b.time]));
    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      const time = byDay.get(dayKey(Date.parse(t.at) / 1000));
      if (time === undefined) continue;
      const buy = t.side === "BUY";
      markers.push({ time: time as Time, position: buy ? "belowBar" : "aboveBar", shape: buy ? "arrowUp" : "arrowDown", color: buy ? "#e5484d" : "#2f6fde", text: buy ? "매수" : "매도" });
    }
    for (const d of new Set(noteDays)) {
      const time = byDay.get(d);
      if (time !== undefined) markers.push({ time: time as Time, position: "aboveBar", shape: "circle", color: "#7048e8" });
    }
    createSeriesMarkers(candle, markers.sort((a, b) => Number(a.time) - Number(b.time)));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, from, to, trades, noteDays, dark]);

  if (!bars) return <p className="mk-empty">차트를 불러오는 중…</p>;
  if (!bars.length) return <p className="mk-empty">이 종목은 차트를 불러올 수 없어요.</p>;
  return <div ref={host} className="ms-chart" />;
}
