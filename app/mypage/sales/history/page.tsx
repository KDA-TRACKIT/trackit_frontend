"use client";
// 판매 관리 · 판매 내역: 내 전략이 팔린 기록 (GET /market/royalties). 구매자는 익명
import { useState } from "react";
import { Card, Empty, FilterChips, PageHead, Stat, Table } from "../../ui";
import { SALE_STATUS, dayTime, saleItem, useSeller, won } from "../data";

const PERIODS = ["전체 기간", "최근 30일", "최근 7일"] as const;
const DAYS: Record<(typeof PERIODS)[number], number> = { "전체 기간": 0, "최근 30일": 30, "최근 7일": 7 };

export default function SalesHistoryPage() {
  const { sales, error, loading } = useSeller();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("전체 기간");
  const [now] = useState(() => Date.now());
  const from = DAYS[period] ? now - DAYS[period] * 86_400_000 : 0;
  const list = (sales ?? []).filter((s) => new Date(s.soldAt).getTime() >= from);
  const live = list.filter((s) => s.status !== "CANCELED");
  return (
    <>
      <PageHead title="판매 내역" parent={["판매 관리", "/mypage/sales"]} />
      <Card>
        <div className="mp-stats">
          <Stat boxed label="판매" value={live.length} unit="건" />
          <Stat boxed label="매출" value={live.reduce((a, s) => a + s.price, 0)} unit="원" />
          <Stat boxed label="정산 금액" value={live.reduce((a, s) => a + s.amount, 0)} unit="원" />
        </div>
        <div className="mp-toolbar" style={{ marginTop: 20 }}>
          <FilterChips options={PERIODS} value={period} onChange={setPeriod} />
        </div>
        {error && <p className="mp-muted">{error}</p>}
        <Table cols={["거래 일시", "판매 전략", "구매 범위", "구매자", "결제 금액", "상태"]}>
          {list.map((s) => (
            <div key={s.id} className="mp-tr">
              <span className="num">{dayTime(s.soldAt)}</span>
              <span className="clip" title={s.strategy.title}>
                {s.strategy.title}
              </span>
              <span className="clip">{saleItem(s)}</span>
              <span>익명</span>
              <span className="num">{won(s.price)}</span>
              <span>
                <em className={`mp-state ${s.status === "SETTLED" ? "on" : s.status === "CANCELED" ? "off" : "pause"}`}>{SALE_STATUS[s.status] ?? s.status}</em>
              </span>
            </div>
          ))}
        </Table>
        {loading ? <Empty text="불러오는 중…" /> : !list.length && <Empty text="판매 내역이 없어요" />}
      </Card>
    </>
  );
}
