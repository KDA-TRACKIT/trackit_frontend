"use client";
// 판매 관리 · 정산 관리: 매출 · 플랫폼 수수료 · 정산 예정 금액, 달별 정산 (GET /market/royalties, 모의 정산 — 실제 지급 없음)
import { useMemo, useState } from "react";
import { Card, Empty, FilterChips, PageHead, Stat, Table } from "../../ui";
import { SELLER_TIERS, sellerTier, useSeller, won, type Sale } from "../data";
import { useActivity } from "../../data";

const STATUS = ["전체 정산", "정산 예정", "정산 완료"] as const;

/** 판매한 달(KST)별로 묶기 */
function byMonth(sales: Sale[]) {
  const m = new Map<string, Sale[]>();
  for (const s of sales) {
    const d = new Date(new Date(s.soldAt).getTime() + 9 * 3_600_000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    m.set(key, [...(m.get(key) ?? []), s]);
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default function SettlementsPage() {
  const { sales, totals, error, loading } = useSeller();
  const { trades } = useActivity();
  // 사전 작성: 체결 시각보다 먼저 쓴 기록
  const pre = trades.filter((r) => r.executionTime && r.noteTime && r.noteTime <= r.executionTime).length;
  const preRate = trades.length ? Math.round((pre / trades.length) * 100) : 0;
  const { cur, next } = sellerTier(trades.length, preRate);
  const [status, setStatus] = useState<(typeof STATUS)[number]>("전체 정산");
  const rows = useMemo(() => {
    const live = (sales ?? []).filter((s) => s.status !== "CANCELED");
    return byMonth(live)
      .map(([month, list]) => {
        const pending = list.some((s) => s.status === "PENDING");
        return {
          month,
          revenue: list.reduce((a, s) => a + s.price, 0),
          fee: list.reduce((a, s) => a + s.fee, 0),
          payout: list.reduce((a, s) => a + s.amount, 0),
          state: pending ? "정산 예정" : "정산 완료",
        };
      })
      .filter((r) => status === "전체 정산" || r.state === status);
  }, [sales, status]);
  const rate = totals.revenue ? Math.round((totals.fee / totals.revenue) * 100) : 20;

  return (
    <>
      <PageHead title="정산 관리" parent={["판매 관리", "/mypage/sales"]} />
      <Card title="판매자 등급 · 수수료" meta={cur.name}>
        <p className="mp-muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          확인된 기록을 쌓을수록 수수료가 낮아져요. 지금 거래내역 확인 <b>{trades.length}건</b> · 사전 작성 <b>{preRate}%</b>
          {next ? ` → ${next.name}까지 거래 ${Math.max(0, next.need.trades - trades.length)}건 · 사전 작성 ${next.need.pre}% 이상` : " · 최고 등급이에요"}
        </p>
        <div className="mp-tiers">
          {SELLER_TIERS.map((t) => (
            <div key={t.key} className={t.key === cur.key ? "on" : ""}>
              <strong>{t.name}</strong>
              <b>수수료 {t.fee}%</b>
              <small>{t.need.trades ? `거래내역 확인 ${t.need.trades}건+ · 사전 작성 ${t.need.pre}%+` : "조건 없음"}</small>
              <small>{t.perk}</small>
            </div>
          ))}
        </div>
        <p className="mp-muted" style={{ margin: "8px 0 0", fontSize: 11.5 }}>
          등급 수수료는 정책 확정 뒤 다음 판매부터 적용될 예정이에요. 지금 정산은 기본 수수료로 계산돼요.
        </p>
      </Card>
      <Card>
        <div className="mp-stats">
          <Stat boxed label="매출" value={totals.revenue} unit="원" />
          <Stat boxed label={`플랫폼 수수료 (${rate}%)`} value={totals.fee} unit="원" />
          <Stat boxed label="정산 예정 금액" value={totals.pending} unit="원" />
        </div>
        <p className="mp-muted" style={{ margin: "12px 0 0", fontSize: 12 }}>
          정산 완료 {won(totals.settled)} · 대기 {totals.pendingCount}건 · 지금은 모의 정산이라 실제로 지급되지 않아요.
        </p>
        <div className="mp-toolbar" style={{ marginTop: 20 }}>
          <FilterChips options={STATUS} value={status} onChange={setStatus} />
        </div>
        {error && <p className="mp-muted">{error}</p>}
        <Table cols={["정산 기준 기간", "매출", "수수료", "지급 예정액", "상태"]}>
          {rows.map((r) => (
            <div key={r.month} className="mp-tr">
              <span className="num">{r.month.replace("-", ".")}</span>
              <span className="num">{won(r.revenue)}</span>
              <span className="num">−{won(r.fee)}</span>
              <span className="num">
                <strong>{won(r.payout)}</strong>
              </span>
              <span>
                <em className={`mp-state ${r.state === "정산 완료" ? "on" : "pause"}`}>{r.state}</em>
              </span>
            </div>
          ))}
        </Table>
        {loading ? <Empty text="불러오는 중…" /> : !rows.length && <Empty text="정산 내역이 없어요" />}
      </Card>
    </>
  );
}
