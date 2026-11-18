"use client";
// 판매 관리 · 전략 관리: 내 전략의 판매 상태 · 가격 · 구매자 수 · 판매액 (GET /strategies + /market/royalties)
import Link from "next/link";
import { useState } from "react";
import { Card, Empty, FilterChips, PageHead, Table } from "../../ui";
import { day, saleState, useSeller, won } from "../data";

const FILTERS = ["전체 전략", "판매 중", "판매 안 함"] as const;

export default function StrategiesPage() {
  const { strategies, byStrategy, error, loading } = useSeller();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("전체 전략");
  const list = (strategies ?? []).filter((s) => filter === "전체 전략" || (filter === "판매 중" ? saleState(s).tone === "on" : saleState(s).tone !== "on"));
  const register = (
    <Link className="mp-btn primary small" style={{ height: 40 }} href="/mypage/business">
      전략 등록
    </Link>
  );
  return (
    <>
      <PageHead title="전략 관리" parent={["판매 관리", "/mypage/sales"]} />
      <Card title="내 전략" meta={strategies?.length ?? undefined} action={register}>
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
        {error && <p className="mp-muted">{error}</p>}
        <Table cols={["전략명", "등록일", "판매 상태", "가격", "구매자 수", "판매액"]}>
          {list.map((s) => {
            const st = saleState(s);
            const monthly = s.listings.find((l) => l.kind === "MONTHLY");
            const all = s.listings.find((l) => l.kind === "ALL");
            const stat = byStrategy.get(s.id);
            return (
              <div key={s.id} className="mp-tr">
                <span className="clip" title={s.title}>
                  <strong>{s.title}</strong>
                </span>
                <span className="num">{day(s.createdAt)}</span>
                <span>
                  <em className={`mp-state ${st.tone}`}>{st.label}</em>
                </span>
                <span className="num clip">
                  {[monthly && `한 달 ${won(Number(monthly.price))}`, all && `전체 ${won(Number(all.price))}`].filter(Boolean).join(" · ") || "-"}
                </span>
                <span className="num">{(stat?.buyers ?? 0).toLocaleString("ko-KR")}명</span>
                <span className="num">{won(stat?.revenue ?? 0)}</span>
              </div>
            );
          })}
        </Table>
        {loading ? (
          <Empty text="불러오는 중…" />
        ) : (
          !list.length && (
            <Empty text={strategies?.length ? "조건에 맞는 전략이 없어요" : "등록한 전략이 없어요"}>
              {!strategies?.length && (
                <Link className="mp-btn primary" style={{ width: 142 }} href="/mypage/business">
                  첫 전략 등록하기
                </Link>
              )}
            </Empty>
          )
        )}
      </Card>
    </>
  );
}
