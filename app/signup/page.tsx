"use client";
// 회원가입 첫 화면: 일반 회원가입 / Google 계정으로 가입 고르기
import Link from "next/link";
import { useState } from "react";
import SiteHeader from "../SiteHeader";
import { GoogleIcon, startGoogle } from "../auth-ui";

export default function SignupChoicePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function google() {
    setLoading(true);
    setError("");
    try {
      await startGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google 가입을 시작하지 못했습니다.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <SiteHeader />
      <section className="auth-panel signup-choice">
        <h1>회원가입</h1>
        <p>원하는 방법으로 TRACKIT에 가입하세요.</p>
        <Link className="auth-button primary" href="/signup/email">
          <svg className="person-icon" width="40" height="34" viewBox="0 0 40 34" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="14" cy="9" r="7" />
            <path d="M1 33c0-7.5 5.8-13 13-13 4 0 7.4 1.6 9.7 4.2" />
            <path d="M32 22v10M27 27h10" />
          </svg>
          <strong>일반 회원가입</strong>
          <span className="arrow">›</span>
        </Link>
        <button type="button" className="auth-button google" onClick={() => void google()} disabled={loading}>
          <span className="google-icon">
            <GoogleIcon size={30} />
          </span>
          <strong>Google 계정으로 가입</strong>
          <span className="arrow">›</span>
        </button>
        <div className="existing-account">
          <span />
          <span>이미 계정이 있으신가요?</span>
          <Link href="/login">로그인</Link>
          <span />
        </div>
        {error && <p className="auth-error">{error}</p>}
      </section>
    </main>
  );
}
