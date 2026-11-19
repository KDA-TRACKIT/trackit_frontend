"use client";
// 아카이브 · 구매한 전략: 산 열람권과 열람권으로 연 전략 (계정에 저장, lib/purchases → GET /me/passes)
//   무료로 본 전략(트레이더 첫 공개 전략)도 같이 (lib/free-views, 이 브라우저)
//   실제 판매 등록을 산 것 → 서버 GET /market/purchases
import Link from "next/link";
import { useEffect, useState } from "react";
import SiteHeader from "../../SiteHeader";
import { apiRequest } from "../../../lib/api/client";
import { usePasses } from "../../../lib/purchases";
import { useFreeViews } from "../../../lib/free-views";
import { useLikeTotals } from "../../../lib/feedback";
import { monthLabel, pct, strategiesOf, tone, traderById } from "../../marketplace/data";
import { GradeBadge } from "../../marketplace/GradeParts";
import HoneyPot from "../../HoneyPot";
import "../../marketplace/marketplace.css";
import "../archive.css";

type ServerPurchase = {
  id: string;
  kind: "MONTH" | "ALL";
  strategy: { id: string; title: string };
  month: string | null;
  coveredThrough: string | null;
  price: string | number;
  paymentStatus: string;
  purchasedAt: string;
};

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "");
const STATUS: Record<string, string> = { PAID: "결제 완료", PENDING: "결제 대기", REFUNDED: "환불", FAILED: "실패" };

export default function PurchasesPage() {
  const passes = usePasses();
  const freeViews = useFreeViews();
  const likeTotals = useLikeTotals();
  const [server, setServer] = useState<ServerPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<ServerPurchase[]>("/market/purchases")
      .then(setServer)
      .catch(() => {
        setServer([]);
        setError("판매 등록 전략 구매 내역을 불러오지 못했어요.");
      });
  }, []);

  const unused = passes.filter((p) => !p.used);
  const used = passes.filter((p) => p.used).sort((a, b) => (b.used!.at ?? "").localeCompare(a.used!.at ?? ""));
  // 남은 열람권은 트레이더별로 묶어 장수로
  const byTrader = [...new Map(unused.map((p) => [p.traderId, { traderId: p.traderId, name: p.traderName, count: unused.filter((x) => x.traderId === p.traderId).length }])).values()];
  const total = passes.reduce((a, p) => a + p.amount, 0) + (server ?? []).filter((p) => p.paymentStatus === "PAID").reduce((a, p) => a + Number(p.price), 0);
  const nothing = server !== null && !passes.length && !server.length && !freeViews.length;
  // 시안: 열람권을 산 트레이더별 카드 (보유 열람권 · 전략 이행률 · 최근 1개월 수익률 · 보유 전략)
  // 열람권을 산 트레이더 + 무료 전략만 본 트레이더
  const traders = [...new Set([...passes.map((p) => p.traderId), ...freeViews.map((v) => v.traderId)])].map((id) => {
    const mine = passes.filter((p) => p.traderId === id);
    const free = freeViews.filter((v) => v.traderId === id);
    const t = traderById(id);
    const months = [...new Set([...mine.flatMap((p) => (p.used ? [p.used.month] : [])), ...free.map((v) => v.month)])].sort().reverse();
    return { id, t, name: t?.name ?? mine[0]?.traderName ?? free[0].traderName, count: mine.length, months, ret: t?.monthly.at(-1)?.ret ?? null };
  });
  const shortMonth = (m: string) => `${m.slice(2, 4)}년 ${Number(m.slice(5))}월`;

  return (
    <main className="mk-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <h1 className="mk-title">트레이더</h1>
        <p className="ar-summary">
          {server === null ? (
            "불러오는 중…"
          ) : nothing ? null : (
            <>
              열람권 <b>{passes.length}</b>장 (남은 {unused.length}장) · 연 전략 <b>{used.length + (server?.length ?? 0) + freeViews.length}</b>개 · 결제 합계 <b>{won(total)}</b>
            </>
          )}
        </p>
        {error && <p className="ar-note">{error}</p>}

        {nothing ? (
          <div className="mk-card mk-empty">
            아직 산 열람권이 없어요. 트레이더의 열람권을 사면 월별 전략 하나를 골라 열 수 있어요.
            <br />
            <Link href="/marketplace" className="ar-link">
              전략 쇼핑 둘러보기 ›
            </Link>
          </div>
        ) : (
          <>
            {traders.length > 0 && (
              <ul className="ar-traders">
                {traders.map((g) => (
                  <li key={g.id}>
                    <Link href={`/archive/purchases/${g.id}`} className="ar-trader">
                      <div className="ar-trader-who">
                        <small>{g.t?.tagline}</small>
                        <strong>
                          {g.name} {g.t && <span className="ar-heart" title="받은 꿀 합계"><HoneyPot count={likeTotals[g.t.id] ?? 0} /> {likeTotals[g.t.id] ?? 0}</span>}
                        </strong>
                        <p>{g.t?.intro}</p>
                      </div>
                      <div className="ar-trader-stat">
                        <small>보유 열람권</small>
                        <b>{g.count}개</b>
                      </div>
                      <div className="ar-trader-stat">
                        <small>전략 이행률</small>
                        <b>{g.t ? `${g.t.follow}%` : "—"}</b>
                      </div>
                      <div className="ar-trader-stat">
                        <small>최근 1개월 수익률</small>
                        <b className={g.ret === null ? "" : tone(g.ret)}>{g.ret === null ? "—" : pct(g.ret)}</b>
                      </div>
                      <div className="ar-trader-stat">
                        <small>보유 전략</small>
                        <b>{g.months.length ? g.months.slice(0, 2).map(shortMonth).join(" · ") + (g.months.length > 2 ? ` 외 ${g.months.length - 2}` : "") : "아직 안 연 열람권"}</b>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {byTrader.length > 0 && (
              <section className="ar-day">
                <h2>남은 열람권</h2>
                <ul>
                  {byTrader.map((g) => (
                    <li key={g.traderId} className="mk-card ar-row">
                      <div>
                        <small>사용 가능</small>
                        <strong>
                          <GradeBadge grade={traderById(g.traderId)?.grade?.grade} unrated={traderById(g.traderId)?.grade?.unrated} small /> {g.name} 열람권 {g.count}장
                        </strong>
                        <p>월별 전략 중 하나를 골라 열람권으로 바꾸세요.</p>
                      </div>
                      <div className="ar-side">
                        <div className="ar-actions">
                          <Link href={`/marketplace/${g.traderId}/strategies`} className="mk-primary">
                            전략 고르기
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(used.length > 0 || (server?.length ?? 0) > 0 || freeViews.length > 0) && (
              <section className="ar-day">
                <h2>연 전략</h2>
                <ul>
                  {used.map((p) => {
                    const t = traderById(p.traderId);
                    const s = t ? strategiesOf(t).find((x) => x.month === p.used!.month) : undefined;
                    return (
                      <li key={p.id} className="mk-card ar-prow">
                        <div>
                          <strong>
                            <GradeBadge grade={t?.grade?.grade} unrated={t?.grade?.unrated} small /> {p.traderName}의 {monthLabel(p.used!.month)} 전략
                          </strong>
                          <p>{s?.title ?? p.used!.title}{t?.tagline ? ` · ${t.tagline}` : ""}</p>
                          <small>
                            {day(p.used!.at)} 열람권으로 엶 · 결제 {won(p.amount)}
                            {p.receiptUrl && (
                              <>
                                {" · "}
                                <a href={p.receiptUrl} target="_blank" rel="noreferrer">
                                  영수증
                                </a>
                              </>
                            )}
                          </small>
                        </div>
                        <div className="ar-prow-stat">
                          {s && (
                            <>
                              <b className={tone(s.ret)}>수익률 {pct(s.ret)}</b>
                              <span>이행률 {s.follow}%</span>
                            </>
                          )}
                        </div>
                        <div className="ar-prow-acts">
                          <Link href={`/archive/practice/${p.traderId}/${p.used!.month}`} className="ar-prow-btn ghost">
                            연습하기
                          </Link>
                          <Link href={`/marketplace/${p.traderId}/strategies/${p.used!.month}`} className="ar-prow-btn">
                            전략 상세 보기
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                  {freeViews.map((v) => {
                    const t = traderById(v.traderId);
                    const s = t ? strategiesOf(t).find((x) => x.month === v.month) : undefined;
                    return (
                      <li key={`free-${v.traderId}-${v.month}`} className="mk-card ar-prow">
                        <div>
                          <strong>
                            <GradeBadge grade={t?.grade?.grade} unrated={t?.grade?.unrated} small /> {v.traderName}의 {monthLabel(v.month)} 전략
                          </strong>
                          <p>{s?.title ?? v.title}{t?.tagline ? ` · ${t.tagline}` : ""}</p>
                          <small>{day(v.at)} 무료로 봄</small>
                        </div>
                        <div className="ar-prow-stat">
                          {s && (
                            <>
                              <b className={tone(s.ret)}>수익률 {pct(s.ret)}</b>
                              <span>이행률 {s.follow}%</span>
                            </>
                          )}
                        </div>
                        <div className="ar-prow-acts">
                          <Link href={`/archive/practice/${v.traderId}/${v.month}`} className="ar-prow-btn ghost">
                            연습하기
                          </Link>
                          <Link href={`/marketplace/${v.traderId}/strategies/${v.month}`} className="ar-prow-btn">
                            전략 상세 보기
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                  {(server ?? []).map((p) => (
                    <li key={p.id} className="mk-card ar-row">
                      <div>
                        <small>{p.month ? monthLabel(p.month) : p.coveredThrough ? `${monthLabel(p.coveredThrough)}까지 전체` : "전체"}</small>
                        <strong>{p.strategy.title}</strong>
                        <p>
                          {day(p.purchasedAt)} 구매 · <span className={p.paymentStatus === "PAID" ? "ar-ok" : "ar-warn"}>{STATUS[p.paymentStatus] ?? p.paymentStatus}</span>
                        </p>
                      </div>
                      <div className="ar-side">
                        <strong>{won(Number(p.price))}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
