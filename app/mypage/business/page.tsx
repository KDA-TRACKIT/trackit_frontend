"use client";
// 비즈니스 프로필 전환: 전략 판매 약관 두 개에 동의하면 전환 (지금은 화면만, 판매자 API 연결 전)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMypage } from "../context";
import { Card, Modal, PageHead } from "../ui";
import { SELLER_TERMS_VERSION, saveBusiness, useBusiness } from "./state";

const TERMS = [
  { key: "sale", title: "전략 판매 이용약관에 동의 (필수)", desc: "판매자는 판매 권한이 있는 전략을 등록하고,\n구매자가 확인할 수 있도록 전략 내용과 이용 조건을 안내합니다." },
  { key: "settle", title: "판매 대금 정산 약관에 동의 (필수)", desc: "판매 대금의 정산 기준과 지급 절차,\n환불 시 정산 금액이 조정될 수 있음을 확인합니다." },
] as const;

export default function BusinessPage() {
  const { user } = useMypage();
  const router = useRouter();
  const business = useBusiness(user.id);
  const [step, setStep] = useState<"none" | "terms" | "done">("none");
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const all = TERMS.every((t) => agreed[t.key]);

  function convert() {
    saveBusiness(user.id, { termsVersion: SELLER_TERMS_VERSION, acceptedAt: new Date().toISOString() });
    setStep("done");
  }

  return (
    <>
      <PageHead title="비즈니스 프로필 전환" />
      <Card title="전략 판매">
        {business ? (
          <div className="mp-callout ok">
            <strong>비즈니스 프로필 사용 중</strong>
            <p>약관 동의 {new Date(business.acceptedAt).toLocaleDateString("ko-KR")} · 버전 {business.termsVersion}</p>
          </div>
        ) : (
          <div className="mp-callout">
            <strong>개인 프로필 → 비즈니스 프로필</strong>
            <ul>
              <li>전략 등록·판매</li>
              <li>판매 내역, 정산 내역 확인</li>
            </ul>
          </div>
        )}
      </Card>
      <div className="mp-actions">
        <button type="button" className="mp-btn" onClick={() => router.push("/mypage")}>
          {business ? "돌아가기" : "취소"}
        </button>
        {business ? (
          <button type="button" className="mp-btn primary" onClick={() => router.push("/mypage/sales")}>
            판매 관리로
          </button>
        ) : (
          <button type="button" className="mp-btn primary" onClick={() => setStep("terms")}>
            판매 약관 확인
          </button>
        )}
      </div>

      {step === "terms" && (
        <Modal label="전략 판매 약관 동의" onClose={() => setStep("none")}>
          <h2>전략 판매 약관 동의</h2>

          <div className="mp-terms">
            <label className="all">
              <input type="checkbox" checked={all} onChange={(e) => setAgreed(Object.fromEntries(TERMS.map((t) => [t.key, e.target.checked])))} />
              <strong>필수 약관에 모두 동의</strong>
            </label>
            {TERMS.map((t) => (
              <label key={t.key}>
                <input type="checkbox" checked={!!agreed[t.key]} onChange={(e) => setAgreed({ ...agreed, [t.key]: e.target.checked })} />
                <span>
                  <strong>{t.title}</strong>
                  <small style={{ whiteSpace: "pre-line" }}>{t.desc}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="mp-actions">
            <button type="button" className="mp-btn" onClick={() => setStep("none")}>
              취소
            </button>
            <button type="button" className="mp-btn primary" disabled={!all} onClick={convert}>
              동의하고 전환
            </button>
          </div>
        </Modal>
      )}
      {step === "done" && (
        <Modal label="전환 완료" onClose={() => setStep("none")}>
          <h2>비즈니스 프로필로 전환했어요</h2>
          <p>판매 관리에서 전략을 등록할 수 있어요.</p>
          <div className="mp-actions">
            <button type="button" className="mp-btn primary" style={{ minWidth: 88 }} onClick={() => setStep("none")}>
              닫기
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
