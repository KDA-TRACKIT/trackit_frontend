"use client";
// 판매 관리 · 정산 내역 (정산 API 연결 전: 빈 목록)
import { useState } from "react";
import { Card, Empty, FilterChips, PageHead, Stat, Table } from "../../ui";

const STATUS = ["전체 정산", "정산 예정", "정산 완료"] as const;

export default function SettlementsPage() {
  const [status, setStatus] = useState<(typeof STATUS)[number]>("전체 정산");
  return (
    <>
      <PageHead title="정산 내역" parent={["판매 관리", "/mypage/sales"]} />
      <Card>
        <div className="mp-stats">
          <Stat boxed label="정산 예정" unit="원" />
          <Stat boxed label="정산 완료" unit="원" />
          <Stat boxed label="대기" unit="건" />
        </div>
        <div className="mp-toolbar" style={{ marginTop: 20 }}>
          <FilterChips options={STATUS} value={status} onChange={setStatus} />
          <button type="button" className="mp-btn" disabled>
            CSV 다운로드
          </button>
        </div>
        <Table cols={["정산 기준 기간", "판매 금액", "수수료", "지급 예정액", "상태"]} />
        <Empty text="정산 내역이 없어요" />
      </Card>
    </>
  );
}
