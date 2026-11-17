"use client";
// 판매 관리 개요: 전략 관리 · 판매 내역 · 정산 관리 요약 (GET /strategies + /market/royalties)
import Link from "next/link";
import { Card, PageHead, Stat } from "../ui";
import { saleState, useSeller, won } from "./data";

export default function SalesPage() {
  const { strategies, totals } = useSeller();
  const selling = (strategies ?? []).filter((s) => saleState(s).tone === "on").length;
  const rows = [
    ["전략 관리", `${strategies?.length ?? 0}개 · 판매 중 ${selling}개`, "/mypage/sales/strategies"],
    ["판매 내역", `${totals.count}건`, "/mypage/sales/history"],
    ["정산 관리", `정산 예정 ${won(totals.pending)}`, "/mypage/sales/settlements"],
  ] as const;
  return (
    <>
      <PageHead title="판매 관리" />
      <Card>
        <div className="mp-stats">
          <Stat label="매출" value={totals.revenue} unit="원" />
          <Stat label="플랫폼 수수료" value={totals.fee} unit="원" />
          <Stat label="정산 예정 금액" value={totals.pending} unit="원" />
        </div>
      </Card>
      <Card
        title="전략 · 판매 · 정산"
        action={
          <Link className="mp-btn primary small" href="/mypage/business">
            전략 등록
          </Link>
        }
      >
        <div className="mp-list tall">
          {rows.map(([name, count, href]) => (
            <Link key={name} href={href} className="mp-list-link">
              <strong>{name}</strong>
              <span className="num">{count}</span>
              <span aria-hidden>›</span>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
