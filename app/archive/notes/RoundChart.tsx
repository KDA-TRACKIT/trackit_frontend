"use client";
// 내 노트 · 복기형 — 매매 한 번의 차트 (2026-11-21)
//   산 날 앞 20거래일 ~ 판 날(또는 '계획대로 했다면' 끝난 날) 뒤 10거래일의 일봉
//   가로선: 계획 매수(파랑) · 손절(빨강) · 목표(초록) / 표시: 실제 매수 ▲ · 실제 매도 ▼ · 계획대로 했다면 나갔을 날 ●
import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, LineStyle, createChart, createSeriesMarkers, type SeriesMarker, type Time } from "lightweight-charts";
import { barDate, isKrCode } from "../bars";
import type { Bar } from "../../../lib/interval";
import type { RoundReview, WhatIf } from "../../../lib/self-review";
import { fixZoomPointer } from "../../../lib/zoom-pointer";

export default function RoundChart({ r, bars, whatIf }: { r: RoundReview; bars: Bar[]; whatIf: WhatIf | null }) {
  const el = useRef<HTMLDivElement>(null);
  const { round, plan } = r;
  const code = round.symbol;
  const days = bars.map((b) => barDate(b.time));
  const at = (d: string) => {
    const k = days.findIndex((x) => x >= d);
    return k === -1 ? days.length - 1 : k;
  };
  const start = Math.max(0, at(round.entry.d) - 20);
  const lastDay = [round.exit?.d, whatIf?.exit?.d].filter((d): d is string => !!d).sort().pop();
  const end = lastDay ? Math.min(bars.length, at(lastDay) + 11) : bars.length;
  const inRange = !!bars.length && days[days.length - 1] >= round.entry.d && days[0] <= round.entry.d;

  useEffect(() => {
    const box = el.current;
    if (!box || !inRange) return;
    const view = bars.slice(start, end);
    if (!view.length) return;
    const viewDays = view.map((b) => barDate(b.time));
    const dayIn = (d: string) => viewDays.find((x) => x >= d) ?? viewDays[viewDays.length - 1];
    const dark = document.documentElement.dataset.theme === "dark";
    const css = getComputedStyle(document.documentElement);
    const up = css.getPropertyValue("--c-up").trim() || "#1f9d55";
    const down = css.getPropertyValue("--c-down").trim() || "#e03131";
    const unfixZoom = fixZoomPointer(box);
    const chart = createChart(box, {
      autoSize: true,
      localization: { locale: "ko-KR", priceFormatter: (p: number) => (isKrCode(code) ? Math.round(p).toLocaleString("ko-KR") : p.toFixed(2)) },
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#aab2c0" : "#8791a3", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#222833" : "#e9edf3" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      handleScroll: false,
      handleScale: false,
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false, lastValueVisible: false });
    candle.setData(view.map((b) => ({ time: barDate(b.time) as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    const markers: SeriesMarker<Time>[] = [{ time: dayIn(round.entry.d) as Time, position: "belowBar", shape: "arrowUp", color: up, text: "매수" }];
    if (round.exit) markers.push({ time: dayIn(round.exit.d) as Time, position: "aboveBar", shape: "arrowDown", color: down, text: "매도" });
    if (whatIf?.exit) markers.push({ time: dayIn(whatIf.exit.d) as Time, position: "aboveBar", shape: "circle", color: "#6e56cf", text: whatIf.why === "target" ? "계획 목표" : "계획 손절" });
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    createSeriesMarkers(candle, markers);
    const lines: [number | null | undefined, string, string][] = [
      [plan?.buy, "계획 매수", "#3b82f6"],
      [plan?.stop, "계획 손절", down],
      [plan?.target, "계획 목표", up],
    ];
    for (const [p, t, c] of lines) if (p) candle.createPriceLine({ price: p, color: c, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: t });
    chart.timeScale().fitContent();
    return () => {
      unfixZoom();
      chart.remove();
    };
  }, [bars, start, end, inRange, code, round, plan, whatIf]);

  if (!inRange) return <div className="mm-rv-chart is-empty">이 매매 기간의 일봉을 불러올 수 없어요.</div>;
  return <div ref={el} className="mm-rv-chart" role="img" aria-label={`${r.name} 매매 차트: 계획한 매수 · 손절 · 목표 선과 실제 매수 · 매도`} />;
}
