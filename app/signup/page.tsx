"use client";
// 회원가입 첫 화면: 일반 회원가입 / Google 계정으로 가입 고르기
import Link from "next/link";
import { useState } from "react";
import AuthHeader from "../AuthHeader";
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
    <main className="auth-page auth-design">
      <AuthHeader title="회원가입" login />
      <section className="auth-panel signup-choice">
        <h1>회원가입</h1>
        <p>원하는 방법으로 TRACKIT에 가입하세요.</p>
        <Link className="auth-button primary" href="/signup/email">
          <span className="signup-person" aria-hidden="true"><img src="/auth/person-head.svg" alt="" /><img src="/auth/person-body.svg" alt="" /></span>
          <strong>일반 회원가입</strong>
          <img className="arrow" src="/auth/chevron.svg" alt="" />
        </Link>
        <button type="button" className="auth-button google" onClick={() => void google()} disabled={loading}>
          <span className="google-icon">
            <GoogleIcon size={30} />
          </span>
          <strong>Google 계정으로 가입</strong>
          <img className="arrow" src="/auth/chevron.svg" alt="" />
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
