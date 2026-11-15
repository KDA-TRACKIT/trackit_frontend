"use client";
// 물가 (전년 대비 %, 최근 24개월). 경제 캘린더는 Calendar.tsx
import { getInflation, type InflationSeries } from "../../lib/api/insights";
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
