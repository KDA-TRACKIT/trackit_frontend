"use client";
// 판매 관리 · 공개 전략 (전략 API 연결 전: 빈 목록)
import Link from "next/link";
import { useState } from "react";
import { Card, Empty, FilterChips, PageHead, Table } from "../../ui";

const FILTERS = ["전체 전략", "공개 중", "비공개"] as const;

export default function StrategiesPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("전체 전략");
  const register = (
    <Link className="mp-btn primary small" style={{ height: 40 }} href="/mypage/business">
      전략 등록
    </Link>
  );
  return (
    <>
      <PageHead title="공개 전략" parent={["판매 관리", "/mypage/sales"]} />
      <Card title="내 전략" meta={0} action={register}>
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
        <Table cols={["전략명", "", "등록일", "공개 상태", "열람 수", "관리"]} />
        <Empty text="등록한 전략이 없어요">
          <Link className="mp-btn primary" style={{ width: 142 }} href="/mypage/business">
            첫 전략 등록하기
          </Link>
        </Empty>
      </Card>
    </>
  );
}
