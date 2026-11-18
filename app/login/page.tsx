"use client";

import Link from "next/link";
import AuthHeader from "../AuthHeader";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "../../lib/supabase-browser";
import { API_URL } from "../../lib/api/client";
import { GoogleIcon, applyStashedProfile, startGoogle } from "../auth-ui";
import { FindModal } from "../auth-forms";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  /** 아이디 또는 이메일 */
  const [email, setEmail] = useState("");
  // 아이디 · 비밀번호 찾기 모달 (/login?find=id|pw 로 바로 열 수도)
  const [find, setFind] = useState<"id" | "pw" | null>(null);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("find");
    // 주소의 ?find= 는 브라우저에서만 읽을 수 있어 첫 렌더 뒤에 한 번 연다 (서버 렌더와 어긋나지 않게)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f === "id" || f === "pw") setFind(f);
  }, []);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emptyMessage = (message: string) => (event: FormEvent<HTMLInputElement>) => {
    event.currentTarget.setCustomValidity(event.currentTarget.value ? "" : message);
  };
  const clearMessage = (event: FormEvent<HTMLInputElement>) => {
    event.currentTarget.setCustomValidity("");
  };

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: email, identifier: email, password }),
      });
      const body = await response.json();
      if (!response.ok || !body?.data?.session) throw new Error(body?.error?.message ?? "로그인에 실패했습니다.");
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인해주세요.");
      const { error: sessionError } = await supabase.auth.setSession(body.data.session);
      if (sessionError) throw sessionError;
      await applyStashedProfile(body.data.user?.email ?? email); // 메일 확인 뒤 첫 로그인이면 가입 때 적은 이름·성별·생년월일을 넣는다
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
    <main className="login-page auth-design">
      <AuthHeader />
      <section className="login-panel">
        <h1 className="login-wordmark">TRACKIT</h1>
        <form onSubmit={handleLogin} className={error ? "has-error" : undefined}>
          <label>
            <span>ID</span>
            <input suppressHydrationWarning type="text" placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} onInvalid={emptyMessage("아이디를 입력하세요.")} onInput={clearMessage} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </label>
          <label>
            <span>PASSWORD</span>
            <input suppressHydrationWarning type={showPw ? "text" : "password"} placeholder=" " value={password} onChange={(e) => setPassword(e.target.value)} onInvalid={emptyMessage("비밀번호를 입력하세요.")} onInput={clearMessage} autoComplete="current-password" required aria-invalid={!!error} aria-describedby="login-error" />
            {password && (
              <button type="button" className="login-eye" onClick={() => setShowPw((value) => !value)} aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"} aria-pressed={showPw}>
                {showPw ? <Eye size={22} strokeWidth={1.8} /> : <EyeOff size={22} strokeWidth={1.8} />}
              </button>
            )}
          </label>
          <p id="login-error" className="login-error" role="alert">{error}</p>
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
          <img className="login-arrow" src="/auth/chevron.svg" alt="" />
        </button>
        <div className="login-links">
          <button type="button" onClick={() => setFind("id")}>
            아이디 찾기
          </button>
          <button type="button" onClick={() => setFind("pw")}>
            비밀번호 찾기
          </button>
        </div>
        <p className="login-signup">
          계정이 없으신가요? <Link href="/signup">회원가입</Link>
        </p>
      </section>
      {find && <FindModal key={find} kind={find} onKind={setFind} onClose={() => setFind(null)} />}
    </main>
  );
}
