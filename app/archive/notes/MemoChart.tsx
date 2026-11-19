"use client";
// 내 노트 상세의 '노트 그림': 그 종목 일봉(노트 날 앞 40 · 뒤 20 거래일) 위에
//   노트 날 점 · 이어진 체결 화살표 · 노트에 그은 가격선(지지 초록 · 저항 빨강 · 나머지 보라)을 그림
//   (Figma 시안은 분봉 + 작도 모양이지만, 기록에는 작도 모양 대신 가격선만 남아 있어 일봉 + 가격선으로 보여 줌)
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, LineStyle, createChart, createSeriesMarkers, type SeriesMarker, type Time } from "lightweight-charts";
import { barDate, isKrCode, loadDaily } from "../bars";
import type { Bar } from "../../../lib/interval";
import type { NoteLine } from "../../workshop/lineLadder";
import { fixZoomPointer } from "../../../lib/zoom-pointer";

export default function MemoChart({ code, date, lines, side, color }: { code: string; date: string; lines?: NoteLine[]; side: "매수" | "매도" | null; color: string }) {
  const el = useRef<HTMLDivElement>(null);
  const supported = isKrCode(code);
  const [data, setData] = useState<{ code: string; bars: Bar[] } | null>(null);
  const bars = data?.code === code ? data.bars : null;

  useEffect(() => {
    if (!supported) return;
    let live = true;
    void loadDaily(code).then((b) => {
      if (live) setData({ code, bars: b });
    });
    return () => {
      live = false;
    };
  }, [code, supported]);

  useEffect(() => {
    const box = el.current;
    if (!box || !bars?.length) return;
    const days = bars.map((b) => barDate(b.time));
    const found = days.findIndex((d) => d >= date);
    const at = found === -1 ? days.length - 1 : found;
    const view = bars.slice(Math.max(0, at - 40), at + 21);
    const memoDay = days[at];
    const dark = document.documentElement.dataset.theme === "dark";
    const css = getComputedStyle(document.documentElement);
    const up = css.getPropertyValue("--c-up").trim() || "#1f9d55";
    const down = css.getPropertyValue("--c-down").trim() || "#e03131";
    const unfixZoom = fixZoomPointer(box);
    const chart = createChart(box, {
      autoSize: true,
      // 가격은 원 단위 정수 + 천 단위 쉼표, 날짜 눈금은 한국어(10월 · 11월)
      localization: { locale: "ko-KR", priceFormatter: (p: number) => Math.round(p).toLocaleString("ko-KR") },
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#aab2c0" : "#8791a3", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#222833" : "#e9edf3" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      handleScroll: false,
      handleScale: false,
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false });
    const t = (b: Bar) => barDate(b.time) as Time;
    candle.setData(view.map((b) => ({ time: t(b), open: b.open, high: b.high, low: b.low, close: b.close })));
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.2 } });
    vol.setData(view.map((b) => ({ time: t(b), value: b.volume, color: b.close >= b.open ? `${up}44` : `${down}44` })));

    const markers: SeriesMarker<Time>[] = [];
    if (side) markers.push({ time: memoDay as Time, position: side === "매수" ? "belowBar" : "aboveBar", shape: side === "매수" ? "arrowUp" : "arrowDown", color: side === "매수" ? up : down, text: `${side} 체결` });
    markers.push({ time: memoDay as Time, position: "inBar", shape: "circle", color, size: 1.3, text: "노트" });
    createSeriesMarkers(candle, markers);

    for (const l of lines ?? []) {
      const price = l.price ?? (l.low !== undefined && l.high !== undefined ? (l.low + l.high) / 2 : undefined);
      if (price === undefined || !Number.isFinite(price)) continue;
      candle.createPriceLine({
        price,
        color: l.role === "SUPPORT" ? up : l.role === "RESISTANCE" ? down : "#6e56cf",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.label,
      });
    }
    // 오른쪽에 봉 3개만큼 띄워 마지막 날(오늘) 노트 표시 · 글자가 잘리지 않게
    chart.timeScale().setVisibleLogicalRange({ from: -0.5, to: view.length + 2.5 });
    return () => {
      unfixZoom();
      chart.remove();
    };
  }, [bars, date, lines, side, color]);

  if (!supported) return null;
  if (!bars) return <div className="mm-chart is-loading" aria-label="차트 불러오는 중" />;
  if (!bars.length) return <div className="mm-chart is-empty">이 종목은 지금 차트를 불러올 수 없어요.</div>;
  return <div ref={el} className="mm-chart" role="img" aria-label="노트를 쓴 날 앞뒤 일봉과 노트에 그은 가격선" />;
}
