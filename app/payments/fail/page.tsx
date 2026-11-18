"use client";
// 토스 결제창에서 실패 · 취소하면 돌아오는 곳 (승인 요청 없음, 돈이 나가지 않음)
import Link from "next/link";
import { useEffect, useState } from "react";
import SiteHeader from "../../SiteHeader";
import { pendingBack } from "../../../lib/api/payments";
import "../payments.css";

export default function PaymentFail() {
  const [info, setInfo] = useState<{ code: string; message: string; back: string | null } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setInfo({ code: q.get("code") ?? "", message: q.get("message") ?? "결제가 취소됐어요.", back: pendingBack(q.get("orderId")) });
  }, []);
  return (
    <main className="pay-page">
      <SiteHeader active="marketplace" />
      <section className="pay-card">
        <span className="pay-icon err" aria-hidden>
          !
        </span>
        <h1>결제하지 않았어요</h1>
        <p>{info?.message}</p>
        {info?.code && <small className="mono">{info.code}</small>}
        <div className="pay-actions">
          <Link className="pay-primary" href={info?.back || "/marketplace"}>
            돌아가기
          </Link>
        </div>
      </section>
    </main>
  );
}
