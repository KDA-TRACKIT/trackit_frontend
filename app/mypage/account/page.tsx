"use client";
// 계정 설정 (시안 2026-11-18): 기본 계정 정보(이메일 · 비밀번호 · 계정 연동 → 모달) · 개인정보 및 공개 설정 + 화면 테마
// 증권사 연결은 내 계좌 화면으로 옮김
import Link from "next/link";
import { useState } from "react";
import { metaText, useMypage } from "../context";
import { Card, Notice, PageHead } from "../ui";
import { readPrivacy, type Privacy } from "./privacy/privacy";
import { EmailModal, LinkModal, PasswordModal } from "./AccountModals";

export default function AccountPage() {
  const { user, meta, saveMeta } = useMypage();
  const providers = (user.identities ?? []).map((i) => i.provider);
  const [privacy, setPrivacy] = useState(() => readPrivacy(meta));
  const [modal, setModal] = useState<"email" | "password" | "link" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const handle = metaText(meta, "handle") || user.email?.split("@")[0] || "";

  async function toggle(key: "trustConsent" | "notifications") {
    const next: Privacy = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next);
    setBusy(true);
    try {
      await saveMeta({ privacy: next });
      setNote({ ok: true, msg: "저장했어요" });
    } catch (err) {
      setPrivacy(privacy);
      setNote({ ok: false, msg: err instanceof Error ? err.message : "저장하지 못했어요." });
    }
    setBusy(false);
  }

  const btn = (label: string, onClick: () => void) => (
    <button type="button" className="mp-btn secondary small" onClick={onClick}>
      {label}
    </button>
  );
  const linked = providers.includes("google") ? "Google 연결됨" : "Google 미연결";

  return (
    <>
      <PageHead title="계정 설정" desc="계정 정보와 개인정보 공개 범위를 관리하세요." />
      <Card title="기본 계정 정보" desc="회원가입에 사용한 계정 정보와 보안 설정">
        <div className="mp-set-list">
          <div>
            <strong>이메일</strong>
            <span>{user.email ?? "등록된 이메일 없음"}</span>
            {btn("변경", () => setModal("email"))}
          </div>
          <div>
            <strong>비밀번호</strong>
            <span>{providers.includes("email") ? "변경 가능" : "없음 (소셜 로그인)"}</span>
            {btn("변경", () => setModal("password"))}
          </div>
          <div>
            <strong>계정 연동</strong>
            <span>
              {providers.includes("email") ? "일반 계정" : "Google 계정"} · {linked}
            </span>
            {btn("관리", () => setModal("link"))}
          </div>
        </div>
      </Card>
      <Card title="개인정보 및 공개 설정" desc="프로필 노출, 전략 공개, 알림 설정을 관리합니다.">
        <div className="mp-set-list">
          <div>
            <strong>개인정보 공개 설정</strong>
            <span>공개 정보 관리</span>
            <Link className="mp-btn secondary small" href="/mypage/account/privacy">
              변경
            </Link>
          </div>
          <div>
            <strong>신뢰도 점수 활용 동의</strong>
            <span>별도 동의 및 철회</span>
            <button type="button" role="switch" className="mp-switch" aria-checked={privacy.trustConsent} aria-label="신뢰도 점수 활용 동의" disabled={busy} onClick={() => void toggle("trustConsent")} />
          </div>
          <div>
            <strong>서비스 알림</strong>
            <span>활동 및 판매 관련 알림</span>
            <button type="button" role="switch" className="mp-switch" aria-checked={privacy.notifications} aria-label="서비스 알림" disabled={busy} onClick={() => void toggle("notifications")} />
          </div>
        </div>
        <Notice text={note} />
      </Card>
      {modal === "email" && <EmailModal user={user} onClose={() => setModal(null)} />}
      {modal === "password" && <PasswordModal user={user} onClose={() => setModal(null)} />}
      {modal === "link" && <LinkModal user={user} handle={handle} onClose={() => setModal(null)} />}
    </>
  );
}
