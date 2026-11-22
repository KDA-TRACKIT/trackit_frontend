"use client";
// 판매 내역 (시안 2026-11-18): 합계 · 전략별 판매 현황 · 최근 판매 내역 (GET /market/royalties). 구매자는 익명
import { useEffect, useState } from "react";
import { apiRequest } from "../../../../lib/api/client";
import { Card, Empty, PageHead, PeriodTabs, downloadCsv, inPeriod, type Period } from "../../ui";
import { SALE_STATUS, day, dayTime, useSeller } from "../data";
import StrategiesModal from "../StrategiesModal";

const krw = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
/** 내 구독 현황 (GET /me/subscribers) · 판매자 몫 (기본 수수료 20% 뺀 것, 구독 관리와 같게) */
type MySubscribers = { active: number; total: number; payments: number; revenue: number };
const SELLER_SHARE = 0.8;

export default function SalesHistoryPage() {
  const { sales, strategies, byStrategy, error, loading } = useSeller();
  const [period, setPeriod] = useState<Period>({ kind: "all" });
  const [open, setOpen] = useState(false);
  const list = (sales ?? []).filter((s) => inPeriod(s.soldAt, period));
  // 위 상자 = 구독 현황 (2026-11-22: 구독자 수 · 전략 개수 · 정산 금액, 구독 관리 첫 화면과 같게)
  const [subs, setSubs] = useState<MySubscribers | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    apiRequest<MySubscribers>("/me/subscribers")
      .then((v) => alive && setSubs(v))
      .catch(() => alive && setSubs(null));
    return () => {
      alive = false;
    };
  }, []);

  function download() {
    downloadCsv(`판매내역_${new Date().toISOString().slice(0, 10)}.csv`, [
      ["거래 일시", "판매 전략", "구매자", "결제 금액", "상태"],
      ...list.map((s) => [dayTime(s.soldAt), s.strategy.title, "익명", s.price, SALE_STATUS[s.status] ?? s.status]),
    ]);
  }

  return (
    <>
      <PageHead title="구독 내역" parent={["구독 관리", "/mypage/sales"]} />
      <Card className="mp-sales-history" title="구독 내역">
        <div className="mp-boxes">
          <div>
            <span>구독자 수</span>
            <strong>{subs ? `${subs.active.toLocaleString("ko-KR")}명` : "—"}</strong>
          </div>
          <div>
            <span>전략 개수</span>
            <strong>{loading ? "—" : `${strategies?.length ?? 0}개`}</strong>
          </div>
          <div>
            <span>정산 금액</span>
            <strong>{subs ? krw(subs.revenue * SELLER_SHARE) : "—"}</strong>
          </div>
        </div>

        <div className="mp-sub-head">
          <div>
            <h3>전략 목록</h3>
          </div>
          <button type="button" className="mp-btn ghost-line" onClick={() => setOpen(true)}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M5 4h9M5 8h9M5 12h9M2 4h.5M2 8h.5M2 12h.5" />
            </svg>
            전략 리스트
          </button>
        </div>
        {/* 전략 목록 (2026-11-22, 예전 '전략별 판매 현황'): 구독제라 전략마다 판매 건수 · 판매액은 없음 → 섹터 · 기간 · 상태 */}
        <div className="mp-grid-table plain" style={{ ["--cols" as string]: "2.4fr 1fr 1.4fr" }}>
          <div className="th">
            <span>전략</span>
            <span>섹터</span>
            <span>기간</span>
          </div>
          {(strategies ?? []).map((s) => {
            return (
              <div key={s.id} className="tr">
                <span className="clip" title={s.title}>
                  <strong>{s.title}</strong>
                </span>
                <span>{s.sector ?? "—"}</span>
                {/* 끝은 다음 날 0시로 저장돼 있어 마지막 날로 보여 줌 (11.01 ~ 11.21 → 11.01 ~ 11.20) */}
                <span className="num">{s.periodStart ? `${day(s.periodStart)} ~ ${s.periodEnd ? day(new Date(new Date(s.periodEnd).getTime() - 1).toISOString()) : ""}` : day(s.createdAt)}</span>
              </div>
            );
          })}
        </div>
        {!loading && !strategies?.length && <Empty text="등록한 전략이 없습니다." />}

        <h3 className="mp-sub-title">최근 구독 결제</h3>
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
        {loading ? <Empty text="불러오는 중…" /> : !list.length && <div className="mp-empty-2"><strong>구독 내역이 없습니다.</strong><p>구독이 생기면 이곳에서 확인할 수 있습니다.</p></div>}
      </Card>
      {open && <StrategiesModal strategies={strategies} views={byStrategy} onClose={() => setOpen(false)} />}
    </>
  );
}
