"use client";
// 전략 판매 관리 (시안 2026-11-18): 판매 현황 + 전략 및 열람권 관리 (GET /strategies + /market/royalties)
import Link from "next/link";
import { useState } from "react";
import { Card, PageHead } from "../ui";
import { useSeller, won } from "./data";
import { useMypage } from "../context";
import { useBusiness } from "../business/state";
import StrategiesModal from "./StrategiesModal";

export default function SalesPage() {
  const { strategies, totals, byStrategy, loading } = useSeller();
  const [open, setOpen] = useState(false);
  const { user } = useMypage();
  // 판매자가 아니면 비즈니스 전환부터, 판매자면 달마다 잠긴 기록(아카이브)에서 전략으로
  const business = useBusiness(user.id);
  const registerHref = business && business.status !== "pending" ? "/archive" : "/mypage/business";
  const dash = (v: string | null) => (loading || v === null ? "—" : v);
  return (
    <>
      <PageHead title="전략 판매 관리" desc="열람권 판매 및 정산 현황을 관리하세요." />
      <Card title="판매 현황" desc="내 전략의 판매·열람 현황입니다.">
        <div className="mp-three">
          <div>
            <span>전략 개수</span>
            <strong>{dash(strategies?.length ? `${strategies.length}개` : null)}</strong>
          </div>
          <div>
            <span>총 판매 건수</span>
            <strong>{dash(totals.count ? `${totals.count}건` : null)}</strong>
          </div>
          <div>
            <span>정산 금액</span>
            <strong>{dash(totals.payout ? won(totals.payout) : null)}</strong>
          </div>
        </div>
      </Card>
      <Card
        title="전략 및 열람권 관리"
        desc="무료 열람과 유료 열람권을 구분해 관리합니다."
        action={
          <Link className="mp-btn primary small" href={registerHref}>
            전략 등록
          </Link>
        }
      >
        <div className="mp-rows">
          <div>
            <strong>전략 개수</strong>
            <span>열람이 가능한 유/무료 전략 목록</span>
            <button type="button" className="mp-text-link" onClick={() => setOpen(true)}>
              조회하기 →
            </button>
          </div>
          <div>
            <strong>판매 내역</strong>
            <span>판매 기록 및 구매 요청</span>
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
