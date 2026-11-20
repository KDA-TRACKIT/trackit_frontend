"use client";
// 미국 종목 차트 창 (관심 종목 · 지수 맵 · 순위에서 미국 종목을 누르면)
//   네이버·트레이딩뷰처럼: 처음엔 최근 300봉만 받아 바로 그리고, 왼쪽 끝 가까이 스크롤하면 그 앞을 이어 받는다
//   지수 구성·인기 종목은 서버에 10년치가 저장돼 있어 0.1초 안, 그 밖은 키움에서 최근 100봉 먼저(1~2초)
//   일 · 주 · 월 (주·월은 일봉을 묶음), 오르면 초록(--c-up) · 내리면 빨강(--c-down), 가격은 달러(수정주가)
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../lib/api/client";
import { getUsBars, type UsBar, type UsBars } from "../../lib/api/insights";
import { pct, price } from "./parts";
import { fixZoomPointer } from "../../lib/zoom-pointer";
import BeeLoader from "../BeeLoader";

export type UsChartTarget = { code: string; name?: string; exchange?: string };
type Period = "D" | "W" | "M";
const PERIODS: [Period, string][] = [
  ["D", "일"],
  ["W", "주"],
  ["M", "월"],
];

/** 일봉 → 주봉(월요일 시작) · 월봉 */
function group(bars: UsBar[], period: Period): UsBar[] {
  if (period === "D") return bars;
  const out: UsBar[] = [];
  for (const b of bars) {
    const d = new Date(b.time * 1000);
    const start = period === "W" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) / 1000 : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    const last = out[out.length - 1];
    if (last && last.time === start) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else out.push({ ...b, time: start });
  }
  return out;
}

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function UsChart({ target, onClose }: { target: UsChartTarget; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [data, setData] = useState<UsBars | null>(null);
  const [bars, setBars] = useState<UsBar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("D");
  const [loadingMore, setLoadingMore] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  // 스크롤 콜백에서 최신 값을 읽으려고
  const state = useRef({ bars: [] as UsBar[], hasMore: false, busy: false, period: "D" as Period });

  // 처음: 최근 300봉 (주·월은 더 길게)
  useEffect(() => {
    const ac = new AbortController();
    const t0 = performance.now();
    getUsBars(target.code, { exchange: target.exchange, limit: 300 }, ac.signal)
      .then((d) => {
        setElapsed(Math.round(performance.now() - t0));
        setData(d);
        setBars(d.bars);
        state.current = { ...state.current, bars: d.bars, hasMore: d.hasMore };
      })
      .catch((e) => !ac.signal.aborted && setError(errorMessage(e)));
    return () => ac.abort();
  }, [target.code, target.exchange]);

  // 더 예전 구간 (왼쪽 끝 가까이 왔을 때 · 주/월로 바꿨을 때)
  const loadOlder = async (count: number) => {
    const s = state.current;
    if (s.busy || !s.hasMore || !s.bars.length) return;
    s.busy = true;
    setLoadingMore(true);
    try {
      const d = await getUsBars(target.code, { exchange: target.exchange, limit: count, before: s.bars[0].time });
      const merged = [...d.bars.filter((b) => b.time < s.bars[0].time), ...s.bars];
      state.current = { ...state.current, bars: merged, hasMore: d.hasMore && d.bars.length > 0 };
      setBars(merged);
    } catch {
      // 다음에 다시 스크롤하면 또 시도
    } finally {
      state.current.busy = false;
      setLoadingMore(false);
    }
  };

  // 주·월봉은 일봉이 많이 필요 → 바꿀 때 10년치까지 한 번에
  useEffect(() => {
    state.current.period = period;
    if (period !== "D" && bars.length && bars.length < 2400) void loadOlder(2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, data]);

  // 차트 만들기 (한 번)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const up = cssVar("--c-up", "#1f9d55");
    const down = cssVar("--c-down", "#e03131");
    // 화면 맞춤(zoom)일 때 마우스 좌표 바로잡기 (lib/zoom-pointer.ts)
    const unfixZoom = fixZoomPointer(el);
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar("--c-surface", "#fff") }, textColor: cssVar("--c-sub", "#555"), fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: cssVar("--c-line", "#eee") }, horzLines: { color: cssVar("--c-line", "#eee") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 3 },
      localization: {
        locale: "ko-KR",
        timeFormatter: (t: Time) => {
          const d = new Date((t as number) * 1000);
          return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
        },
      },
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    // 왼쪽 끝에서 30봉 안으로 오면 그 앞을 받는다 (일봉은 300개씩, 주·월은 10년치까지 한 번에)
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (r && r.from < 30) void loadOlder(state.current.period === "D" ? 300 : 2600);
    });
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    return () => {
      unfixZoom();
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 데이터 반영: 앞에 붙을 때는 보던 위치 그대로
  const shown = useMemo(() => group(bars, period), [bars, period]);
  const prevLen = useRef(0);
  const prevPeriod = useRef<Period>("D");
  const fitPending = useRef(false);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candleRef.current || !volRef.current || !shown.length) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    const added = shown.length - prevLen.current;
    const up = cssVar("--c-up", "#1f9d55");
    const down = cssVar("--c-down", "#e03131");
    candleRef.current.setData(shown.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    volRef.current.setData(shown.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: `${b.close >= b.open ? up : down}66` })));
    // 처음 · 봉 단위를 바꿨을 때: 기본 화면 (일 120봉 · 주 2년 · 월 5년). 주·월은 10년치가 다 들어올 때 한 번 더 맞춘다
    if (prevPeriod.current !== period) fitPending.current = true;
    const view = period === "D" ? 120 : period === "W" ? 104 : 60;
    if (prevLen.current === 0 || fitPending.current) {
      ts.setVisibleLogicalRange({ from: Math.max(0, shown.length - view), to: shown.length + 2 });
      if (period === "D" || shown.length >= view || !state.current.hasMore) fitPending.current = false;
    } else if (range && added > 0) ts.setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
    prevLen.current = shown.length;
    prevPeriod.current = period;
  }, [shown, period]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const chg = last && prev ? last.close - prev.close : 0;
  const rate = last && prev ? (chg / prev.close) * 100 : 0;
  const tone = chg > 0 ? "up" : chg < 0 ? "down" : "";
  const sym = data?.symbol;

  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label={`${target.code} 차트`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ins-uschart" data-source={data?.source} data-ms={elapsed ?? undefined}>
        <div className="head">
          <div className="title">
            <strong>{target.code.replace(/([a-z])$/, (c) => `.${c.toUpperCase()}`)}</strong>
            <span>{sym?.name ?? target.name ?? ""}</span>
            {sym && <small>{sym.market}</small>}
          </div>
          {last && (
            <div className={`quote ${tone}`}>
              <strong>{price(last.close, "USD")}</strong>
              <em>
                {chg > 0 ? "▲" : chg < 0 ? "▼" : ""} {Math.abs(chg).toFixed(2)} ({pct(rate)})
              </em>
            </div>
          )}
          <div className="ins-seg" role="radiogroup" aria-label="봉 단위">
            {PERIODS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={period === k}
                onClick={() => {
                  state.current.period = k; // 스크롤 콜백이 바로 읽도록 먼저
                  setPeriod(k);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {sym?.exchange && (
            <Link
              className="open-log"
              href={`/workshop?symbol=${encodeURIComponent(target.code.replace(/([a-z])$/, (c) => `.${c.toUpperCase()}`))}&name=${encodeURIComponent(sym.name)}&market=${encodeURIComponent(sym.market)}&exchange=${sym.exchange}`}
              title="분봉 · 실시간 체결 · 드로잉 · 매매일지"
            >
              트레이딩 로그에서 열기
            </Link>
          )}
          <button type="button" className="close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="body">
          <div ref={box} className="us-canvas" />
          {!data && !error && (
            <div className="ins-state overlay">
              <BeeLoader size="sm" />
            </div>
          )}
          {error && (
            <div className="ins-state overlay">
              <p>{error}</p>
            </div>
          )}
          {loadingMore && <span className="more">예전 봉 불러오는 중…</span>}
        </div>
        <p className="foot">
          수정주가 · 달러 · 왼쪽으로 넘기면 예전 봉을 이어서 불러와요
        </p>
      </div>
    </div>
  );
}
