"use client";
// 판매 관리 · 판매 내역 (열람권 판매 API 연결 전: 빈 목록)
import { useState } from "react";
import { Card, Empty, FilterChips, PageHead, Stat, Table } from "../../ui";

const PERIODS = ["전체 기간", "최근 30일", "최근 7일"] as const;

export default function SalesHistoryPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("전체 기간");
  return (
    <>
      <PageHead title="판매 내역" parent={["판매 관리", "/mypage/sales"]} />
      <Card>
        <div className="mp-stats">
          <Stat boxed label="판매" unit="건" />
          <Stat boxed label="판매액" unit="원" />
          <Stat boxed label="정산 금액" unit="원" />
        </div>
        <div className="mp-toolbar" style={{ marginTop: 20 }}>
          <FilterChips options={PERIODS} value={period} onChange={setPeriod} />
          <button type="button" className="mp-btn" disabled>
            CSV 다운로드
          </button>
        </div>
        <Table cols={["거래 일시", "판매 전략", "", "구매자", "결제 금액", "상태"]} />
        <Empty text="판매 내역이 없어요" />
      </Card>
    </>
  );
}
