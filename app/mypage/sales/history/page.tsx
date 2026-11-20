"use client";
// 판매 내역 (시안 2026-11-18): 합계 · 전략별 판매 현황 · 최근 판매 내역 (GET /market/royalties). 구매자는 익명
import { useState } from "react";
import { Card, Empty, PageHead, PeriodTabs, downloadCsv, inPeriod, type Period } from "../../ui";
import { SALE_STATUS, day, dayTime, saleState, useSeller } from "../data";
import StrategiesModal from "../StrategiesModal";

const krw = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

export default function SalesHistoryPage() {
  const { sales, strategies, byStrategy, error, loading } = useSeller();
  const [period, setPeriod] = useState<Period>({ kind: "all" });
  const [open, setOpen] = useState(false);
  const live = (sales ?? []).filter((s) => s.status !== "CANCELED");
  const list = (sales ?? []).filter((s) => inPeriod(s.soldAt, period));

  function download() {
    downloadCsv(`판매내역_${new Date().toISOString().slice(0, 10)}.csv`, [
      ["거래 일시", "판매 전략", "구매자", "결제 금액", "상태"],
      ...list.map((s) => [dayTime(s.soldAt), s.strategy.title, "익명", s.price, SALE_STATUS[s.status] ?? s.status]),
    ]);
  }

  return (
    <>
      <PageHead title="판매 내역" desc="구독 판매 기록을 조회합니다." parent={["판매 관리", "/mypage/sales"]} />
      <Card className="mp-sales-history" title="판매 내역" desc="기간별 판매 실적과 상세 주문 내역을 확인합니다.">
        <div className="mp-boxes">
          <div>
            <span>총 판매 건수</span>
            <strong>{loading || !live.length ? "—" : `${live.length}건`}</strong>
          </div>
          <div>
            <span>총 판매액</span>
            <strong>{loading || !live.length ? "—" : krw(live.reduce((a, s) => a + s.price, 0))}</strong>
          </div>
          <div>
            <span>정산 금액</span>
            <strong>{loading || !live.length ? "—" : krw(live.reduce((a, s) => a + s.amount, 0))}</strong>
          </div>
        </div>

        <div className="mp-sub-head">
          <div>
            <h3>전략별 판매 현황</h3>
            <p>등록한 전략이 지금까지 얼마나 판매됐는지 확인합니다.</p>
          </div>
          <button type="button" className="mp-btn ghost-line" onClick={() => setOpen(true)}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M5 4h9M5 8h9M5 12h9M2 4h.5M2 8h.5M2 12h.5" />
            </svg>
            전략 리스트
          </button>
        </div>
        <div className="mp-grid-table plain" style={{ ["--cols" as string]: "2.4fr 1fr 0.8fr 1fr 0.9fr" }}>
          <div className="th">
            <span>전략</span>
            <span>등록일</span>
            <span>판매 건수</span>
            <span>판매액</span>
            <span>판매 상태</span>
          </div>
          {(strategies ?? []).map((s) => {
            const st = saleState(s);
            const b = byStrategy.get(s.id);
            return (
              <div key={s.id} className="tr">
                <span className="clip" title={s.title}>
                  <strong>{s.title}</strong>
                </span>
                <span className="num">{day(s.createdAt)}</span>
                <span className="num">
                  <strong>{(b?.buyers ?? 0).toLocaleString("ko-KR")}건</strong>
                </span>
                <span className="num">
                  <strong>{krw(b?.revenue ?? 0)}</strong>
                </span>
                <span>
                  <em className={`mp-status${st.tone === "on" ? "" : st.tone === "pause" ? " wait" : " off"}`}>{st.label}</em>
                </span>
              </div>
            );
          })}
        </div>
        {!loading && !strategies?.length && <Empty text="표시할 전략별 판매 내역이 없습니다." />}

        <h3 className="mp-sub-title">최근 판매 내역</h3>
        <div className="mp-toolbar">
          <PeriodTabs value={period} onChange={setPeriod} />
          <button type="button" className="mp-btn ghost-line" onClick={download} disabled={!list.length}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M8 2v8M4.5 6.8 8 10.2l3.5-3.4M2.5 13.5h11" />
            </svg>
            내역 다운로드
          </button>
        </div>
        {error && <p className="mp-muted">{error}</p>}
        <div className="mp-grid-table plain" style={{ ["--cols" as string]: "1.2fr 2.2fr 1fr 1fr 0.9fr" }}>
          <div className="th">
            <span>거래 일시</span>
            <span>판매 전략</span>
            <span>구매자</span>
            <span>결제 금액</span>
            <span>상태</span>
          </div>
          {list.map((s) => (
            <div key={s.id} className="tr">
              <span className="num">{dayTime(s.soldAt)}</span>
              <span className="clip" title={s.strategy.title}>
                <strong>{s.strategy.title}</strong>
              </span>
              <span>익명</span>
              <span className="num">
                <strong>{krw(s.price)}</strong>
              </span>
              <span>
                <em className={`mp-status${s.status === "CANCELED" ? " off" : ""}`}>{s.status === "CANCELED" ? "취소" : "결제 완료"}</em>
              </span>
            </div>
          ))}
        </div>
        {loading ? <Empty text="불러오는 중…" /> : !list.length && <div className="mp-empty-2"><strong>판매 내역이 없습니다.</strong><p>구독이 생기면 이곳에서 확인할 수 있습니다.</p></div>}
      </Card>
      {open && <StrategiesModal strategies={strategies} views={byStrategy} onClose={() => setOpen(false)} />}
    </>
  );
}
