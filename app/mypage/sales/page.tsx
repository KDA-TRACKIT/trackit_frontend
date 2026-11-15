"use client";
// 판매 관리 개요 (판매자·열람권 API 연결 전이라 빈 값)
import Link from "next/link";
import { Card, PageHead, Stat } from "../ui";

const ROWS = [
  ["공개 전략", "0개", "/mypage/sales/strategies"],
  ["판매 내역", "0건", "/mypage/sales/history"],
  ["정산 내역", "0원", "/mypage/sales/settlements"],
] as const;

export default function SalesPage() {
  return (
    <>
      <PageHead title="판매 관리" />
      <Card>
        <div className="mp-stats">
          <Stat label="전략" unit="개" />
          <Stat label="판매" unit="건" />
          <Stat label="정산 금액" unit="원" />
        </div>
      </Card>
      <Card
        title="전략 · 열람권"
        action={
          <Link className="mp-btn primary small" href="/mypage/sales/strategies">
            전략 등록
          </Link>
        }
      >
        <div className="mp-list tall">
          {ROWS.map(([name, count, href]) => (
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
