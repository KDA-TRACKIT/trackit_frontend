"use client";
// 아카이브 · 전략 분석: 열람권으로 연 전략의 트레이더를 나란히 비교
//   트레이더마다 평균 월 수익률 · 수익 난 달 비율 · 가장 좋았던/나빴던 달 · 최대 낙폭 · 이행률, 연 달의 수익률은 평균과 비교
//   월별 수익률은 전략 쇼핑 데이터(예시) 기준
import Link from "next/link";
import { useMemo, useState } from "react";
import SiteHeader from "../../SiteHeader";
import { usePasses } from "../../../lib/purchases";
import { useFreeViews } from "../../../lib/free-views";
import { monthLabel, pct, tone, traderById, type Trader } from "../../marketplace/data";
import { GradeBadge } from "../../marketplace/GradeParts";
import "../../marketplace/marketplace.css";
import "../archive.css";

type Row = {
  t: Trader;
  opened: { month: string; title: string; ret: number | null }[];
  avg: number;
  winRate: number;
  best: { month: string; ret: number };
  worst: { month: string; ret: number };
  recent: { month: string; ret: number }[];
};

const WINDOWS = [
  { key: 6, label: "최근 6개월" },
  { key: 12, label: "최근 1년" },
  { key: 24, label: "2년" },
];

export default function AnalysisPage() {
  const passes = usePasses();
  const freeViews = useFreeViews();
  const [months, setMonths] = useState(12);

  const rows: Row[] = useMemo(() => {
    const byTrader = new Map<string, { month: string; title: string }[]>();
    for (const p of passes) if (p.used) byTrader.set(p.traderId, [...(byTrader.get(p.traderId) ?? []), { month: p.used.month, title: p.used.title }]);
    // 무료로 본 전략도 (같은 달이면 하나만)
    for (const v of freeViews) if (!(byTrader.get(v.traderId) ?? []).some((o) => o.month === v.month)) byTrader.set(v.traderId, [...(byTrader.get(v.traderId) ?? []), { month: v.month, title: v.title }]);
    return [...byTrader.entries()].flatMap(([id, opened]) => {
      const t = traderById(id);
      if (!t) return [];
      const recent = t.monthly.slice(-months);
      const rets = recent.map((m) => m.ret);
      const sorted = [...recent].sort((a, b) => b.ret - a.ret);
      return [
        {
          t,
          opened: opened.map((o) => ({ ...o, ret: t.monthly.find((m) => m.month === o.month)?.ret ?? null })),
          avg: rets.reduce((a, v) => a + v, 0) / rets.length,
          winRate: (rets.filter((v) => v > 0).length / rets.length) * 100,
          best: sorted[0],
          worst: sorted[sorted.length - 1],
          recent,
        },
      ];
    });
  }, [passes, freeViews, months]);

  const maxAbs = Math.max(4, ...rows.flatMap((r) => r.recent.map((m) => Math.abs(m.ret))));

  return (
    <main className="mk-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <div className="ar-head">
          <h1 className="mk-title">전략 분석</h1>
          <div className="mk-periods" role="radiogroup" aria-label="기간">
            {WINDOWS.map((w) => (
              <button key={w.key} type="button" role="radio" aria-checked={months === w.key} className={months === w.key ? "on" : ""} onClick={() => setMonths(w.key)}>
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <p className="ar-summary">열람권으로 연 전략의 트레이더를 나란히 비교해요.</p>

        {!rows.length ? (
          <div className="mk-card mk-empty">
            아직 연 전략이 없어요. 열람권으로 전략을 열면 여기서 트레이더끼리 비교할 수 있어요.
            <br />
            <Link href="/marketplace" className="ar-link">
              전략 쇼핑 둘러보기 ›
            </Link>
          </div>
        ) : (
          <>
            <div className="mk-card an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>트레이더</th>
                    <th>평균 월 수익률</th>
                    <th>수익 난 달</th>
                    <th>가장 좋았던 달</th>
                    <th>가장 나빴던 달</th>
                    <th>최대 낙폭</th>
                    <th>이행률</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.t.id}>
                      <td>
                        <GradeBadge grade={r.t.grade?.grade} unrated={r.t.grade?.unrated} small /> <Link href={`/marketplace/${r.t.id}`}>{r.t.name}</Link>
                        <small>{r.t.type}</small>
                      </td>
                      <td className={tone(r.avg)}>{pct(Math.round(r.avg * 100) / 100)}</td>
                      <td>{Math.round(r.winRate)}%</td>
                      <td>
                        <span className={tone(r.best.ret)}>{pct(r.best.ret)}</span>
                        <small>{monthLabel(r.best.month)}</small>
                      </td>
                      <td>
                        <span className={tone(r.worst.ret)}>{pct(r.worst.ret)}</span>
                        <small>{monthLabel(r.worst.month)}</small>
                      </td>
                      <td className="loss">{pct(r.t.mdd)}</td>
                      <td>{r.t.follow}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.map((r) => (
              <section key={r.t.id} className="mk-card an-card">
                <div className="an-card-head">
                  <strong><GradeBadge grade={r.t.grade?.grade} unrated={r.t.grade?.unrated} small /> {r.t.name}</strong>
                  <small>월별 수익률 · {WINDOWS.find((w) => w.key === months)?.label}</small>
                </div>
                <div className="an-bars" role="img" aria-label={`${r.t.name} 월별 수익률`}>
                  {r.recent.map((m) => {
                    const opened = r.opened.some((o) => o.month === m.month);
                    return (
                      <div key={m.month} className={`an-bar${opened ? " opened" : ""}`} title={`${monthLabel(m.month)} ${pct(m.ret)}${opened ? " · 연 전략" : ""}`}>
                        <span className={tone(m.ret)} style={{ height: `${(Math.abs(m.ret) / maxAbs) * 50}%`, ...(m.ret >= 0 ? { bottom: "50%" } : { top: "50%" }) }} />
                        <small>{Number(m.month.slice(5))}</small>
                      </div>
                    );
                  })}
                </div>
                <ul className="an-opened">
                  {r.opened.map((o) => (
                    <li key={o.month}>
                      <span className="ar-badge post">연 전략</span>
                      <b>{monthLabel(o.month)}</b> {o.title}
                      {o.ret !== null && (
                        <>
                          {" "}
                          · <span className={tone(o.ret)}>{pct(o.ret)}</span>
                          <small> (평균보다 {pct(Math.round((o.ret - r.avg) * 100) / 100)})</small>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
