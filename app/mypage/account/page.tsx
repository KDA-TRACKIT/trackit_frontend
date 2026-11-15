"use client";
// 계정 설정: 기본 계정 정보 · 개인정보 및 공개 설정 요약 + 증권사 연결
import Link from "next/link";
import { useMypage } from "../context";
import { Card, PageHead } from "../ui";
import BrokerSection from "../BrokerSection";
import { readPrivacy } from "./privacy/privacy";
import ThemeSwitch from "../../ThemeSwitch";

export default function AccountPage() {
  const { user, meta } = useMypage();
  const providers = (user.identities ?? []).map((i) => i.provider);
  const privacy = readPrivacy(meta);
  const setBtn = (href: string) => (
    <Link className="mp-btn small" href={href}>
      변경
    </Link>
  );
  return (
    <>
      <PageHead title="계정 설정" />
      <Card title="기본 계정 정보" action={setBtn("/mypage/account/basic")}>
        <div className="mp-list">
          <div>
            <strong>이메일</strong>
            <span>{user.email ?? "등록된 이메일 없음"}</span>
          </div>
          <div>
            <strong>비밀번호</strong>
            <span>{providers.includes("email") ? "••••••••" : "없음 (소셜 로그인)"}</span>
          </div>
          <div>
            <strong>계정 연동</strong>
            <span>{providers.map((p) => (p === "email" ? "이메일" : p === "google" ? "Google" : p)).join(", ") || "—"}</span>
          </div>
        </div>
      </Card>
      <Card title="개인정보 및 공개 설정" action={setBtn("/mypage/account/privacy")}>
        <div className="mp-list">
          <div style={{ gridTemplateColumns: "256px 1fr" }}>
            <strong>프로필 공개 범위</strong>
            <span>{privacy.profilePublic ? "전체 공개" : "비공개"}</span>
          </div>
          <div style={{ gridTemplateColumns: "256px 1fr" }}>
            <strong>신뢰도 점수 활용 동의</strong>
            <span>{privacy.trustConsent ? "동의함" : "동의 안 함"}</span>
          </div>
          <div style={{ gridTemplateColumns: "256px 1fr" }}>
            <strong>서비스 알림</strong>
            <span>{privacy.notifications ? "받음" : "받지 않음"}</span>
          </div>
        </div>
      </Card>
      <Card title="화면">
        <div className="mp-list">
          <div style={{ gridTemplateColumns: "200px 1fr auto" }}>
            <strong>테마</strong>
            <span />
            <ThemeSwitch className="mp-seg" />
          </div>
        </div>
      </Card>
      <Card>
        <BrokerSection />
      </Card>
    </>
  );
}
