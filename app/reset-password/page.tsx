"use client";
// 비밀번호 찾기: 아이디(이메일)로 재설정 메일을 보낸다. 메일 링크 → /auth/reset 에서 새 비밀번호 입력
import Link from "next/link";
import { FormEvent, useState } from "react";
import SiteHeader from "../SiteHeader";
import { requestPasswordReset } from "../../lib/api/auth";
import { errorMessage } from "../../lib/api/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
    setLoading(false);
  }

  return (
    <main className="login-page">
      <SiteHeader />
      <section className="login-panel">
        <div className="login-wordmark">비밀번호 찾기</div>
        {sent ? (
          <div className="auth-done">
            <p>
              <strong>{email.trim()}</strong> 이 가입된 아이디라면 비밀번호 재설정 메일이 갔어요.
            </p>
            <p>메일의 링크를 눌러 새 비밀번호를 정해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>
              <span>ID (이메일)</span>
              <input suppressHydrationWarning type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <button className="login-submit" disabled={loading}>
              {loading ? "보내는 중..." : "재설정 메일 받기"}
            </button>
          </form>
        )}
        {error && <p className="auth-error">{error}</p>}
        <div className="login-links">
          <Link href="/login">로그인</Link>
          <Link href="/find-id">아이디 찾기</Link>
          <Link href="/signup">회원가입</Link>
        </div>
      </section>
    </main>
  );
}
