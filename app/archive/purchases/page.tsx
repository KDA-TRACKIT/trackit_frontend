"use client";
// 전략보관함 첫 화면 = 구독한 트레이더 (구독 중이면 끝나는 날, 그 트레이더 전략 전부)
//   구독을 산 트레이더 + 무료 전략만 본 트레이더를 카드로: 보유 구독(티켓 그림) · 전략 이행률 · 최근 1개월 수익률 · 보유 전략
//   보유 구독 = 아직 안 쓴 구독만 (전략을 연 구독은 '보유 전략'의 달로 보임). 다 썼으면 0개
//   보유 구독 티켓은 장수만큼 겹쳐 '보유 구독' 글자 끝에 맞춰 끝나고, 7장부터 가운데 ⋯ (PassTickets)
//   카드를 누르면 그 트레이더의 월별 전략 (/archive/purchases/[id])
//   구독 = 계정(lib/purchases → GET /me/passes), 무료로 본 전략 = 이 브라우저(lib/free-views)
//   실제 판매 등록을 산 것(서버 GET /market/purchases)은 있으면 아래에 따로
import Link from "next/link";
import { useEffect, useState } from "react";
import SiteHeader from "../../SiteHeader";
import { apiRequest } from "../../../lib/api/client";
import { subscribed, subscriptionEnd, usePasses, usePassesLoaded } from "../../../lib/purchases";
import { useFreeViews } from "../../../lib/free-views";
import { useLikeTotals } from "../../../lib/feedback";
import { monthLabel, pct, strategiesOf, tone, traderById } from "../../marketplace/data";
import HoneyPot from "../../HoneyPot";
import "../../marketplace/marketplace.css";
import "../archive.css";
import BeeLoader from "../../BeeLoader";

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
  const loaded = usePassesLoaded();
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

  // 구독한 트레이더 + 무료 전략만 본 트레이더. 구독 중이면 그 트레이더 전략 전부
  const traders = [...new Set([...passes.map((p) => p.traderId), ...freeViews.map((v) => v.traderId)])].map((id) => {
    const mine = passes.filter((p) => p.traderId === id);
    const free = freeViews.filter((v) => v.traderId === id);
    const t = traderById(id);
    const active = subscribed(passes, id);
    const end = subscriptionEnd(passes, id);
    const months = [...new Set([...(active && t ? strategiesOf(t).map((s) => s.month) : []), ...mine.flatMap((p) => (p.used ? [p.used.month] : [])), ...free.map((v) => v.month)])].sort().reverse();
    return { id, t, name: t?.name ?? mine[0]?.traderName ?? free[0].traderName, paid: mine.length > 0, active, end, months, ret: t?.monthly.at(-1)?.ret ?? null };
  });
  const nothing = server !== null && !traders.length && !server.length;

  return (
    <main className="mk-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <div className="ar-title-row">
          <h1 className="mk-title">구독 목록</h1>
        </div>
        {error && <p className="ar-note">{error}</p>}

        {nothing && !loaded ? (
          // 산 구독을 서버에서 읽는 동안엔 '없음' 화면 대신
          <div className="mk-card mk-empty"><BeeLoader /></div>
        ) : nothing ? (
          <div className="mk-card mk-empty">
            아직 구독한 트레이더가 없어요. 구독하면 그 트레이더의 전략을 모두 볼 수 있어요.
            <br />
            <Link href="/marketplace" className="ar-link">
              전략 마켓 둘러보기 ›
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
                          {g.name}{" "}
                          {g.t && (
                            <span className="ar-heart" title="받은 꿀 합계">
                              <HoneyPot count={likeTotals[g.t.id] ?? 0} /> {likeTotals[g.t.id] ?? 0}
                            </span>
                          )}
                        </strong>
                      </div>
                      <div className="ar-trader-stat">
                        <small>구독</small>
                        <b className={g.paid && !g.active ? "ar-none" : undefined}>{g.active && g.end ? `${g.end.toLocaleDateString("ko-KR")}까지` : g.paid ? "끝남" : "무료 전략"}</b>
                      </div>
                      <div className="ar-trader-stat">
                        <small>전략 이행률</small>
                        <b>{g.t ? `${g.t.follow}%` : "—"}</b>
                      </div>
                      <div className="ar-trader-stat">
                        <small title="산 전략대로 한 매매만 모은 수익률 (최근 1개월)">전략 직결 수익률 · 1개월</small>
                        <b className={g.ret === null ? "" : tone(g.ret)}>{g.ret === null ? "—" : pct(g.ret)}</b>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {(server?.length ?? 0) > 0 && (
              <section className="ar-day">
                <h2>판매 등록 전략</h2>
                <ul>
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
