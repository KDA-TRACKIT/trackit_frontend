"use client";
// 상승 · 하락 · 거래대금 상위 (섹터맵과 같은 데이터에서 계산 → 키움 추가 호출 없음) + 외국인·기관 순매수/순매도 상위
import Link from "next/link";
import { useMemo, useState } from "react";
import { getFlows, type FlowRow, type SectorMap, type SectorMarket } from "../../lib/api/insights";
import { CardHead, Failed, Loading, eok, pct, tone } from "./parts";
import { useLoad } from "./useLoad";

const href = (code: string, name: string, market: SectorMarket) => `/workshop?symbol=${code}&name=${encodeURIComponent(name)}&market=${market === "kospi" ? "KOSPI" : "KOSDAQ"}`;

type Mover = { code: string; name: string; changeRate: number; price: number; amount: number };

export function Rankings({ data }: { data: SectorMap | null }) {
  const lists = useMemo(() => {
    if (!data) return null;
    const all: Mover[] = data.sectors.flatMap((s) => s.stocks.map((t) => ({ code: t.code, name: t.name, changeRate: t.changeRate, price: t.price, amount: t.price * t.volume })));
    const top = (f: (a: Mover, b: Mover) => number) => [...all].sort(f).slice(0, 10);
    return [
      { key: "up", title: "상승률", rows: top((a, b) => b.changeRate - a.changeRate), show: (m: Mover) => pct(m.changeRate) },
      { key: "down", title: "하락률", rows: top((a, b) => a.changeRate - b.changeRate), show: (m: Mover) => pct(m.changeRate) },
      { key: "amount", title: "거래대금", rows: top((a, b) => b.amount - a.amount), show: (m: Mover) => `${Math.round(m.amount / 1e8).toLocaleString("ko-KR")}억` },
    ];
  }, [data]);
  return (
    <section className="ins-card">
      <CardHead title="오늘의 종목" meta={data ? `${data.market === "kospi" ? "코스피" : "코스닥"} · 섹터맵에서 고른 시장` : undefined} />
      {!lists || !data ? (
        <Loading height={300} />
      ) : (
        <div className="ins-cols">
          {lists.map((l) => (
            <div key={l.key}>
              <h3>{l.title} 상위</h3>
              <ol className="ins-rank">
                {l.rows.map((m) => (
                  <li key={m.code}>
                    <Link href={href(m.code, m.name, data.market)}>
                      <span>{m.name}</span>
                      <em className={tone(m.changeRate)}>{l.show(m)}</em>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FlowList({ title, rows, market }: { title: string; rows: FlowRow[]; market: SectorMarket }) {
  return (
    <div>
      <h3>{title}</h3>
      <ol className="ins-rank">
        {rows.map((r) => (
          <li key={r.code}>
            <Link href={href(r.code, r.name, market)}>
              <span>{r.name}</span>
              <em className={tone(r.amount)}>{eok(r.amount)}</em>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Flows() {
  const [market, setMarket] = useState<SectorMarket>("kospi");
  const { data, error, loading, reload } = useLoad(`flows-${market}`, () => getFlows(market), 60_000);
  return (
    <section className="ins-card">
      <CardHead title="외국인 · 기관" meta="오늘 순매수·순매도 금액 상위">
        <div className="ins-seg" role="radiogroup" aria-label="시장">
          {(["kospi", "kosdaq"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={market === m} onClick={() => setMarket(m)}>
              {m === "kospi" ? "코스피" : "코스닥"}
            </button>
          ))}
        </div>
      </CardHead>
      {error && !data ? (
        <Failed message={error} onRetry={reload} height={300} />
      ) : !data ? (
        <Loading height={300} />
      ) : (
        <div className={`ins-cols four${loading ? " stale" : ""}`}>
          <FlowList title="외국인 순매수" rows={data.foreignBuy} market={market} />
          <FlowList title="외국인 순매도" rows={data.foreignSell} market={market} />
          <FlowList title="기관 순매수" rows={data.institutionBuy} market={market} />
          <FlowList title="기관 순매도" rows={data.institutionSell} market={market} />
        </div>
      )}
    </section>
  );
}
