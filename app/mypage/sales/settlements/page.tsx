"use client";
// 정산 내역 (시안 2026-11-18): 정산 예정 · 완료 · 대기 건수, 달별 정산 (GET /market/royalties, 모의 정산 — 실제 지급 없음)
//   아래에 판매자 등급 · 수수료 · 열람권 가격 범위 (조건 기준값은 보여 주지 않음)
import { useMemo, useState } from "react";
import { Card, Empty, FilterChips, PageHead, PeriodTabs, downloadCsv, inPeriod, type Period } from "../../ui";
import { useSeller, won, type Sale } from "../data";
import { FEE, GRADE_RULES, PRICE_ANCHOR } from "../../../../lib/grade";

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
  const [status, setStatus] = useState<(typeof STATUS)[number]>("전체 정산");
  const [period, setPeriod] = useState<Period>({ kind: "all" });
  const rows = useMemo(() => {
    const live = (sales ?? []).filter((s) => s.status !== "CANCELED" && inPeriod(s.soldAt, period));
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
  }, [sales, status, period]);

  const krw = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
  function download() {
    downloadCsv(`정산내역_${new Date().toISOString().slice(0, 10)}.csv`, [["정산 기준 기간", "판매 금액", "수수료", "지급 예정액", "상태"], ...rows.map((r) => [r.month, r.revenue, r.fee, r.payout, r.state])]);
  }

  return (
    <>
      <PageHead title="정산 내역" desc="판매 수익의 정산 금액과 지급 상태를 확인합니다." parent={["판매 관리", "/mypage/sales"]} />
      <Card title="정산 내역" desc="정산 예정 금액과 완료된 지급 내역을 확인합니다.">
        <div className="mp-boxes">
          <div>
            <span>정산 예정 금액</span>
            <strong>{loading || !totals.pending ? "—" : krw(totals.pending)}</strong>
          </div>
          <div>
            <span>정산 완료 금액</span>
            <strong>{loading || !totals.settled ? "—" : krw(totals.settled)}</strong>
          </div>
          <div>
            <span>정산 대기 건수</span>
            <strong>{loading || !totals.pendingCount ? "—" : `${totals.pendingCount}건`}</strong>
          </div>
        </div>
        <h3 className="mp-sub-title">최근 정산 내역</h3>
        <FilterChips options={STATUS} value={status} onChange={setStatus} />
        <div className="mp-toolbar">
          <PeriodTabs value={period} onChange={setPeriod} />
          <button type="button" className="mp-btn ghost-line" onClick={download} disabled={!rows.length}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M8 2v8M4.5 6.8 8 10.2l3.5-3.4M2.5 13.5h11" />
            </svg>
            내역 다운로드
          </button>
        </div>
        {error && <p className="mp-muted">{error}</p>}
        <div className="mp-grid-table plain" style={{ ["--cols" as string]: "1.2fr 1fr 1fr 1fr 0.8fr" }}>
          <div className="th">
            <span>정산 기준 기간</span>
            <span>판매 금액</span>
            <span>수수료</span>
            <span>지급 예정액</span>
            <span>상태</span>
          </div>
          {rows.map((r) => (
            <div key={r.month} className="tr">
              <span className="num">{r.month.replace("-", ".")}</span>
              <span className="num">{krw(r.revenue)}</span>
              <span className="num">−{krw(r.fee)}</span>
              <span className="num">
                <strong>{krw(r.payout)}</strong>
              </span>
              <span>
                <em className={`mp-status${r.state === "정산 완료" ? "" : " wait"}`}>{r.state}</em>
              </span>
            </div>
          ))}
        </div>
        {loading ? (
          <Empty text="불러오는 중…" />
        ) : (
          !rows.length && (
            <div className="mp-empty-2">
              <strong>정산 내역이 없습니다.</strong>
              <p>판매가 발생하고 정산 대상이 확정되면 여기에 표시됩니다.</p>
            </div>
          )
        )}
        <p className="mp-muted" style={{ margin: "14px 0 0", fontSize: 12 }}>
          지금은 모의 정산이라 실제로 지급되지 않아요.
        </p>
      </Card>
      {/* 판매자 등급 · 수수료 (2026-11-17 회의 공식, lib/grade). 매달 1일 최근 min(활동개월, 24)개월로 평가 */}
      <Card title="판매자 등급 · 수수료" meta="매달 1일 평가">
        <p className="mp-muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          등급은 매달 1일 초과수익(시장 대비) · 샤프 지수 · PSR · 최대 낙폭 · 이행률 · 활동 기간으로 평가해요. 등급이 오를수록 열람권 가격 범위가 높아지고 수수료는 낮아져요.
        </p>
        <div className="mp-tiers">
          {(["D", "C", "B", "A", "VIP"] as const).map((g, i, all) => {
            // 열람권 가격 범위: [이 등급 하한, 다음 등급 하한 − 1단위]. A · VIP 는 상한 없음
            const next = all[i + 1];
            const top = next && g !== "A" ? PRICE_ANCHOR[next].L - (PRICE_ANCHOR[next].L > 100_000 ? 1000 : 100) : null;
            return (
              <div key={g}>
                <strong>{g}</strong>
                <b>수수료 {Math.round(FEE[g] * 100)}%</b>
                <small>
                  열람권 {won(PRICE_ANCHOR[g].L)} ~ {top ? won(top) : "상한 없음"}
                </small>
                <small>
                  활동 {GRADE_RULES[g].T}개월 이상{g === "VIP" ? " · A 등급 연속 12개월" : ""}
                </small>
              </div>
            );
          })}
        </div>
        <p className="mp-muted" style={{ margin: "8px 0 0", fontSize: 11.5 }}>
          승급하면 새 등급 하한가로, 강등되면 아래 등급 상한가로 열람권 가격을 다시 정해요.
        </p>
      </Card>
    </>
  );
}
