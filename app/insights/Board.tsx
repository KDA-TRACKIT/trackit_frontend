"use client";
// 시장 전광판: 지수 · 환율 · 금리 · 유가 · 코인 (장중엔 30초마다)
import { getBoard, type BoardItem } from "../../lib/api/insights";
import { CardHead, Failed, Loading, MissingKeys, pct, tone } from "./parts";
import { useLoad } from "./useLoad";

function value(i: BoardItem) {
  if (i.unit === "%") return `${i.value.toFixed(2)}%`;
  if (i.unit === "$") return `$${i.value.toFixed(2)}`;
  if (i.unit === "원") return i.value >= 100_000 ? Math.round(i.value).toLocaleString("ko-KR") : i.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  return i.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}
/** 금리는 %p, 나머지는 % 등락 */
function change(i: BoardItem) {
  if (i.unit === "%") return i.change === null ? "—" : `${i.change > 0 ? "+" : i.change < 0 ? "−" : ""}${Math.abs(i.change).toFixed(2)}%p`;
  return pct(i.changeRate);
}
/** 실시간이면 시각, 하루 단위면 날짜 */
function when(i: BoardItem) {
  if (i.asOf.length > 10) {
    const d = new Date(new Date(i.asOf).getTime() + 9 * 3_600_000).toISOString();
    return `${d.slice(11, 16)}`;
  }
  return `${i.asOf.slice(5).replace("-", ".")} 종가`;
}

export default function Board() {
  const { data, error, reload } = useLoad("board", getBoard, 30_000);
  return (
    <section className="ins-card">
      <CardHead title="시장" meta={data ? "지수·환율 30초마다, 미국 지표는 하루 늦게 들어와요" : undefined} />
      {error && !data ? (
        <Failed message={error} onRetry={reload} height={110} />
      ) : !data ? (
        <Loading height={110} />
      ) : (
        <>
          <div className="ins-board">
            {data.items.map((i) => (
              <div key={i.key} className="ins-tile" title={`${i.source} · ${i.asOf}`}>
                <span>{i.label}</span>
                <strong>{value(i)}</strong>
                <em className={tone(i.unit === "%" ? i.change : i.changeRate)}>{change(i)}</em>
                <small>
                  {when(i)} · {i.source}
                </small>
              </div>
            ))}
          </div>
          {data.failed.length > 0 && <p className="ins-missing">못 받아 온 곳: {data.failed.join(", ")} (잠시 뒤 다시 시도해요)</p>}
          <MissingKeys keys={data.missing} />
        </>
      )}
    </section>
  );
}
