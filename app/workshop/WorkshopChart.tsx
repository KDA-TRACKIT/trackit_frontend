"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getTool, toolsByGroup, type Drawing, type DrawingPoint, type ToolGroup } from "../../lib/drawing";
import { DrawingLayer, fromChartTime, toChartTime } from "../../lib/drawing/render/lwc-adapter";
import { INTERVAL_LABEL, type Bar, type ChartNote, type Interval } from "../../lib/mock/workshop";
import { fetchDailyNews, type NewsArticle } from "../../lib/api/news";

const UP = "#f0294f";
const DOWN = "#1666f0";
const DRAW_STYLE = { color: "#2962ff", width: 1.5 };

// 아이콘은 피그마 작업실 프레임(38:184)에서 잘라낸 SVG (public/icons)
const TOOL_GROUPS: { key: ToolGroup; label: string; icon: string }[] = [
  { key: "line", label: "라인·채널·피치포크", icon: "/icons/line.svg" },
  { key: "fib", label: "피보나치·갠", icon: "/icons/fib.svg" },
  // 패턴·파동·사이클, 브러시는 툴이 아직 없어 바에서 뺀다 (툴을 등록하면 여기 다시 추가)
  { key: "measure", label: "측정", icon: "/icons/measure.svg" },
  { key: "arrow", label: "화살표", icon: "/icons/arrow.svg" },
  { key: "shape", label: "도형", icon: "/icons/shape.svg" },
];

const RANGES: { label: string; days: number | "ytd" | "all" }[] = [
  { label: "1일", days: 1 },
  { label: "5일", days: 5 },
  { label: "1개월", days: 30 },
  { label: "3개월", days: 90 },
  { label: "6개월", days: 180 },
  { label: "연초 이후", days: "ytd" },
  { label: "1년", days: 365 },
  { label: "전체", days: "all" },
];

const won = (value: number) => value.toLocaleString("ko-KR");

type Props = {
  bars: Bar[];
  interval: Interval;
  onIntervalChange: (interval: Interval) => void;
  onDrawingsChange?: (drawings: Drawing[]) => void;
  /** 저장본에서 불러온 드로잉. key가 바뀔 때만 차트에 넣는다 (실행 취소 기록도 비움) */
  loadedDrawings?: { key: string; drawings: Drawing[] };
  notes: ChartNote[];
  /** 종목·간격이 바뀔 때만 바뀌는 값. 같으면 실시간 갱신으로 보고 마지막 봉만 고친다 (확대 상태 유지) */
  dataKey: string;
  symbolCode: string;
  symbolName: string;
  market: string;
  /** 봉이 없을 때 차트 가운데 안내 */
  emptyMessage?: string;
  onAddNote: (note: { time: number; price: number; text: string }) => void;
};

/** 노트 입력창을 띄울 위치(차트 영역 기준 px)와 데이터 좌표 */
type NoteDraft = { x: number; y: number; time: number; price: number };

/** 날짜 축 위에 띄우는 뉴스 버튼 / 열린 뉴스 */
/** axis: 날짜 축 높이(px) — 버튼을 축 바로 위에 붙인다 */
type AxisHover = { x: number; bar: Bar; axis: number; width: number };
type NewsView = { x: number; bar: Bar; axis: number; width: number; status: "loading" | "done" | "error"; items: NewsArticle[] };

/** 봉 시각 → KST 날짜 YYYY-MM-DD */
function kstDay(time: number) {
  return new Date((time + 9 * 3600) * 1000).toISOString().slice(0, 10);
}

/** 이동평균선 (지표 메뉴) */
const MA_LINES = [
  { period: 5, color: "#f59f00" },
  { period: 20, color: "#7048e8" },
  { period: 60, color: "#0ca678" },
] as const;

function sma(bars: Bar[], period: number) {
  const out: { time: number; value: number }[] = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: b.time, value: Math.round(sum / period) });
  });
  return out;
}

export default function WorkshopChart({ bars, interval, onIntervalChange, onDrawingsChange, loadedDrawings, notes, onAddNote, dataKey, symbolCode, symbolName, market, emptyMessage }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const layerRef = useRef<DrawingLayer | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // 차트 이벤트 핸들러가 항상 최신 값을 보도록 ref로도 들고 있는다
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const activeToolRef = useRef<string | null>(null);
  const pendingRef = useRef<DrawingPoint[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [maOn, setMaOn] = useState<number[]>([]);
  const [indicatorOpen, setIndicatorOpen] = useState(false);
  const maSeriesRef = useRef(new Map<number, ISeriesApi<"Line">>());
  const drawingsRef = useRef<Drawing[]>([]);
  const [past, setPast] = useState<Drawing[][]>([]);
  const [future, setFuture] = useState<Drawing[][]>([]);
  const [openGroup, setOpenGroup] = useState<ToolGroup | null>(null);
  const [hovered, setHovered] = useState<Bar | null>(null);
  const [axisHover, setAxisHover] = useState<AxisHover | null>(null);
  const [news, setNews] = useState<NewsView | null>(null);
  const newsAbortRef = useRef<AbortController | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // 차트 노트 모드: 켜면 차트를 클릭한 지점에 메모 입력창이 뜬다
  const [noteMode, setNoteMode] = useState(false);
  const noteModeRef = useRef(false);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const last = bars[bars.length - 1] as Bar | undefined;
  const legendBar = hovered ?? last;
  const legendPrev = legendBar ? (bars[bars.indexOf(legendBar) - 1] ?? legendBar) : undefined;
  const loadedKeyRef = useRef<string | null>(null);
  const shownRef = useRef<Bar[]>([]);

  // 차트 생성 (한 번)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#555",
        fontSize: 11,
        fontFamily: "Pretendard, 'Noto Sans KR', sans-serif",
        attributionLogo: false,
      },
      grid: { vertLines: { color: "#f0f0f0" }, horzLines: { color: "#f0f0f0" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, minimumWidth: 78 },
      // minBarSpacing: 1985년부터 1만 개 넘는 일봉도 "전체"에서 한 화면에 들어오게
      timeScale: { borderVisible: false, rightOffset: 4, minBarSpacing: 0.02 },
      localization: {
        locale: "ko-KR",
        priceFormatter: (price: number) => won(Math.round(price)),
        // 차트 시각은 KST 벽시계 값이므로 UTC 기준으로 읽으면 KST가 나온다
        timeFormatter: (time: Time) => {
          const d = new Date((time as number) * 1000);
          const pad = (n: number) => String(n).padStart(2, "0");
          const date = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
          return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? date : `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        },
      },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceLineColor: UP,
      priceLineStyle: LineStyle.Dashed,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.2, bottom: 0.24 } });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const layer = new DrawingLayer();
    candle.attachPrimitive(layer);
    markersRef.current = createSeriesMarkers(candle, []);
    // 새 차트는 비어 있으므로 다음 데이터 반영은 전체 setData로 (개발 모드 재마운트·핫리로드 대비)
    loadedKeyRef.current = null;
    shownRef.current = [];
    layer.setDrawings(drawingsRef.current);

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;
    const maSeries = maSeriesRef.current;
    maSeries.clear();
    for (const { period, color } of MA_LINES) {
      maSeries.set(period, chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false }));
    }
    layerRef.current = layer;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      layerRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // 차트 노트를 캔들 위 마커로 표시. 분봉에선 노트 시각 이전의 가장 가까운 봉에 붙인다
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers || bars.length === 0) return;
    const items = notes
      .map((note) => {
        let target: Bar | undefined;
        for (const bar of bars) if (bar.time <= note.time) target = bar;
        return target ? { time: toChartTime(target.time), position: "aboveBar" as const, shape: "arrowDown" as const, color: "#344d7d", text: "노트" } : null;
      })
      .filter((m) => m !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));
    markers.setMarkers(items);
  }, [notes, bars]);

  // 데이터 반영: 종목·간격이 바뀌면 전체 교체, 실시간 갱신이면 바뀐 끝부분만 update
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const volume = volumeRef.current;
    if (!chart || !candle || !volume) return;
    const toCandle = (b: Bar) => ({ time: toChartTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close });
    const toVolume = (b: Bar) => ({ time: toChartTime(b.time), value: b.volume, color: b.close >= b.open ? "rgba(240,41,79,0.45)" : "rgba(22,102,240,0.4)" });
    const prev = shownRef.current;
    const live = loadedKeyRef.current === dataKey && prev.length > 0 && bars.length >= prev.length && bars.length - prev.length <= 2;
    shownRef.current = bars;
    if (live) {
      for (let i = Math.max(0, prev.length - 1); i < bars.length; i++) {
        candle.update(toCandle(bars[i]));
        volume.update(toVolume(bars[i]));
      }
      return;
    }
    candle.setData(bars.map(toCandle));
    volume.setData(bars.map(toVolume));
    loadedKeyRef.current = bars.length > 0 ? dataKey : null;
    const intraday = interval !== "1d";
    chart.applyOptions({
      timeScale: {
        timeVisible: intraday,
        secondsVisible: interval === "1s",
        tickMarkFormatter: (time: Time, tickType: number) => {
          const d = new Date((time as number) * 1000);
          const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(d.getUTCDate()).padStart(2, "0");
          // 0 = 해 바뀜, 1 = 달 바뀜 (lightweight-charts TickMarkType). 수십 년치 일봉에서 연도가 보이게
          if (!intraday && tickType === 0) return String(d.getUTCFullYear());
          if (!intraday && tickType === 1) return `${d.getUTCFullYear()}.${mm}`;
          if (!intraday || (d.getUTCHours() === 9 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)) return `${mm}.${dd}`;
          if (interval === "1s") return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
          return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        },
      },
    });
    if (interval === "1d" && bars.length > 160) {
      // 수십 년치 일봉은 최근 반년쯤만 보이게 (나머지는 스크롤·확대로)
      chart.timeScale().setVisibleLogicalRange({ from: bars.length - 130, to: bars.length + 4 });
    } else chart.timeScale().fitContent();
  }, [bars, interval, dataKey]);

  // 클릭으로 점 찍기, 마우스 이동으로 미리보기·범례
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const container = containerRef.current;
    if (!chart || !candle || !container) return;

    const pointAt = (x: number, y: number): DrawingPoint | null => {
      if (x > chart.paneSize().width) return null; // 가격 축 위 클릭은 무시
      const time = chart.timeScale().coordinateToTime(x);
      const price = candle.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time: fromChartTime(time), price: String(Math.round(price)) };
    };

    // 라이브러리의 subscribeClick은 500ms 안의 두 번째 클릭을 더블클릭 판정으로 돌려
    // 두 점이 떨어져 있으면 아무 이벤트도 보내지 않는다 → 빠르게 찍으면 끝점이 사라짐.
    // 그래서 브라우저 click을 직접 받고, 끌어서 이동(팬)한 경우만 걸러낸다.
    let down: { x: number; y: number } | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const handleClick = (event: MouseEvent) => {
      if (!down || Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y) > 5) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const point = pointAt(x, y);
      if (!point) return;
      if (noteModeRef.current) {
        setNoteDraft({ x, y, time: point.time, price: Math.round(Number(point.price) / 100) * 100 });
        setNoteInput("");
        return;
      }
      const tool = activeToolRef.current ? getTool(activeToolRef.current) : undefined;
      if (!tool) return;
      const points = [...pendingRef.current, point];
      if (points.length < tool.pointCount) {
        pendingRef.current = points;
        return;
      }
      pendingRef.current = [];
      layerRef.current?.setPreview(null);
      commit([...drawingsRef.current, { id: crypto.randomUUID(), toolId: tool.id, schemaVersion: tool.schemaVersion, points, style: DRAW_STYLE }]);
    };

    const handleMove = (param: MouseEventParams<Time>) => {
      const data = param.seriesData.get(candle) as CandlestickData<Time> | undefined;
      setHovered(data ? (bars.find((b) => toChartTime(b.time) === data.time) ?? null) : null);

      const tool = activeToolRef.current ? getTool(activeToolRef.current) : undefined;
      const point = param.point ? pointAt(param.point.x, param.point.y) : null;
      if (!tool || !point || pendingRef.current.length === 0) return;
      layerRef.current?.setPreview({ id: "preview", toolId: tool.id, schemaVersion: tool.schemaVersion, points: [...pendingRef.current, point], style: DRAW_STYLE });
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("click", handleClick);
    chart.subscribeCrosshairMove(handleMove);
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("click", handleClick);
      chart.unsubscribeCrosshairMove(handleMove);
    };
    // commit은 ref만 쓰므로 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);

  // Esc: 그리던 것 취소
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pendingRef.current = [];
      layerRef.current?.setPreview(null);
      selectTool(null);
      setNoteDraft(null);
      toggleNoteMode(false);
      setNews(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // selectTool·toggleNoteMode는 ref와 setter만 쓰므로 한 번만 등록한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 전체 화면: 차트 영역(이 section)만 화면을 채운다
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === sectionRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 이동평균선 데이터·표시
  useEffect(() => {
    for (const { period } of MA_LINES) {
      const series = maSeriesRef.current.get(period);
      if (!series) continue;
      const on = maOn.includes(period);
      series.applyOptions({ visible: on });
      series.setData(on ? sma(bars, period).map((p) => ({ time: toChartTime(p.time), value: p.value })) : []);
    }
  }, [bars, maOn]);

  // 저장본 드로잉 불러오기 (종목·일지가 바뀔 때)
  const loadedKey = loadedDrawings?.key;
  const [appliedKey, setAppliedKey] = useState<string | undefined>(undefined);
  if (loadedDrawings && loadedKey !== appliedKey) {
    // 렌더 중 상태 맞추기 (key가 바뀐 그 렌더에서 한 번)
    setAppliedKey(loadedKey);
    setDrawings(loadedDrawings.drawings);
    setPast([]);
    setFuture([]);
  }
  useEffect(() => {
    if (!loadedDrawings) return;
    drawingsRef.current = loadedDrawings.drawings;
    layerRef.current?.setDrawings(loadedDrawings.drawings);
    onDrawingsChange?.(loadedDrawings.drawings);
    // key가 바뀔 때만 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  function apply(next: Drawing[]) {
    drawingsRef.current = next;
    setDrawings(next);
    layerRef.current?.setDrawings(next);
    onDrawingsChange?.(next);
  }

  function commit(next: Drawing[]) {
    setPast((p) => [...p, drawingsRef.current]);
    setFuture([]);
    apply(next);
  }

  function undo() {
    if (past.length === 0) return;
    setFuture((f) => [drawingsRef.current, ...f]);
    apply(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }

  function redo() {
    if (future.length === 0) return;
    setPast((p) => [...p, drawingsRef.current]);
    apply(future[0]);
    setFuture((f) => f.slice(1));
  }

  function toggleNoteMode(on: boolean) {
    noteModeRef.current = on;
    setNoteMode(on);
    if (!on) setNoteDraft(null);
  }

  function saveNote() {
    if (!noteDraft || !noteInput.trim()) return;
    onAddNote({ time: noteDraft.time, price: noteDraft.price, text: noteInput.trim() });
    setNoteDraft(null);
    setNoteInput("");
    toggleNoteMode(false);
  }

  function selectTool(toolId: string | null) {
    if (toolId) toggleNoteMode(false);
    activeToolRef.current = toolId;
    setActiveToolId(toolId);
    pendingRef.current = [];
    layerRef.current?.setPreview(null);
    setOpenGroup(null);
  }

  function onGroupClick(group: ToolGroup) {
    const tools = toolsByGroup(group);
    if (tools.length === 1) selectTool(tools[0].id);
    else if (tools.length > 1) setOpenGroup(openGroup === group ? null : group);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void sectionRef.current?.requestFullscreen();
  }

  /** 날짜 축(또는 바로 위 버튼 줄)에 마우스가 오면 그 날짜의 뉴스 버튼을 띄운다 */
  function onAreaMove(event: React.MouseEvent) {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container || bars.length === 0 || activeToolId || noteMode) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const axisTop = rect.height - chart.timeScale().height();
    if (x > chart.paneSize().width || y < axisTop - 30) {
      if (axisHover) setAxisHover(null);
      return;
    }
    if (y < axisTop) return; // 버튼 위로 올라가는 중이면 그대로 둔다
    const t = chart.timeScale().coordinateToTime(x);
    if (t === null) return setAxisHover(null);
    const time = fromChartTime(t);
    let bar = bars[0];
    for (const b of bars) if (b.time <= time) bar = b;
    const bx = chart.timeScale().timeToCoordinate(toChartTime(bar.time) as Time) ?? x;
    if (axisHover?.bar !== bar) setAxisHover({ x: bx, bar, axis: rect.height - axisTop, width: chart.paneSize().width });
  }

  function openNews(target: AxisHover) {
    newsAbortRef.current?.abort();
    const ac = new AbortController();
    newsAbortRef.current = ac;
    const index = bars.indexOf(target.bar);
    setNews({ ...target, status: "loading", items: [] });
    setAxisHover(null);
    fetchDailyNews(symbolCode, kstDay(target.bar.time), { close: target.bar.close, prevClose: bars[index - 1]?.close, isLast: index === bars.length - 1, time: target.bar.time }, ac.signal)
      .then((items) => setNews((cur) => (cur && cur.bar === target.bar ? { ...cur, status: "done", items } : cur)))
      .catch(() => {
        if (!ac.signal.aborted) setNews((cur) => (cur && cur.bar === target.bar ? { ...cur, status: "error" } : cur));
      });
  }

  function showRange(days: number | "ytd" | "all") {
    const chart = chartRef.current;
    if (!chart || !last || bars.length === 0) return;
    if (days === "all") return chart.timeScale().fitContent();
    const lastTime = toChartTime(last.time);
    const from = days === "ytd" ? Date.UTC(new Date(lastTime * 1000).getUTCFullYear(), 0, 1) / 1000 : lastTime - days * 86400;
    chart.timeScale().setVisibleRange({ from: Math.max(from, toChartTime(bars[0].time)) as Time, to: lastTime });
  }

  const activeGroup = activeToolId ? getTool(activeToolId)?.group : null;
  const dayLabel = (bar: Bar) => kstDay(bar.time).slice(5).replace("-", ".");
  const change = legendBar && legendPrev ? legendBar.close - legendPrev.close : 0;
  const changeRate = legendPrev?.close ? (change / legendPrev.close) * 100 : 0;

  return (
    <section ref={sectionRef} className="ws-chart" aria-label="차트">
      <div className="ws-chart-toolbar">
        <div className="ws-intervals">
          {(Object.keys(INTERVAL_LABEL) as Interval[]).map((key) => (
            <button key={key} className={key === interval ? "active" : ""} onClick={() => onIntervalChange(key)}>
              {INTERVAL_LABEL[key].button}
            </button>
          ))}
        </div>
        <span className="ws-divider" />
        <div className="ws-indicator">
          <button className={`ws-tool-text${indicatorOpen ? " open" : ""}`} onClick={() => setIndicatorOpen(!indicatorOpen)} aria-expanded={indicatorOpen}>
            지표{maOn.length ? ` ${maOn.length}` : ""} ▾
          </button>
          {indicatorOpen && (
            <div className="ws-indicator-menu" role="menu">
              <p>이동평균선</p>
              {MA_LINES.map(({ period, color }) => (
                <label key={period}>
                  <input
                    type="checkbox"
                    checked={maOn.includes(period)}
                    onChange={(e) => setMaOn((list) => (e.target.checked ? [...list, period] : list.filter((p) => p !== period)))}
                  />
                  <i style={{ background: color }} />
                  MA {period}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="ws-divider" />
        <button
          className={`ws-tool-text ws-note-toggle${noteMode ? " active" : ""}`}
          onClick={() => {
            selectTool(null);
            toggleNoteMode(!noteMode);
          }}
          title="차트를 클릭한 지점에 메모를 남깁니다"
          aria-pressed={noteMode}
        >
          ✎ 차트 노트
        </button>
        <span className="ws-divider" />
        <button className="ws-icon-button" onClick={undo} disabled={past.length === 0} title="실행 취소">↶</button>
        <button className="ws-icon-button" onClick={redo} disabled={future.length === 0} title="다시 실행">↷</button>
        <button className="ws-icon-button ws-fullscreen" onClick={toggleFullscreen} title={fullscreen ? "전체 화면 끝내기 (Esc)" : "차트 전체 화면"} aria-pressed={fullscreen}>
          {fullscreen ? "⤡" : "⛶"}
        </button>
      </div>

      <div className="ws-chart-body">
        <nav className="ws-draw-tools" aria-label="드로잉 도구">
          <button className={activeToolId === null ? "active" : ""} onClick={() => selectTool(null)} title="커서 선택">
            <Image src="/icons/cursor.svg" width={20} height={20} alt="" unoptimized />
          </button>
          {TOOL_GROUPS.map(({ key, label, icon }) => {
            const tools = toolsByGroup(key);
            return (
              <div key={key} className="ws-draw-group">
                <button
                  className={activeGroup === key ? "active" : ""}
                  onClick={() => onGroupClick(key)}
                  title={label}
                >
                  <Image src={icon} width={20} height={20} alt="" unoptimized />
                  <span className="ws-more">›</span>
                </button>
                {openGroup === key && (
                  <div className="ws-flyout" role="menu">
                    <p>{label}</p>
                    {tools.map((tool) => (
                      <button key={tool.id} className={activeToolId === tool.id ? "active" : ""} onClick={() => selectTool(tool.id)} role="menuitem">
                        {tool.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <span className="ws-draw-divider" />
          <button onClick={() => drawings.length > 0 && commit([])} title="드로잉 모두 삭제">
            <Image src="/icons/trash.svg" width={20} height={20} alt="" unoptimized />
          </button>
        </nav>

        <div className="ws-chart-area" onMouseMove={onAreaMove} onMouseLeave={() => setAxisHover(null)}>
          <div className="ws-legend">
            <strong>
              {symbolName} · {INTERVAL_LABEL[interval].legend} · {market || "KRX"}
            </strong>
            {legendBar && (
            <span>
              시 {won(legendBar.open)} 고 {won(legendBar.high)} 저 {won(legendBar.low)} 종 {won(legendBar.close)}{" "}
              <em className={change >= 0 ? "up" : "down"}>
                {change >= 0 ? "+" : ""}
                {won(change)} ({change >= 0 ? "+" : ""}
                {changeRate.toFixed(2)}%)
              </em>
            </span>
            )}
          </div>
          {bars.length === 0 && emptyMessage && <div className="ws-empty">{emptyMessage}</div>}
          <div ref={containerRef} className={`ws-canvas${activeToolId || noteMode ? " drawing" : ""}`} />

          {noteMode && !noteDraft && <div className="ws-note-hint">메모를 남길 지점을 클릭하세요 · Esc 취소</div>}

          {noteDraft && (
            <div className="ws-note-pop" style={{ left: Math.max(8, noteDraft.x - 120), top: noteDraft.y + 14 }} onClick={(e) => e.stopPropagation()}>
              <small>{won(Math.round(noteDraft.price))}원 지점</small>
              <textarea
                autoFocus
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    saveNote();
                  }
                }}
                placeholder="이 지점에서 본 근거를 적어두세요"
                rows={3}
              />
              <div>
                <button onClick={() => setNoteDraft(null)}>취소</button>
                <button className="primary" disabled={!noteInput.trim()} onClick={saveNote}>노트 추가</button>
              </div>
            </div>
          )}

          {axisHover && !news && (
            <button className="ws-news-btn" style={{ left: axisHover.x, bottom: axisHover.axis + 4 }} onClick={() => openNews(axisHover)}>
              {dayLabel(axisHover.bar)} 뉴스 보기
            </button>
          )}

          {news && (
            <aside className="ws-news" style={{ left: Math.max(8, Math.min(news.x - 150, news.width - 308)), bottom: news.axis + 6 }} aria-live="polite">
              <header>
                <span className="ws-news-tag">AI 뉴스 · {kstDay(news.bar.time).replaceAll("-", ".")}</span>
                <button onClick={() => setNews(null)} aria-label="뉴스 닫기">✕</button>
              </header>
              {news.status === "loading" && <p className="ws-muted">뉴스를 불러오는 중…</p>}
              {news.status === "error" && <p className="ws-muted">뉴스를 불러오지 못했어요.</p>}
              {news.status === "done" && news.items.length === 0 && <p className="ws-muted">이 날짜의 뉴스가 없어요.</p>}
              {news.items.map((item) => (
                <article key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                  <small>{item.source}</small>
                </article>
              ))}
            </aside>
          )}
        </div>
      </div>

      <div className="ws-chart-footer">
        <div className="ws-ranges">
          {RANGES.map((range) => (
            <button key={range.label} onClick={() => showRange(range.days)}>
              {range.label}
            </button>
          ))}
        </div>
        <span>KRW · {INTERVAL_LABEL[interval].footer}</span>
      </div>
    </section>
  );
}
