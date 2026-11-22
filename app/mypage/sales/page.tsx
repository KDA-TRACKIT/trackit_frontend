"use client";
// 구독 관리 (2026-11-22, 예전 '전략 판매 관리'): 구독 현황(구독자 수 · 전략 개수 · 정산 금액) + 전략 및 구독 관리
//   구독자 · 결제 = GET /me/subscribers, 전략 = GET /strategies
//   정산 금액 = 결제 금액 합계에서 플랫폼 수수료 10% 를 뺀 판매자 몫
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, PageHead } from "../ui";
import { SELLER_SHARE, useSeller, won } from "./data";
import { useMypage } from "../context";
import { useBusiness } from "../business/state";
import StrategiesModal from "./StrategiesModal";
import { apiRequest } from "../../../lib/api/client";

type MySubscribers = { active: number; total: number; payments: number; revenue: number };

export default function SalesPage() {
  const { strategies, byStrategy, loading } = useSeller();
  const [open, setOpen] = useState(false);
  const { user } = useMypage();
  // 판매자가 아니면 비즈니스 전환부터, 판매자면 달마다 잠긴 기록(전략보관함)에서 전략으로
  const business = useBusiness(user.id);
  // 전략 등록 = 내 노트의 전략 판매 창 (2026-11-22). 판매자가 아니면 비즈니스 전환부터
  const registerHref = business && business.status !== "pending" ? "/archive/notes" : "/mypage/business";
  const [subs, setSubs] = useState<MySubscribers | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    apiRequest<MySubscribers>("/me/subscribers")
      .then((v) => live && setSubs(v))
      .catch(() => live && setSubs(null));
    return () => {
      live = false;
    };
  }, []);
  const subsReady = subs !== undefined;
  return (
    <>
      <PageHead title="구독 관리" />
      <Card title="구독 현황">
        <div className="mp-three">
          <div>
            <span>구독자 수</span>
            <strong>{!subsReady || subs === null ? "—" : `${subs.active.toLocaleString("ko-KR")}명`}</strong>
          </div>
          <div>
            <span>전략 개수</span>
            <strong>{loading ? "—" : `${strategies?.length ?? 0}개`}</strong>
          </div>
          <div>
            <span>정산 금액</span>
            <strong>{!subsReady || subs === null ? "—" : won(subs.revenue * SELLER_SHARE)}</strong>
          </div>
        </div>
      </Card>
      <Card
        title="전략 및 구독 관리"
        action={
          <Link className="mp-btn primary small" href={registerHref}>
            전략 등록
          </Link>
        }
      >
        <div className="mp-rows">
          <div>
            <strong>전략 목록</strong>
            <span>구독자가 볼 수 있는 전략</span>
            <button type="button" className="mp-text-link" onClick={() => setOpen(true)}>
              조회하기 →
            </button>
          </div>
          <div>
            <strong>구독 내역</strong>
            <span>구독 결제 기록</span>
            <Link className="mp-text-link" href="/mypage/sales/history">
              조회하기 →
            </Link>
          </div>
          <div>
            <strong>정산 내역</strong>
            <span>지급 예정 및 정산 완료 기록</span>
            <Link className="mp-text-link" href="/mypage/sales/settlements">
              조회하기 →
            </Link>
          </div>
        </div>
      </Card>
      {open && <StrategiesModal strategies={strategies} views={byStrategy} onClose={() => setOpen(false)} />}
    </>
  );
}
