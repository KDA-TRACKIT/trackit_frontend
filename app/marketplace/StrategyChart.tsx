"use client";
// 월별 전략 차트: 그 달 일봉 + 트레이더가 그은 선(추세선 · 반직선 · 수평선 · 채널 · 피보나치 · 엘리어트 파동 · 차트 패턴 · 이동평균 · 밴드)
//   + 매수/매도 표시(가격 함께) + 아래 보조지표 창(RSI · MACD · 거래량 — 규칙이 쓰는 것만)
//   글씨가 봉 · 선과 겹치지 않게: 선 이름은 차트 위 범례로 빼고, 가격 창 위아래에 여백을 두어 매수/매도 · 꼭지 이름표는 빈 곳에
import { useEffect, useMemo, useRef } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers, type Logical, type SeriesMarker, type Time } from "lightweight-charts";

export type SimLine =
  /** ray: 반직선 — a, b 두 점을 지나 차트 오른쪽 끝까지 */
  | { kind: "hline" | "trend" | "ray"; label: string; a: [string, number]; b: [string, number] }
  /** 차트 패턴(헤드앤숄더 · 쌍바닥 · 컵앤핸들 …): 꼭지마다 [날짜, 가격, 이름표, 고점 H / 저점 L] */
  | { kind: "pattern"; label: string; points: [string, number, string, "H" | "L"][] }
  | { kind: "poly"; label: string; points: [string, number][] }
  /** 엘리어트 파동: 꼭지마다 [날짜, 가격, 파동 번호] */
  | { kind: "wave"; label: string; points: [string, number, string][] }
  /** 손그림 (기영이 얼굴 등): 획마다 [날짜, 그 봉에서 오른쪽으로 몇 봉(소수), 가격] */
  | { kind: "doodle"; label: string; strokes: [string, number, number][][] };
export type SimTrade = {
  code: string;
  name: string;
  entry: { d: string; px: number; why: string };
  exit: { d: string; px: number; why: string };
  ret: number;
  followed: boolean;
  lines: SimLine[];
};
/** 매매가 아닌 기록: 증시 메모(시장 전체) · 종목 노트(안 산 종목 관찰, 기다리는 자리에 선) */
/** carry: 앞 달 전략에서 산 매매가 이 달로 이어진 것 (매수 근거는 진입한 달에) */
export type SimNote = { type: "market" | "stock" | "carry"; d: string; text: string; code?: string; name?: string; lines?: SimLine[] };
/** 차트 아래 보조지표 창: 봉과 같은 순서의 값 (규칙이 쓰는 것만) */
export type SimInd = { rsi?: (number | null)[]; macd?: number[]; signal?: number[]; volume?: boolean };
/** [날짜, 시가, 고가, 저가, 종가, 거래량] */
export type SimCandle = [string, number, number, number, number, number];

const PALETTE = ["#3b6fd8", "#d97706", "#7c3aed", "#0d9488", "#db2777"];
const PRICE_H = 320;
const PANE_H = 110;

type Plan = {
  key: string;
  label: string;
  kind: SimLine["kind"];
  color: string;
  width: 1 | 2;
  style: LineStyle;
  pts: [string, number][];
  /** 범례에 같이 쓰는 가격 (수평선 · 피보나치) */
  level?: number;
};
type Tag = { d: string; text: string; hl: "H" | "L"; color: string };

/** 그릴 선 · 꼭지 이름표 (같은 선은 한 번만, 차트 구간 밖 점은 뺌) — 그리기와 범례가 같이 씀 */
type Doodle = { label: string; strokes: [string, number, number][][] };
/** 손 들고 돌파한 날의 그림 (예전 라벨 "빛의 검" 도) */
const isSword = (label: string) => label.includes("손 들고") || label.includes("빛의 검");

function plan(candles: SimCandle[], lines: SimLine[]): { plans: Plan[]; tags: Tag[]; doodles: Doodle[] } {
  const first = candles[0][0];
  const last = candles[candles.length - 1][0];
  const at = new Map(candles.map(([d], x) => [d, x]));
  const seen = new Set<string>();
  const plans: Plan[] = [];
  const tags: Tag[] = [];
  const doodles: Doodle[] = [];
  let color = 0;
  for (const ln of lines) {
    if (ln.kind === "doodle") {
      const key = `${ln.label}:${ln.strokes[0]?.[0]?.join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        doodles.push({ label: ln.label, strokes: ln.strokes });
      }
      continue;
    }
    let pts: [string, number][] = ln.kind === "poly" ? ln.points : ln.kind === "wave" || ln.kind === "pattern" ? ln.points.map(([d, v]) => [d, v] as [string, number]) : [ln.a, ln.b];
    if (ln.kind === "ray") {
      // 반직선: 두 점의 기울기 그대로 마지막 봉까지 (봉 순서 기준)
      const ia = at.get(ln.a[0]);
      const ib = at.get(ln.b[0]);
      if (ia !== undefined && ib !== undefined && ib !== ia) {
        const end = candles.length - 1;
        pts = [ln.a, [candles[end][0], Math.round((ln.a[1] + ((ln.b[1] - ln.a[1]) / (ib - ia)) * (end - ia)) * 100) / 100]];
      }
    }
    const inRange = pts.filter(([d]) => d >= first && d <= last);
    const key = `${ln.label}:${inRange[0]?.[0]}:${inRange[0]?.[1]}`;
    if (seen.has(key) || inRange.length < 2) continue;
    seen.add(key);
    const uniq = [...new Map(inRange.map(([d, v]) => [d, v])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (uniq.length < 2) continue;
    const isMa = ln.kind === "poly" && /선|밴드/.test(ln.label);
    const fib = ln.label.startsWith("피보나치");
    const c = ln.label.includes("기영이")
      ? "#eabc68"
      : fib
        ? /0\.5$|0\.618$/.test(ln.label)
          ? "#d97706"
          : "#9aa3b2"
        : ln.kind === "wave"
          ? "#7c3aed"
          : ln.kind === "pattern"
            ? "#0d9488"
            : PALETTE[color++ % PALETTE.length];
    plans.push({
      key,
      label: ln.label,
      kind: ln.kind,
      color: c,
      width: isMa ? 1 : 2,
      style: ln.kind === "hline" ? LineStyle.Dashed : ln.kind === "ray" ? LineStyle.LargeDashed : LineStyle.Solid,
      pts: uniq,
      level: ln.kind === "hline" ? uniq[0][1] : undefined,
    });
    // 꼭지 이름표는 짧게 (왼쪽 어깨 → 어깨, 컵 바닥 → 바닥)
    if (ln.kind === "pattern")
      for (const [d, , lab, hl] of ln.points) if (lab && d >= first && d <= last) tags.push({ d, hl, color: "#0d9488", text: lab.replace(/^(왼쪽|오른쪽) /, "").replace(/^컵 /, "") });
    if (ln.kind === "wave") ln.points.forEach(([d, , lab], k) => d >= first && d <= last && tags.push({ d, hl: k % 2 ? "H" : "L", color: "#7c3aed", text: lab }));
  }
  // 손 든(빛의 검) 그림이 있으면 같은 차트의 얼굴만 그린 것(관찰 노트)은 빼서 얼굴이 겹치지 않게
  const sword = doodles.some((g) => isSword(g.label));
  return { plans, tags, doodles: sword ? doodles.filter((g) => isSword(g.label)) : doodles.slice(0, 1) };
}

export default function StrategyChart({
  candles,
  trades,
  notes = [],
  ind = {},
  code,
  dark,
  currency = "KRW",
}: {
  candles: SimCandle[];
  trades: SimTrade[];
  notes?: SimNote[];
  ind?: SimInd;
  code: string;
  dark: boolean;
  currency?: "KRW" | "USD";
}) {
  const box = useRef<HTMLDivElement>(null);
  /** 매수 · 매도 가격 글씨를 얹는 층 (차트 위, 마우스는 통과) */
  const overlay = useRef<HTMLDivElement>(null);
  const money = useMemo(() => (n: number) => (currency === "USD" ? `$${n.toFixed(2)}` : n.toLocaleString("ko-KR")), [currency]);
  const mine = useMemo(() => trades.filter((t) => t.code === code), [trades, code]);
  // 이 종목의 매매에 그은 선 + 종목 노트에 그은 선 (매매 없이 기다린 자리)
  const { plans, tags, doodles } = useMemo(
    () => (candles.length ? plan(candles, [...mine.flatMap((t) => t.lines), ...notes.filter((n) => n.code === code).flatMap((n) => n.lines ?? [])]) : { plans: [], tags: [], doodles: [] }),
    [candles, mine, notes, code],
  );

  useEffect(() => {
    const el = box.current;
    if (!el || !candles.length) return;
    const up = dark ? "#4fd18b" : "#1f9d55";
    const down = dark ? "#ff6b6b" : "#e03131";
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: dark ? "#161a22" : "#ffffff" }, textColor: dark ? "#aab2c0" : "#555", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: dark ? "#222833" : "#f2f3f5" }, horzLines: { color: dark ? "#222833" : "#f2f3f5" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 3 },
      localization: { locale: "ko-KR" },
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false, lastValueVisible: false });
    candle.setData(candles.map(([d, o, h, l, c]) => ({ time: d as Time, open: o, high: h, low: l, close: c })));
    // 가격 창 위아래 여백: 매수/매도 · 꼭지 이름표가 봉 · 선 위가 아니라 빈 곳에
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.2, bottom: 0.2 } });
    // 손그림(기영이 얼굴 · 빛의 검)이 다 보이게 세로 범위를 넓힘
    const dPrices = doodles.flatMap((g) => g.strokes.flat().map((p) => p[2]));
    if (dPrices.length) {
      const lo = Math.min(...dPrices);
      const hi = Math.max(...dPrices);
      candle.applyOptions({
        autoscaleInfoProvider: (orig: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
          const r = orig();
          return r ? { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, lo), maxValue: Math.max(r.priceRange.maxValue, hi) } } : r;
        },
      });
      candle.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.04 } });
    }

    // 선 (이름은 차트 안에 안 쓰고 범례로)
    for (const p of plans) {
      const s = chart.addSeries(LineSeries, { color: p.color, lineWidth: p.width, lineStyle: p.style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(p.pts.map(([d, v]) => ({ time: d as Time, value: v })));
    }

    const first = candles[0][0];
    const last = candles[candles.length - 1][0];
    // 매수 · 매도 (가격 함께) + 꼭지 이름표. 같은 날 위/아래에 여러 개면 한 줄로 합쳐 겹치지 않게
    const slots = new Map<string, { time: Time; position: "aboveBar" | "belowBar"; shape: SeriesMarker<Time>["shape"]; color: string; texts: string[] }>();
    const add = (d: string, position: "aboveBar" | "belowBar", shape: SeriesMarker<Time>["shape"], color: string, text: string) => {
      const k = `${d}:${position}`;
      const cur = slots.get(k);
      if (cur) cur.texts.push(text);
      else slots.set(k, { time: d as Time, position, shape, color, texts: [text] });
    };
    // 매수 · 매도: 봉에는 화살표만. 가격 글씨는 화살표 옆 빈 곳에 (아래 placeLabels)
    for (const t of mine) {
      if (t.entry.d >= first && t.entry.d <= last) add(t.entry.d, "belowBar", "arrowUp", "#3b6fd8", "");
      if (t.exit.d >= first && t.exit.d <= last) add(t.exit.d, "aboveBar", "arrowDown", t.ret >= 0 ? up : down, "");
    }
    // 꼭지 이름표가 같은 쪽 매수/매도 글씨와 3봉 안이면 글씨는 빼고 점만 (가로로 겹치지 않게)
    const idx = new Map(candles.map(([d], x) => [d, x]));
    const near = (d: string, position: string) =>
      [...slots.values()].some((m) => m.position === position && Math.abs((idx.get(String(m.time)) ?? -99) - (idx.get(d) ?? 99)) <= 3);
    for (const g of tags) {
      const position = g.hl === "H" ? "aboveBar" : "belowBar";
      if (near(g.d, position)) slots.set(`${g.d}:${position}:dot`, { time: g.d as Time, position, shape: "circle", color: g.color, texts: [] });
      else add(g.d, position, "circle", g.color, g.text);
    }
    createSeriesMarkers(
      candle,
      [...slots.values()].map((m) => ({ time: m.time, position: m.position, shape: m.shape, color: m.color, text: m.texts.join(" · ") })).sort((a, b) => String(a.time).localeCompare(String(b.time))),
    );

    // ── 아래 보조지표 창 (이름 · 값은 오른쪽 축에만) ──
    const times = candles.map(([d]) => d as Time);
    const entries = mine.map((t) => t.entry.d).filter((d) => d >= first && d <= last);
    const base = { priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false };
    let pane = 1;
    if (ind.volume) {
      const v = chart.addSeries(HistogramSeries, { ...base, lastValueVisible: false, priceFormat: { type: "volume" } }, pane++);
      v.setData(candles.map(([d, o, , , cl, vol]) => ({ time: d as Time, value: vol, color: cl >= o ? `${up}99` : `${down}99` })));
    }
    if (ind.rsi) {
      const r = chart.addSeries(LineSeries, { ...base, color: "#7c3aed", lineWidth: 2, title: "RSI" }, pane);
      r.setData(ind.rsi.flatMap((v, x) => (v === null ? [] : [{ time: times[x], value: v }])));
      r.createPriceLine({ price: 70, color: "#9aa3b2", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "" });
      r.createPriceLine({ price: 30, color: "#d97706", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "" });
      r.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 } });
      createSeriesMarkers(r, entries.map((d) => ({ time: d as Time, position: "belowBar" as const, shape: "arrowUp" as const, color: "#3b6fd8" })));
      pane++;
    }
    if (ind.macd && ind.signal) {
      const sig = ind.signal;
      const h = chart.addSeries(HistogramSeries, { ...base, lastValueVisible: false }, pane);
      h.setData(ind.macd.map((v, x) => ({ time: times[x], value: Math.round((v - sig[x]) * 100) / 100, color: v - sig[x] >= 0 ? `${up}88` : `${down}88` })));
      const ml = chart.addSeries(LineSeries, { ...base, color: "#3b6fd8", lineWidth: 2, title: "MACD" }, pane);
      ml.setData(ind.macd.map((v, x) => ({ time: times[x], value: v })));
      const sl = chart.addSeries(LineSeries, { ...base, color: "#d97706", lineWidth: 1, title: "시그널" }, pane);
      sl.setData(sig.map((v, x) => ({ time: times[x], value: v })));
      createSeriesMarkers(ml, entries.map((d) => ({ time: d as Time, position: "belowBar" as const, shape: "arrowUp" as const, color: "#3b6fd8" })));
      pane++;
    }
    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setHeight(PRICE_H);
      for (let x = 1; x < panes.length; x++) panes[x].setHeight(PANE_H);
    }
    chart.timeScale().fitContent();

    // ── 매수 · 매도 가격 글씨: 화살표 바로 옆, 봉 · 그은 선 · 다른 글씨를 가리지 않는 자리 ──
    const layer = overlay.current;
    const labels = mine.flatMap((t) => [
      ...(t.entry.d >= first && t.entry.d <= last ? [{ d: t.entry.d, side: "buy" as const, text: `매수 ${money(t.entry.px)}`, color: "#3b6fd8" }] : []),
      ...(t.exit.d >= first && t.exit.d <= last ? [{ d: t.exit.d, side: "sell" as const, text: `매도 ${money(t.exit.px)}`, color: t.ret >= 0 ? up : down }] : []),
    ]);
    type Box = { x1: number; y1: number; x2: number; y2: number };
    const hit = (a: Box, b: Box) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
    const placeLabels = () => {
      if (!layer) return;
      layer.replaceChildren();
      const ts = chart.timeScale();
      // 손그림: 봉 위치(+소수) → 화면 좌표, 펜으로 그린 것처럼 둥근 선
      const doodleDots: { x: number; y: number }[] = [];
      if (doodles.length) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "mk-sim-doodle");
        const at = new Map(candles.map(([d], x) => [d, x]));
        for (const g of doodles) {
          for (const st of g.strokes) {
            const pts: string[] = [];
            for (const [d, f, v] of st) {
              const k = at.get(d);
              // 봉 사이(소수) 위치는 라이브러리가 0 을 돌려줘서 양옆 봉 좌표로 직접 나눔
              const base = Math.floor(f);
              const c0 = k === undefined ? null : ts.logicalToCoordinate((k + base) as Logical);
              const c1 = k === undefined ? null : ts.logicalToCoordinate((k + base + 1) as Logical);
              const x = c0 === null ? null : c1 === null ? c0 : c0 + (c1 - c0) * (f - base);
              const y = candle.priceToCoordinate(v);
              if (x === null || y === null) continue;
              pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
              doodleDots.push({ x, y });
            }
            if (pts.length < 2) continue;
            const pl = document.createElementNS(NS, "polyline");
            pl.setAttribute("points", pts.join(" "));
            pl.setAttribute("class", isSword(g.label) && st === g.strokes[g.strokes.length - 1] ? "sword" : "");
            svg.appendChild(pl);
          }
        }
        layer.appendChild(svg);
      }
      const xs = candles.map(([d]) => ts.timeToCoordinate(d as Time));
      const ok = xs.filter((v): v is NonNullable<typeof v> => v !== null);
      const spacing = ok.length > 1 ? (ok[ok.length - 1] - ok[0]) / (ok.length - 1) : 8;
      const hw = Math.max(2, spacing * 0.4);
      const W = ts.width();
      const H = chart.panes()[0].getHeight();
      const py = (v: number) => candle.priceToCoordinate(v);
      // 피할 것: 봉 몸통 + 꼬리, 그은 선 (선은 3px 간격 점으로)
      const boxes: Box[] = [];
      candles.forEach(([, , h, l], k) => {
        const x = xs[k];
        const a = py(h);
        const b = py(l);
        if (x !== null && a !== null && b !== null) boxes.push({ x1: x - hw, y1: a - 1, x2: x + hw, y2: b + 1 });
      });
      const dots: { x: number; y: number }[] = [];
      for (const p of plans) {
        for (let k = 1; k < p.pts.length; k++) {
          const ax = ts.timeToCoordinate(p.pts[k - 1][0] as Time);
          const bx = ts.timeToCoordinate(p.pts[k][0] as Time);
          const ay = py(p.pts[k - 1][1]);
          const by = py(p.pts[k][1]);
          if (ax === null || bx === null || ay === null || by === null) continue;
          const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
          for (let q = 0; q <= steps; q++) dots.push({ x: ax + ((bx - ax) * q) / steps, y: ay + ((by - ay) * q) / steps });
        }
      }
      const placed: Box[] = [];
      for (const lb of labels) {
        const k = candles.findIndex(([d]) => d === lb.d);
        const x = xs[k];
        const yHi = py(candles[k][2]);
        const yLo = py(candles[k][3]);
        if (x === null || yHi === null || yLo === null) continue;
        const el = document.createElement("span");
        el.className = `mk-sim-tag ${lb.side}`;
        el.textContent = lb.text;
        el.style.setProperty("--tag", lb.color);
        layer.appendChild(el);
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        // 화살표 위치 (매수 = 저가 아래, 매도 = 고가 위). 가까운 자리부터: 화살표 옆 → 화살표 바깥쪽으로 조금씩
        const ay = lb.side === "buy" ? yLo + 14 : yHi - 14;
        const dir = lb.side === "buy" ? 1 : -1;
        const cands: [number, number][] = [];
        for (let step = 0; step <= 8; step++) {
          const yc = ay + dir * step * 6 - h / 2;
          cands.push([x + hw + 6, yc], [x - hw - 6 - w, yc], [x - w / 2, ay + dir * (10 + step * 6) - (dir > 0 ? 0 : h)]);
        }
        let best: Box | null = null;
        for (const [cx, cy] of cands) {
          const b = { x1: cx, y1: cy, x2: cx + w, y2: cy + h };
          if (b.x1 < 0 || b.x2 > W || b.y1 < 0 || b.y2 > H) continue;
          if (boxes.some((o) => hit(b, o)) || placed.some((o) => hit(b, o))) continue;
          if ([...dots, ...doodleDots].some((d) => d.x > b.x1 - 1 && d.x < b.x2 + 1 && d.y > b.y1 - 1 && d.y < b.y2 + 1)) continue;
          best = b;
          break;
        }
        // 빈 자리가 없으면 화살표 바로 옆 (그래도 화면 안)
        const f = best ?? { x1: Math.min(Math.max(0, x + hw + 6), W - w), y1: Math.min(Math.max(0, ay - h / 2), H - h), x2: 0, y2: 0 };
        f.x2 = f.x1 + w;
        f.y2 = f.y1 + h;
        placed.push(f);
        el.style.left = `${f.x1}px`;
        el.style.top = `${f.y1}px`;
      }
    };
    const raf = requestAnimationFrame(placeLabels);
    const onRange = () => requestAnimationFrame(placeLabels);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const ro = new ResizeObserver(onRange);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      layer?.replaceChildren();
      chart.remove();
    };
  }, [candles, mine, plans, tags, doodles, ind, dark, money]);

  const n = (ind.volume ? 1 : 0) + (ind.rsi ? 1 : 0) + (ind.macd ? 1 : 0);
  const legend = [...new Map(plans.map((p) => [`${p.label}:${p.color}`, p])).values()];
  const doodleLabels = [...new Set(doodles.map((g) => g.label))];
  return (
    <>
      {/* 선 이름 · 가격은 차트 안이 아니라 여기 (봉 · 선과 안 겹치게) */}
      {(legend.length > 0 || doodleLabels.length > 0) && (
        <ul className="mk-sim-legend">
          {doodleLabels.map((l) => (
            <li key={l}>
              <i className="doodle" />
              {l}
            </li>
          ))}
          {legend.map((p) => (
            <li key={p.key}>
              <i style={{ borderTopColor: p.color, borderTopStyle: p.style === LineStyle.Solid ? "solid" : "dashed" }} />
              {p.label}
              {p.level !== undefined && <b>{money(p.level)}</b>}
            </li>
          ))}
        </ul>
      )}
      <div className="mk-sim-chart-wrap">
        <div ref={box} className="mk-sim-chart" style={{ height: PRICE_H + 40 + n * (PANE_H + 10) }} />
        <div ref={overlay} className="mk-sim-tags" aria-hidden />
      </div>
      {n > 0 && (
        <p className="mk-sim-panes">
          아래 보조지표: {[ind.volume && "거래량", ind.rsi && "RSI(14) · 30/70 기준선", ind.macd && "MACD · 시그널 · 히스토그램"].filter(Boolean).join(" / ")} · 파란 화살표 = 진입한 날
        </p>
      )}
    </>
  );
}
