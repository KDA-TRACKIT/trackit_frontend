"use client";

import Link from "next/link";
import SiteHeader from "../SiteHeader";
import { FormEvent, useState } from "react";
import { getSupabaseBrowser } from "../../lib/supabase-browser";
import { API_URL } from "../../lib/api/client";
import { GoogleIcon, applyStashedProfile, startGoogle } from "../auth-ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok || !body?.data?.session) throw new Error(body?.error?.message ?? "로그인에 실패했습니다.");
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인해주세요.");
      const { error: sessionError } = await supabase.auth.setSession(body.data.session);
      if (sessionError) throw sessionError;
      await applyStashedProfile(email); // 메일 확인 뒤 첫 로그인이면 가입 때 적은 이름·성별·생년월일을 넣는다
      window.location.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");
    try {
      await startGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google 로그인에 실패했습니다.");
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <SiteHeader />
      <section className="login-panel">
        <div className="login-wordmark brand">TRACKIT</div>
        <form onSubmit={handleLogin}>
          <label>
            <span>ID</span>
            <input suppressHydrationWarning type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label>
            <span>PASSWORD</span>
            <input suppressHydrationWarning type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button className="login-submit" disabled={loading}>
            {loading ? "처리 중..." : "로그인"}
          </button>
        </form>
        <div className="or-divider">
          <span />
          또는
          <span />
        </div>
        <button className="google-login" onClick={handleGoogleLogin} disabled={loading}>
          <span className="google-icon">
            <GoogleIcon size={28} />
          </span>
          <strong>Google 계정으로 로그인</strong>
          <span className="login-arrow">›</span>
        </button>
        <div className="login-links">
          <Link href="/find-id">아이디 찾기</Link>
          <Link href="/reset-password">비밀번호 찾기</Link>
          <Link href="/signup">회원가입</Link>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </section>
    </main>
  );
}
