"use client";
// 내 노트 · 복기형 재생 (2026-11-20): 종목을 고르면 그 종목에서 내 뷰가 어떻게 바뀌었고 어떻게 매매했는지 시간 순서로 재생
//   왼쪽: 그 순간까지의 일봉 + 그때까지 그은 선(지지 초록 · 저항 빨강) + 그때까지의 매수 · 매도 · 노트 표시
//   오른쪽: 그 단계 카드 (노트면 쓴 문장 · 바뀐 점 · 그때 계획 / 매매면 체결과 그 순간 계획 비교)
//   ⏮ ◀ ▶(재생) ▶ ⏭ · 막대로 옮기기 · 속도
import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, ColorType, LineSeries, LineStyle, createChart, createSeriesMarkers, type SeriesMarker, type Time } from "lightweight-charts";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { barDate, isKrCode, loadDaily } from "../bars";
import type { Bar } from "../../../lib/interval";
import type { TradeRecord } from "../../../lib/records";
import type { Trade } from "../../../lib/api/performance";
import { buildReplay, moneyOf, type ReplayStep } from "../../../lib/replay";
import { fetchBars, searchAllSymbols } from "../../../lib/market-data";
import { fixZoomPointer } from "../../../lib/zoom-pointer";
import { shortDate } from "./model";
import BeeLoader from "../../BeeLoader";

const moneyFor = (code: string) => {
  const f = moneyOf(code);
  return (n: number | null) => (n === null ? "—" : f(n));
};

export default function ReplayView({ records, trades, stocks, from, onOpenNote }: { records: TradeRecord[]; trades: Trade[]; stocks: { code: string; name: string }[]; from: string; onOpenNote: (id: string) => void }) {
  const [picked, setPicked] = useState("");
  const code = stocks.find((stock) => stock.code === picked)?.code ?? stocks[0]?.code ?? "";
  // 기간 안의 단계만 표시하되 그 전에 만든 계획과 차트 선을 이어받음.
  const steps = useMemo(() => (code ? buildReplay(records, trades, code).filter((step) => step.date >= from) : []), [records, trades, code, from]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    setI(0);
    setPlaying(false);
  }, [code]);
  const idx = Math.min(i, Math.max(0, steps.length - 1));
  useEffect(() => {
    if (!playing) return;
    if (idx >= steps.length - 1) return setPlaying(false);
    const t = setTimeout(() => setI(idx + 1), 2200 / speed);
    return () => clearTimeout(t);
  }, [playing, idx, steps.length, speed]);
  const step = steps[idx];
  const name = stocks.find((s) => s.code === code)?.name ?? code;

  return (
    <section className="mm-card mm-rp" aria-label="복기 재생">
      <div className="mm-rp-head">
        <h2>복기 재생</h2>
        <small>노트(그때의 뷰)와 실제 매매를 시간 순서로 다시 봐요</small>
      </div>
      {/* 종목 고르기: 드롭다운은 눈에 안 띄어서 버튼으로 (2026-11-21) */}
      <div className="mm-rp-stocks" role="tablist" aria-label="재생할 종목">
        {stocks.map((s) => (
          <button key={s.code} type="button" role="tab" aria-selected={s.code === code} className={s.code === code ? "on" : ""} onClick={() => setPicked(s.code)}>
            {s.name}
          </button>
        ))}
      </div>
      {!steps.length ? (
        <p className="mm-rv-muted">{from ? "선택한 기간에 " : ""}{name}에 남긴 노트 · 매매가 없어요.</p>
      ) : (
        <>
          <div className="mm-rp-body">
            <ReplayChart code={code} steps={steps} idx={idx} />
            <StepCard code={code} step={step} name={name} onOpenNote={onOpenNote} />
          </div>
          <div className="mm-rp-ctrl">
            <button type="button" onClick={() => (setPlaying(false), setI(0))} aria-label="처음으로" disabled={idx === 0}>
              <SkipBack size={16} />
            </button>
            <button type="button" onClick={() => (setPlaying(false), setI(Math.max(0, idx - 1)))} aria-label="이전" disabled={idx === 0}>
              <StepBack size={16} />
            </button>
            <button type="button" className="play" onClick={() => (idx >= steps.length - 1 ? (setI(0), setPlaying(true)) : setPlaying((p) => !p))} aria-label={playing ? "멈춤" : "재생"}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" onClick={() => (setPlaying(false), setI(Math.min(steps.length - 1, idx + 1)))} aria-label="다음" disabled={idx >= steps.length - 1}>
              <StepForward size={16} />
            </button>
            <button type="button" onClick={() => (setPlaying(false), setI(steps.length - 1))} aria-label="끝으로" disabled={idx >= steps.length - 1}>
              <SkipForward size={16} />
            </button>
            <input type="range" min={0} max={steps.length - 1} value={idx} onChange={(e) => (setPlaying(false), setI(Number(e.target.value)))} aria-label="재생 위치" />
            <span className="mm-rp-pos">
              {idx + 1} / {steps.length}
            </span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="재생 속도">
              {[0.5, 1, 2].map((v) => (
                <option key={v} value={v}>
                  {v}배
                </option>
              ))}
            </select>
          </div>
          <ol className="mm-rp-track" aria-label="단계 목록">
            {steps.map((s, k) => (
              <li key={k}>
                <button type="button" className={`${s.kind === "note" ? "note" : s.side === "매수" ? "buy" : "sell"}${k === idx ? " on" : ""}${k > idx ? " later" : ""}`} onClick={() => (setPlaying(false), setI(k))} title={`${shortDate(s.date)} ${s.time} ${s.kind === "note" ? "노트" : s.side}`}>
                  {s.kind === "note" ? "노트" : s.side}
                  <small>{shortDate(s.date)}</small>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function StepCard({ step, name, code, onOpenNote }: { step: ReplayStep; name: string; code: string; onOpenNote: (id: string) => void }) {
  const won = moneyFor(code);
  return (
    <div className={`mm-rp-card ${step.kind === "note" ? "note" : step.side === "매수" ? "buy" : "sell"}`}>
      <div className="mm-rp-when">
        <b>{step.kind === "note" ? "노트" : `${step.side} 체결`}</b> {shortDate(step.date)} {step.time}
      </div>
      {step.kind === "note" ? (
        <>
          {step.changes.length ? (
            <ul className="mm-rp-changes">
              {step.changes.map((c) => (
                <li key={c} className={/내림/.test(c) ? "bad" : ""}>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mm-rv-muted">가격 · 선은 그대로예요.</p>
          )}
          {!!step.text.length && (
            <blockquote>
              {step.text.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </blockquote>
          )}
          <button type="button" className="mm-rp-link" onClick={() => onOpenNote(step.recordId)}>
            이 노트 전체 보기 ›
          </button>
        </>
      ) : (
        <>
          <p className="mm-rp-trade">
            {name} {step.qty.toLocaleString("ko-KR")}주 · {won(step.price)}
          </p>
          <ul className="mm-rp-changes">
            {step.checks.map((c) => (
              <li key={c.text} className={c.ok ? "good" : "bad"}>
                {c.ok ? "✓" : "✕"} {c.text}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mm-rp-plan">
        그때 계획 · 매수 {won(step.plan.buy)} · 손절 {won(step.plan.stop)} · 목표 {won(step.plan.target)}
      </div>
    </div>
  );
}

/** 그 단계 시각까지의 일봉 + 선 + 표시 (앞 60거래일) */
function ReplayChart({ code, steps, idx }: { code: string; steps: ReplayStep[]; idx: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ code: string; bars: Bar[] } | null>(null);
  const bars = data?.code === code ? data.bars : null;
  useEffect(() => {
    let live = true;
    if (isKrCode(code)) void loadDaily(code).then((b) => live && setData({ code, bars: b }));
    else
      // 미국 종목: 거래소(나스닥 · 뉴욕 · 아멕스)를 찾아 미국 일봉
      void searchAllSymbols(code)
        .then((list) => list.find((s) => s.code === code && s.exchange))
        .then((hit) => (hit?.exchange ? fetchBars(code, "1d", undefined, 3000, hit.exchange).then((r) => r.bars) : []))
        .catch(() => [])
        .then((b) => live && setData({ code, bars: b }));
    return () => {
      live = false;
    };
  }, [code]);

  useEffect(() => {
    const box = el.current;
    if (!box || !bars?.length) return;
    const step = steps[idx];
    const days = bars.map((b) => barDate(b.time));
    let end = days.findIndex((d) => d > step.date);
    end = end === -1 ? days.length : end;
    const view = bars.slice(Math.max(0, end - 60), end);
    if (!view.length) return;
    const first = barDate(view[0].time);
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
    const candle = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false });
    candle.setData(view.map((b) => ({ time: barDate(b.time) as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    // 그때까지의 노트 · 매매 표시 (보이는 기간 안만)
    const seen = steps.slice(0, idx + 1).filter((s) => s.date >= first);
    const markers: SeriesMarker<Time>[] = seen.map((s, k) => {
      const day = days.find((d) => d >= s.date) ?? s.date;
      const last = k === seen.length - 1;
      return s.kind === "note"
        ? { time: day as Time, position: "inBar" as const, shape: "circle" as const, color: "#6e56cf", size: last ? 1.6 : 0.9, text: last ? "노트" : "" }
        : { time: day as Time, position: s.side === "매수" ? ("belowBar" as const) : ("aboveBar" as const), shape: s.side === "매수" ? ("arrowUp" as const) : ("arrowDown" as const), color: s.side === "매수" ? up : down, text: `${s.side} ${isKrCode(code) ? Math.round(s.price).toLocaleString("ko-KR") : s.price.toFixed(2)}` };
    });
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    createSeriesMarkers(candle, markers);
    // 그때까지 그은 선 · 그때 계획
    for (const l of step.lines) {
      const color = l.role === "SUPPORT" ? up : l.role === "RESISTANCE" ? down : "#6e56cf";
      if (l.pts && l.pts.length > 1) {
        const [a, b] = [l.pts[0], l.pts[l.pts.length - 1]];
        const slope = (b[1] - a[1]) / (b[0] - a[0] || 1);
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(view.filter((v) => v.time >= a[0]).map((v) => ({ time: barDate(v.time) as Time, value: a[1] + slope * (v.time - a[0]) })));
        continue;
      }
      const price = l.price ?? (l.low !== undefined && l.high !== undefined ? (l.low + l.high) / 2 : undefined);
      if (price === undefined) continue;
      candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.role === "SUPPORT" ? "지지" : l.role === "RESISTANCE" ? "저항" : l.label });
    }
    const plan: [number | null, string, string][] = [
      [step.plan.buy, "계획 매수", "#3b82f6"],
      [step.plan.stop, "계획 손절", down],
      [step.plan.target, "계획 목표", up],
    ];
    for (const [p, t, c] of plan) if (p) candle.createPriceLine({ price: p, color: c, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: t });
    chart.timeScale().setVisibleLogicalRange({ from: -0.5, to: view.length + 2.5 });
    return () => {
      unfixZoom();
      chart.remove();
    };
  }, [bars, steps, idx, code]);

  if (bars && !bars.length) return <div className="mm-rp-chart is-empty">이 종목은 차트를 불러올 수 없어요.</div>;
  if (!bars) return <div className="mm-rp-chart is-empty"><BeeLoader size="sm" /></div>;
  return <div ref={el} className="mm-rp-chart" role="img" aria-label="그 순간까지의 일봉 · 그은 선 · 매매 표시" />;
}
