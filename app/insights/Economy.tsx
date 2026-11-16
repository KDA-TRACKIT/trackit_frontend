"use client";
// 기준금리 주요 4개국 (경제 탭) · 물가 (전년 대비 %, 지금은 화면에 안 씀). 경제 캘린더는 Calendar.tsx
import { memoAttr } from "../../lib/memo-target";
import { useEffect, useRef, useState } from "react";
import {
  getInflation,
  getPolicyRates,
  type InflationSeries,
  type PolicyRate,
} from "../../lib/api/insights";
import { CardHead, Failed, Loading, MissingKeys } from "./parts";
import { useLoad } from "./useLoad";

const W = 260;
const H = 70;

function Spark({ s }: { s: InflationSeries }) {
  const vals = s.points.map((p) => p.yoy);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(...vals, lo + 0.5);
  const x = (i: number) => (i / Math.max(vals.length - 1, 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const last = s.points[s.points.length - 1];
  const prev = s.points[s.points.length - 2];
  const diff = prev ? last.yoy - prev.yoy : null;
  return (
    <div className="ins-infl">
      <div className="ins-infl-head">
        <span>{s.label}</span>
        <small>{s.source}</small>
      </div>
      <strong>
        {last.yoy.toFixed(1)}%
        {diff !== null && (
          <em className={diff > 0 ? "up" : diff < 0 ? "down" : ""}>
            {diff > 0 ? "▲" : diff < 0 ? "▼" : ""} {Math.abs(diff).toFixed(1)}%p
          </em>
        )}
      </strong>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-label={`${s.label} 전년 대비 상승률 추이`}
      >
        <line x1="0" x2={W} y1={y(2)} y2={y(2)} className="target" />
        <polyline
          points={vals
            .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
            .join(" ")}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="ins-infl-axis">
        <span>{s.points[0].month.replace("-", ".")}</span>
        <span>점선 2%</span>
        <span>{last.month.replace("-", ".")}</span>
      </div>
    </div>
  );
}

export function Inflation() {
  const { data, error, reload } = useLoad("inflation", getInflation);
  return (
    <section className="ins-card">
      <CardHead title="물가" meta="전년 같은 달 대비 상승률" />
      {error && !data ? (
        <Failed message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="ins-infl-grid">
            {data.series.map((s) => (
              <Spark key={s.key} s={s} />
            ))}
          </div>
          {data.failed.length > 0 && (
            <p className="ins-missing">
              못 받아 온 곳: {data.failed.join(", ")}
            </p>
          )}
          <MissingKeys keys={data.missing} />
        </>
      )}
    </section>
  );
}

const pctx = (v: number) =>
  `${Number.isInteger(v * 100) ? v.toFixed(2) : v.toFixed(3)}%`;

/** 눈금 간격: 범위에 맞춰 0.25 · 0.5 · 1 · 2 %p */
function ticksFor(min: number, max: number) {
  const span = Math.max(max - min, 0.25);
  const step = span <= 1 ? 0.25 : span <= 2.5 ? 0.5 : span <= 6 ? 1 : 2;
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi - lo < step * 2) {
    lo -= step;
    hi += step;
  }
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step)
    ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, step, ticks };
}
const tickText = (v: number, step: number) =>
  `${step < 0.5 ? v.toFixed(2) : step < 1 ? v.toFixed(1) : v.toFixed(0)}%`;
const monthText = (m: string) => m.replace("-", ".");

const CH = { h: 132, l: 6, r: 44, t: 16, b: 20 };

/**
 * 기준금리 계단 그래프: 실제 픽셀 크기로 그림(글자·점이 늘어나지 않게)
 *   오른쪽 금리 눈금 · 옅은 가로선 · 해마다 아래 연도 · 바뀐 달에 점과 폭(+0.25) · 마지막 값 점
 *   마우스를 올리면 세로선과 그 달 값
 */
function RateChart({ r }: { r: PolicyRate }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pts = r.points;
  const vals = pts.map((p) => p.value);
  const { lo, hi, step, ticks } = ticksFor(
    Math.min(...vals),
    Math.max(...vals),
  );
  const plotW = Math.max(w - CH.l - CH.r, 1);
  const plotH = CH.h - CH.t - CH.b;
  const x = (i: number) => CH.l + (i / Math.max(pts.length - 1, 1)) * plotW;
  const y = (v: number) => CH.t + ((hi - v) / (hi - lo)) * plotH;
  // 계단: 다음 달까지 그대로였다가 바뀜
  const line = vals
    .map((v, i) =>
      i === 0
        ? `M${x(0).toFixed(1)},${y(v).toFixed(1)}`
        : `H${x(i).toFixed(1)}V${y(v).toFixed(1)}`,
    )
    .join("");
  const area = `${line}V${(CH.t + plotH).toFixed(1)}H${x(0).toFixed(1)}Z`;
  const changes = vals
    .map((v, i) =>
      i > 0 && v !== vals[i - 1]
        ? { i, v, diff: Math.round((v - vals[i - 1]) * 1000) / 1000 }
        : null,
    )
    .filter((c): c is { i: number; v: number; diff: number } => !!c);
  // 폭 글자는 서로 34px 넘게 떨어질 때만 (겹치지 않게, 최근 것 우선)
  const labeled = new Set<number>();
  let lastX = Infinity;
  for (const c of [...changes].reverse()) {
    if (lastX - x(c.i) > 34) {
      labeled.add(c.i);
      lastX = x(c.i);
    }
  }
  const years = pts
    .map((p, i) =>
      p.month.endsWith("-01") ? { i, y: p.month.slice(0, 4) } : null,
    )
    .filter((v): v is { i: number; y: string } => !!v);
  const valueText = (v: number) =>
    r.key === "US"
      ? `${(v - 0.125).toFixed(2)}–${(v + 0.125).toFixed(2)}%`
      : `${v.toFixed(2)}%`;
  const gid = `rate-fill-${r.key}`;
  const last = pts.length - 1;

  const onMove = (e: React.MouseEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.round(
      ((e.clientX - rect.left - CH.l) / plotW) * (pts.length - 1),
    );
    setHover(Math.max(0, Math.min(last, i)));
  };
  const hv =
    hover === null
      ? null
      : { i: hover, p: pts[hover], prev: hover > 0 ? vals[hover - 1] : null };

  return (
    <div
      ref={boxRef}
      className="ins-rchart"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {w > 0 && (
        <svg
          width={w}
          height={CH.h}
          role="img"
          aria-label={`${r.label} 기준금리 최근 3년`}
        >
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="fill-top" />
              <stop offset="100%" className="fill-bottom" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="grid"
                x1={CH.l}
                x2={CH.l + plotW}
                y1={y(t)}
                y2={y(t)}
              />
              <text className="ytick" x={CH.l + plotW + 8} y={y(t)} dy="0.35em">
                {tickText(t, step)}
              </text>
            </g>
          ))}
          {years.map(({ i, y: yr }) => (
            <g key={yr}>
              <line
                className="year"
                x1={x(i)}
                x2={x(i)}
                y1={CH.t}
                y2={CH.t + plotH}
              />
              <text className="xtick" x={x(i)} y={CH.h - 4} textAnchor="middle">
                {yr}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} className="line" />
          {changes.map((c) => (
            <g key={c.i} className={c.diff > 0 ? "hike" : "cut"}>
              <circle cx={x(c.i)} cy={y(c.v)} r={3} />
              {labeled.has(c.i) && (
                <text
                  x={x(c.i)}
                  y={c.diff > 0 ? y(c.v) - 7 : y(c.v) + 13}
                  textAnchor="middle"
                >
                  {c.diff > 0 ? "+" : "−"}
                  {Math.abs(c.diff).toFixed(2).replace(/0$/, "")}
                </text>
              )}
            </g>
          ))}
          <circle className="end-ring" cx={x(last)} cy={y(vals[last])} r={6} />
          <circle className="end" cx={x(last)} cy={y(vals[last])} r={3.5} />
          {hv && (
            <g className="hover">
              <line x1={x(hv.i)} x2={x(hv.i)} y1={CH.t} y2={CH.t + plotH} />
              <circle cx={x(hv.i)} cy={y(hv.p.value)} r={4} />
            </g>
          )}
        </svg>
      )}
      {hv && (
        <div
          className="ins-rchart-tip"
          style={{
            left: Math.min(Math.max(x(hv.i), 60), w - 60),
            top: Math.max(y(hv.p.value) - 46, 0),
          }}
        >
          <span>{monthText(hv.p.month)}</span>
          <b>{valueText(hv.p.value)}</b>
          {hv.prev !== null && hv.prev !== hv.p.value && (
            <em className={hv.p.value > hv.prev ? "up" : "down"}>
              {hv.p.value > hv.prev ? "인상" : "인하"}{" "}
              {Math.abs(hv.p.value - hv.prev).toFixed(2)}%p
            </em>
          )}
        </div>
      )}
    </div>
  );
}

/** 기준금리 칸: 지금 값 · 마지막 변경 · 36개월 계단 그래프 */
function RateTile({ r }: { r: PolicyRate }) {
  const ch = r.lastChange;
  return (
    <div className="ins-infl ins-rate" {...memoAttr({ kind: "topic", topic: "거시경제", label: `${r.label} 기준금리 ${r.low !== undefined ? `${r.low.toFixed(2)}–` : ""}${r.value.toFixed(2)}%` })}>
      <div className="ins-infl-head">
        <span>
          {r.label} <b>{r.bank}</b>
        </span>
        <small>{r.asOf.replace(/-/g, ".").slice(2)} 기준</small>
      </div>
      <strong>
        {r.low !== undefined
          ? `${r.low.toFixed(2)}–${pctx(r.value)}`
          : pctx(r.value)}
        {ch && (
          <em className={ch.diff > 0 ? "up" : ch.diff < 0 ? "down" : ""}>
            {ch.diff > 0 ? "▲" : "▼"} {Math.abs(ch.diff).toFixed(2)}%p ·{" "}
            {monthText(ch.month)} {ch.diff > 0 ? "인상" : "인하"}
          </em>
        )}
      </strong>
      <RateChart r={r} />
      <p className="ins-rate-src">{r.source}</p>
    </div>
  );
}

export function PolicyRates() {
  const { data, error, reload } = useLoad("rates", getPolicyRates);
  return (
    <section className="ins-card">
      <CardHead title="기준금리" meta="주요 4개국 중앙은행 · 최근 3년" />
      {error && !data ? (
        <Failed message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className="ins-infl-grid">
          {data.rates.map((r) => (
            <RateTile key={r.key} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}
