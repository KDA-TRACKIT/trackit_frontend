"use client";
// 증시 캘린더 · 시장 맨 위: 지수 카드 줄(작은 추이) → 고른 지수의 차트 + 시장 현황
//   카드: 코스피 · 코스닥 · 원/달러 · 원/100엔 · S&P 500 · 나스닥 · 다우 · 미국 10년물 · 국고채 3년 · WTI · VIX · 비트코인 (모두 그래프)
//   차트: 국내는 5분봉(전일 오후는 흐리게 + 오늘), 미국 · 환율은 최근 3개월 일별. 점선 = 전일 종가
//   계속 새로: 장중엔 카드 10초 · 차트 15초, 장 밖엔 2분 · 5분. 탭이 안 보이면 멈추고 돌아오면 바로 (useLoad)
import {
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { memoAttr } from "../../lib/memo-target";
import { getIndexCards, getIndexDetail, type IndexCard, type IndexDetail, type IndexKey } from "../../lib/api/insights";
import { Failed, Loading, MissingKeys, pct, tone } from "./parts";
import { useLoad } from "./useLoad";
import { useDark } from "../marketplace/GuessFirst";

const KST = 9 * 3600;
/** 단위별 값: 금리 5.15% · 유가 $89.62 · 코인처럼 큰 원 값은 소수 없이 */
const fmt = (n: number, unit?: IndexCard["unit"]) => {
  if (unit === "원" && n >= 100_000) return Math.round(n).toLocaleString("ko-KR");
  const d = unit === "%" && (String(n).split(".")[1]?.length ?? 0) > 2 ? 3 : 2;
  const v = n.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  return unit === "%" ? `${v}%` : unit === "$" ? `$${v}` : v;
};
/** 전일 대비: 금리는 %p, 큰 원 값은 소수 없이 */
const signed = (n: number, unit?: IndexCard["unit"]) => {
  const a = Math.abs(n);
  const v = unit === "원" && a >= 1_000 ? Math.round(a).toLocaleString("ko-KR") : a.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: unit === "%" ? 3 : 2 });
  return `${n > 0 ? "▲" : n < 0 ? "▼" : ""}${v}${unit === "%" ? "%p" : ""}`;
};
const hhmmss = (ms: number) => new Date(ms + KST * 1000).toISOString().slice(11, 19);

function statusText(c: IndexCard) {
  if (c.status === "open") return "장중";
  if (c.status === "live") return "실시간";
  if (c.status === "closed") return "장마감";
  return `${c.asOf.slice(5).replace("-", ".")} 종가`;
}

/** 카드 작은 그래프: 전일 종가 점선 + 선 아래 옅은 칠 */
function Spark({ values, base, up }: { values: number[]; base: number; up: boolean }) {
  if (values.length < 2) return <span className="ins-mk-spark" />;
  const w = 92;
  const h = 40;
  const lo = Math.min(base, ...values);
  const hi = Math.max(base, ...values);
  const y = (v: number) => (hi === lo ? h / 2 : 2 + (1 - (v - lo) / (hi - lo)) * (h - 4));
  const x = (i: number) => (i / (values.length - 1)) * w;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const color = up ? "var(--c-up)" : "var(--c-down)";
  return (
    <svg className="ins-mk-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={color} opacity={0.12} />
      <line x1={0} x2={w} y1={y(base)} y2={y(base)} stroke="var(--c-faint)" strokeDasharray="2 3" strokeWidth={1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

function Strip({ cards, sel, onSel }: { cards: IndexCard[]; sel: IndexKey; onSel: (k: IndexKey) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [cards.length]);
  const move = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="ins-mk-stripwrap">
      {edge.l && (
        <button type="button" className="ins-mk-arrow l" aria-label="앞 카드" onClick={() => move(-1)}>
          <ChevronLeft size={18} />
        </button>
      )}
      <div className="ins-mk-strip" ref={ref} role="tablist" aria-label="지수">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={sel === c.key}
            className="ins-mk-card"
            onClick={() => onSel(c.key)}
            {...memoAttr({ kind: "topic", topic: "시장 흐름", label: `${c.label} ${fmt(c.value, c.unit)} (${c.unit === "%" ? signed(c.change, c.unit) : pct(c.changeRate)})` })}
          >
            <span className="ins-mk-name">
              <i className={`flag ${c.country}`} aria-hidden>
                {c.country === "GL" ? "₿" : c.country}
              </i>
              {c.label}
              <small className={c.status === "open" || c.status === "live" ? "live" : ""}>{statusText(c)}</small>
            </span>
            <span className="ins-mk-row">
              <span>
                {/* key 가 바뀌면 다시 그려져 반짝임 (값이 바뀐 걸 눈으로) */}
                <strong key={c.value} className="ins-mk-val">
                  {fmt(c.value, c.unit)}
                </strong>
                <em className={tone(c.change)}>
                  {c.unit === "%" ? signed(c.change, c.unit) : `${signed(c.change, c.unit)}(${pct(c.changeRate)})`}
                </em>
              </span>
              <Spark values={c.spark} base={c.prevClose} up={c.change >= 0} />
            </span>
          </button>
        ))}
      </div>
      {edge.r && (
        <button type="button" className="ins-mk-arrow r" aria-label="다음 카드" onClick={() => move(1)}>
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function alpha(color: string, a: number) {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

type Kind = "line" | "candle";

function IndexChart({ d, kind }: { d: IndexDetail; kind: Kind }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<{ prev?: ISeriesApi<SeriesType>; main?: ISeriesApi<SeriesType>; markers?: ISeriesMarkersPluginApi<Time> }>({});
  const fitted = useRef("");
  const dark = useDark();

  // 차트 만들기 (지수 · 그리는 방식 · 테마가 바뀌면 새로)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const intraday = d.mode === "intraday";
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar("--c-surface", "#fff") }, textColor: cssVar("--c-sub", "#555"), fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: cssVar("--c-line", "#eee") }, horzLines: { color: cssVar("--c-line", "#eee") } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.1 } },
      timeScale: {
        borderVisible: false,
        rightOffset: 8,
        fixLeftEdge: true,
        tickMarkFormatter: (t: Time) => {
          const s = new Date((t as number) * 1000).toISOString();
          if (!intraday) return `${+s.slice(5, 7)}.${+s.slice(8, 10)}`;
          return s.slice(11, 16) === "09:00" ? `${s.slice(5, 7)}.${s.slice(8, 10)}.` : s.slice(11, 16);
        },
      },
      localization: {
        locale: "ko-KR",
        timeFormatter: (t: Time) => {
          const s = new Date((t as number) * 1000).toISOString();
          return intraday ? `${s.slice(5, 10).replace("-", ".")} ${s.slice(11, 16)}` : s.slice(0, 10).replace(/-/g, ".");
        },
        priceFormatter: (p: number) => p.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      },
      crosshair: { horzLine: { labelBackgroundColor: cssVar("--c-ink", "#333") }, vertLine: { labelBackgroundColor: cssVar("--c-ink", "#333") } },
      handleScroll: false,
      handleScale: false,
    });
    chart.current = c;
    fitted.current = "";
    const up = cssVar("--c-up", "#1f9d55");
    const down = cssVar("--c-down", "#e03131");
    const faint = cssVar("--c-faint", "#9aa3af");
    const s: typeof series.current = {};
    if (intraday) s.prev = c.addSeries(LineSeries, { color: faint, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    if (kind === "candle" && intraday) {
      s.main = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false });
    } else {
      s.main = c.addSeries(BaselineSeries, {
        // 국내 5분봉은 전일 종가 기준, 3개월 일별은 첫날 기준으로 위(초록) · 아래(빨강)
        baseValue: { type: "price", price: intraday ? d.prevClose : (d.bars[0]?.c ?? d.prevClose) },
        topLineColor: up,
        topFillColor1: alpha(up, 0.22),
        topFillColor2: alpha(up, 0.02),
        bottomLineColor: down,
        bottomFillColor1: alpha(down, 0.02),
        bottomFillColor2: alpha(down, 0.22),
        lineWidth: 2,
        priceLineVisible: false,
      });
    }
    // 전일 종가 점선
    s.main.createPriceLine({ price: d.prevClose, color: faint, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "전일" });
    s.markers = createSeriesMarkers(s.main, []);
    series.current = s;
    return () => {
      c.remove();
      chart.current = null;
      series.current = {};
    };
    // 데이터는 아래 effect 가 넣음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.key, d.mode, kind, dark]);

  // 값 넣기 (새로 받을 때마다, 보던 범위는 처음 한 번만 맞춤)
  useEffect(() => {
    const c = chart.current;
    const { prev, main, markers } = series.current;
    if (!c || !main) return;
    const shift = d.mode === "intraday" ? KST : 0;
    const T = (t: number) => (t + shift) as UTCTimestamp;
    const from = d.todayFrom ?? 0;
    const before = d.mode === "intraday" ? d.bars.filter((b) => b.t < from) : [];
    const today = d.mode === "intraday" ? d.bars.filter((b) => b.t >= from) : d.bars;
    // 전일 마지막 점과 오늘 첫 점을 이어 끊기지 않게
    prev?.setData([...before.map((b) => ({ time: T(b.t), value: b.c })), ...(today[0] && before.length ? [{ time: T(today[0].t), value: today[0].o }] : [])]);
    if (kind === "candle" && d.mode === "intraday") main.setData(today.map((b) => ({ time: T(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    else main.setData(today.map((b) => ({ time: T(b.t), value: b.c })));
    const ms = [];
    if (d.high) ms.push({ time: T(d.high.t), position: "aboveBar" as const, color: cssVar("--c-ink", "#222"), shape: "circle" as const, size: 0.4, text: `최고 ${d.high.v.toLocaleString("ko-KR", { minimumFractionDigits: 2 })}` });
    if (d.low) ms.push({ time: T(d.low.t), position: "belowBar" as const, color: cssVar("--c-ink", "#222"), shape: "circle" as const, size: 0.4, text: `최저 ${d.low.v.toLocaleString("ko-KR", { minimumFractionDigits: 2 })}` });
    markers?.setMarkers(ms.sort((a, b) => (a.time as number) - (b.time as number)));
    const sig = `${d.key}:${d.mode}:${kind}:${dark}`;
    if (fitted.current !== sig) {
      c.timeScale().fitContent();
      fitted.current = sig;
    }
  }, [d, kind, dark]);

  return <div ref={box} className="ins-mk-chart" />;
}

function won(n: number) {
  return n.toLocaleString("ko-KR");
}
/** 원 → "14조 1,959억" */
function bigWon(n: number) {
  const eok = Math.round(n / 1e8);
  const jo = Math.floor(eok / 10_000);
  const rest = eok % 10_000;
  return `${jo ? `${won(jo)}조 ` : ""}${rest ? `${won(rest)}억` : ""}`.trim() || "0억";
}
const eokText = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${won(Math.abs(n))}억`;

function Stats({ d }: { d: IndexDetail }) {
  const s = d.stats;
  const w52 = s && s.w52High > s.w52Low ? Math.min(100, Math.max(0, ((d.value - s.w52Low) / (s.w52High - s.w52Low)) * 100)) : null;
  return (
    <aside className="ins-mk-stats" aria-label="시장 현황">
      <h3>시장 현황</h3>
      {s?.rising !== undefined && (
        <dl className="ins-mk-grid">
          <div>
            <dt>상승</dt>
            <dd className="up">
              {won(s.rising)}
              {s.upper ? <small>({s.upper})</small> : null}
            </dd>
          </div>
          <div>
            <dt>보합</dt>
            <dd>{won(s.flat ?? 0)}</dd>
          </div>
          <div>
            <dt>하락</dt>
            <dd className="down">
              {won(s.falling ?? 0)}
              {s.lower ? <small>({s.lower})</small> : null}
            </dd>
          </div>
        </dl>
      )}
      {d.investors && (
        <dl className="ins-mk-grid">
          {(
            [
              ["외국인", d.investors.foreign],
              ["기관", d.investors.institution],
              ["개인", d.investors.individual],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className={tone(v)}>{eokText(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {s?.volume !== undefined && (
        <dl className="ins-mk-grid two sep">
          <div>
            <dt>거래량</dt>
            <dd>{won(s.volume)}</dd>
          </div>
          <div>
            <dt>거래대금</dt>
            <dd>{bigWon(s.amount ?? 0)}</dd>
          </div>
        </dl>
      )}
      {d.mode === "daily" && (
        <dl className="ins-mk-grid two sep">
          <div>
            <dt>전일 종가</dt>
            <dd>{fmt(d.prevClose, d.unit)}</dd>
          </div>
          <div>
            <dt>기준일</dt>
            <dd>{d.asOf.replace(/-/g, ".")}</dd>
          </div>
        </dl>
      )}
      {s && w52 !== null && (
        <div className="ins-mk-w52">
          <span>52주 최저 · 최고</span>
          <div className="bar">
            <i style={{ left: `${w52}%` }} />
          </div>
          <div className="ends">
            <b>{fmt(s.w52Low, d.unit)}</b>
            <b>{fmt(s.w52High, d.unit)}</b>
          </div>
        </div>
      )}
    </aside>
  );
}

export default function Market() {
  const [sel, setSel] = useState<IndexKey>("kospi");
  const [kind, setKind] = useState<Kind>("line");
  const cards = useLoad("index-cards", getIndexCards, (d) => (d?.live ? 10_000 : 120_000));
  const detail = useLoad(`index-${sel}`, () => getIndexDetail(sel), (d) => (d?.status === "open" ? 15_000 : d?.status === "live" ? 30_000 : 300_000));
  const d = detail.data;
  const live = cards.data?.live;

  return (
    <section className="ins-card ins-mk">
      {cards.error && !cards.data ? (
        <Failed message={cards.error} onRetry={cards.reload} height={110} />
      ) : !cards.data ? (
        <Loading height={110} />
      ) : (
        <Strip cards={cards.data.items} sel={sel} onSel={setSel} />
      )}

      <div className="ins-mk-body">
        <div className="ins-mk-main">
          <div className="ins-mk-head">
            <h2>{d?.label ?? cards.data?.items.find((c) => c.key === sel)?.label ?? ""}</h2>
            {d?.headline && (
              <p className="ins-mk-headline">
                <b>요약</b>
                {d.headline}
              </p>
            )}
            {d?.mode === "intraday" && (
              <div className="ins-seg ins-mk-kind" role="radiogroup" aria-label="차트 모양">
                <button type="button" role="radio" aria-checked={kind === "line"} onClick={() => setKind("line")}>
                  선
                </button>
                <button type="button" role="radio" aria-checked={kind === "candle"} onClick={() => setKind("candle")}>
                  봉
                </button>
              </div>
            )}
          </div>
          {detail.error && !d ? (
            <Failed message={detail.error} onRetry={detail.reload} height={330} />
          ) : !d || d.key !== sel ? (
            <Loading height={330} />
          ) : (
            <IndexChart d={d} kind={kind} />
          )}
          <p className="ins-meta ins-mk-meta">
            {d?.mode === "intraday" ? "5분 간격 · 점선은 전일 종가 · 회색은 전일" : d ? "최근 3개월 일별 · 첫날보다 위는 초록, 아래는 빨강 · 점선은 전일 종가" : ""}
            {cards.updatedAt && ` · ${hhmmss(cards.updatedAt)} 기준, ${live ? "장중 10초마다 새로" : "장 마감 · 2분마다 확인"}`}
          </p>
        </div>
        {d && d.key === sel ? <Stats d={d} /> : <aside className="ins-mk-stats" />}
      </div>
      {cards.data && cards.data.failed.length > 0 && <p className="ins-missing">못 받아 온 곳: {cards.data.failed.join(", ")} (잠시 뒤 다시 시도해요)</p>}
      {cards.data && <MissingKeys keys={cards.data.missing} />}
    </section>
  );
}
