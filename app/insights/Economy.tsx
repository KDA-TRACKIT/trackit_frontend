"use client";
// 기준금리 주요 4개국 (경제 탭) · 물가 (전년 대비 %, 지금은 화면에 안 씀). 경제 캘린더는 Calendar.tsx
import { getInflation, getPolicyRates, type InflationSeries, type PolicyRate } from "../../lib/api/insights";
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
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`${s.label} 전년 대비 상승률 추이`}>
        <line x1="0" x2={W} y1={y(2)} y2={y(2)} className="target" />
        <polyline points={vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" vectorEffect="non-scaling-stroke" />
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
          {data.failed.length > 0 && <p className="ins-missing">못 받아 온 곳: {data.failed.join(", ")}</p>}
          <MissingKeys keys={data.missing} />
        </>
      )}
    </section>
  );
}

const pctx = (v: number) => `${Number.isInteger(v * 100) ? v.toFixed(2) : v.toFixed(3)}%`;

/** 기준금리 칸: 지금 값 · 마지막 변경 · 36개월 계단 그래프 */
function RateTile({ r }: { r: PolicyRate }) {
  const vals = r.points.map((p) => p.value);
  const lo = Math.min(...vals) - 0.25;
  const hi = Math.max(...vals) + 0.25;
  const x = (i: number) => (i / Math.max(vals.length - 1, 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  // 금리는 계단처럼 (다음 달까지 그대로였다가 바뀜)
  const steps = vals.flatMap((v, i) => (i === 0 ? [`0,${y(v).toFixed(1)}`] : [`${x(i).toFixed(1)},${y(vals[i - 1]).toFixed(1)}`, `${x(i).toFixed(1)},${y(v).toFixed(1)}`]));
  const ch = r.lastChange;
  return (
    <div className="ins-infl ins-rate">
      <div className="ins-infl-head">
        <span>
          {r.label} <b>{r.bank}</b>
        </span>
        <small>{r.asOf.replace(/-/g, ".").slice(2)} 기준</small>
      </div>
      <strong>
        {r.low !== undefined ? `${r.low.toFixed(2)}–${pctx(r.value)}` : pctx(r.value)}
        {ch && (
          <em className={ch.diff > 0 ? "up" : ch.diff < 0 ? "down" : ""}>
            {ch.diff > 0 ? "▲" : "▼"} {Math.abs(ch.diff).toFixed(2)}%p · {ch.month.replace("-", ".")} {ch.diff > 0 ? "인상" : "인하"}
          </em>
        )}
      </strong>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`${r.label} 기준금리 추이`}>
        <polyline points={steps.join(" ")} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="ins-infl-axis">
        <span>{r.points[0].month.replace("-", ".")}</span>
        <span>{r.source}</span>
        <span>{r.points[r.points.length - 1].month.replace("-", ".")}</span>
      </div>
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
