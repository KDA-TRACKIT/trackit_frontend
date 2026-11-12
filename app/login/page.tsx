"use client";

import SiteHeader from "../SiteHeader";
import { FormEvent, useState } from "react";
import { getSupabaseBrowser } from "../../lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok || !body?.data?.session) throw new Error(body?.error?.message ?? "로그인에 실패했습니다.");
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인해주세요.");
      const { error: sessionError } = await supabase.auth.setSession(body.data.session);
      if (sessionError) throw sessionError;
      window.location.replace("/");
    } catch (e) { setError(e instanceof Error ? e.message : "로그인에 실패했습니다."); setLoading(false); }
  }

  async function handleGoogleLogin() {
    setLoading(true); setError("");
    try { const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"; const response = await fetch(`${apiUrl}/api/v1/auth/oauth/google`); const body = await response.json(); if (!response.ok || !body?.data?.authorizationUrl) throw new Error(body?.error?.message ?? "Google 로그인 준비에 실패했습니다."); window.location.assign(body.data.authorizationUrl); }
    catch (e) { setError(e instanceof Error ? e.message : "Google 로그인에 실패했습니다."); setLoading(false); }
  }

  return <main className="login-page"><SiteHeader /><section className="login-panel"><div className="login-wordmark">TRACKIT</div><form onSubmit={handleLogin}><label><span>ID</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label><label><span>PASSWORD</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label><button className="login-submit" disabled={loading}>{loading ? "처리 중..." : "로그인"}</button></form><div className="or-divider"><span />또는<span /></div><button className="google-login" onClick={handleGoogleLogin} disabled={loading}><span className="google-icon">G</span><strong>Google 계정으로 로그인</strong><span className="login-arrow">›</span></button><div className="login-links"><a href="#">아이디 찾기</a><a href="#">비밀번호 찾기</a><a href="#">회원가입</a></div>{error && <p className="auth-error">{error}</p>}</section></main>;
}

