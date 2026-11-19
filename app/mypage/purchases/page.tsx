"use client";
// 마이페이지 · 구매 내역: 구매한 트레이더 전략과 이용 기간
//   전략 마켓 열람권 (GET /me/passes) + 판매 등록된 전략 구매 (GET /market/purchases)
//   열람권으로 연 전략과 산 전략은 기간 제한 없이 계속 볼 수 있음 → 이용 기간 = 연(산) 날부터 계속
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../lib/api/client";
import { usePasses } from "../../../lib/purchases";
import { monthLabel } from "../../marketplace/data";
import { day, won } from "../sales/data";
import { Card, Empty, FilterChips, PageHead, Stat, Table } from "../ui";

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

type Row = {
  id: string;
  trader: string;
  traderHref?: string;
  title: string;
  scope: string;
  price: number;
  boughtAt: string | null;
  period: string;
  state: "열람 중" | "미사용" | "결제 대기" | "환불";
};

const FILTERS = ["전체", "열람 중", "미사용"] as const;

export default function PurchasesPage() {
  const passes = usePasses();
  const [server, setServer] = useState<ServerPurchase[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("전체");

  useEffect(() => {
    apiRequest<ServerPurchase[]>("/market/purchases")
      .then(setServer)
      .catch(() => setServer([]));
  }, []);

  const rows = useMemo<Row[]>(() => {
    const fromPasses: Row[] = passes.map((p) =>
      p.used
        ? {
            id: p.id,
            trader: p.traderName,
            traderHref: `/marketplace/${p.traderId}`,
            title: p.used.title,
            scope: `${monthLabel(p.used.month)} 전략`,
            price: p.amount,
            boughtAt: p.approvedAt,
            period: `${day(p.used.at)} ~ 계속`,
            state: "열람 중",
          }
        : {
            id: p.id,
            trader: p.traderName,
            traderHref: `/marketplace/${p.traderId}`,
            title: "열람권 (아직 안 씀)",
            scope: "월별 전략 1개",
            price: p.amount,
            boughtAt: p.approvedAt,
            period: "쓰는 날부터 계속",
            state: "미사용",
          },
    );
    const fromServer: Row[] = (server ?? []).map((p) => ({
      id: p.id,
      trader: "-",
      title: p.strategy.title,
      scope: p.kind === "ALL" ? `전체${p.coveredThrough ? ` (~${p.coveredThrough})` : ""}` : `${p.month ?? "한 달"} 전략`,
      price: Number(p.price),
      boughtAt: p.purchasedAt,
      period: p.paymentStatus === "PAID" ? `${day(p.purchasedAt)} ~ 계속` : "-",
      state: p.paymentStatus === "PAID" ? "열람 중" : p.paymentStatus === "REFUNDED" ? "환불" : "결제 대기",
    }));
    return [...fromPasses, ...fromServer].sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));
  }, [passes, server]);

  const list = rows.filter((r) => filter === "전체" || r.state === filter);
  const traders = new Set(rows.filter((r) => r.trader !== "-").map((r) => r.trader)).size;

  return (
    <>
      <PageHead title="구매 내역" />
      <Card>
        <div className="mp-stats">
          <Stat boxed label="열람 중인 전략" value={rows.filter((r) => r.state === "열람 중").length} unit="개" />
          <Stat boxed label="남은 열람권" value={rows.filter((r) => r.state === "미사용").length} unit="장" />
          <Stat boxed label="결제 합계" value={rows.filter((r) => r.state !== "환불" && r.state !== "결제 대기").reduce((a, r) => a + r.price, 0)} unit="원" />
        </div>
        <p className="mp-muted" style={{ margin: "12px 0 0", fontSize: 12 }}>
          트레이더 {traders}명의 전략을 샀어요 · 연 전략은 기간 제한 없이 계속 볼 수 있어요.
        </p>
        <div className="mp-toolbar" style={{ marginTop: 20 }}>
          <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
          <Link className="mp-btn" href="/archive/purchases">
            전략보관함에서 보기
          </Link>
        </div>
        <Table cols={["트레이더", "전략", "구매 범위", "결제 금액", "구매일", "이용 기간", "상태"]}>
          {list.map((r) => (
            <div key={r.id} className="mp-tr">
              <span className="clip">{r.traderHref ? <Link href={r.traderHref}>{r.trader}</Link> : r.trader}</span>
              <span className="clip" title={r.title}>
                <strong>{r.title}</strong>
              </span>
              <span className="clip">{r.scope}</span>
              <span className="num">{won(r.price)}</span>
              <span className="num">{day(r.boughtAt)}</span>
              <span className="num">{r.period}</span>
              <span>
                <em className={`mp-state ${r.state === "열람 중" ? "on" : r.state === "미사용" ? "pause" : "off"}`}>{r.state}</em>
              </span>
            </div>
          ))}
        </Table>
        {server === null ? (
          <Empty text="불러오는 중…" />
        ) : (
          !list.length && (
            <Empty text={rows.length ? "조건에 맞는 구매가 없어요" : "아직 구매한 전략이 없어요"}>
              {!rows.length && (
                <Link className="mp-btn primary" style={{ width: 142 }} href="/marketplace">
                  전략 마켓 가기
                </Link>
              )}
            </Empty>
          )
        )}
      </Card>
    </>
  );
}
