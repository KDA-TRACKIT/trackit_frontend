"use client";
// 비밀번호 재설정 메일 링크가 돌아오는 곳: 링크의 세션으로 새 비밀번호를 저장한다
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import SiteHeader from "../../SiteHeader";
import { startRecoverySession, updatePassword } from "../../../lib/api/auth";

export default function AuthResetPage() {
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    startRecoverySession()
      .then((ok) => setState(ok ? "ready" : "invalid"))
      .catch(() => setState("invalid"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setError("비밀번호는 8자 이상이어야 해요.");
    if (password !== confirm) return setError("비밀번호가 서로 달라요.");
    setLoading(true);
    setError("");
    try {
      await updatePassword(password);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "비밀번호를 바꾸지 못했어요.");
    }
    setLoading(false);
  }

  return (
    <main className="login-page">
      <SiteHeader />
      <section className="login-panel">
        <div className="login-wordmark">새 비밀번호</div>
        {state === "checking" && <p className="auth-done">링크를 확인하는 중…</p>}
        {state === "invalid" && (
          <div className="auth-done">
            <p>링크가 만료됐거나 올바르지 않아요. 재설정 메일을 다시 받아 주세요.</p>
            <Link className="login-submit auth-link-button" href="/reset-password">
              재설정 메일 다시 받기
            </Link>
          </div>
        )}
        {state === "done" && (
          <div className="auth-done">
            <p>비밀번호를 바꿨어요. 지금 로그인된 상태예요.</p>
            <Link className="login-submit auth-link-button" href="/">
              홈으로
            </Link>
          </div>
        )}
        {state === "ready" && (
          <form onSubmit={submit}>
            <label>
              <span>새 PASSWORD (8자 이상)</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            <label>
              <span>새 PASSWORD 확인</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            <button className="login-submit" disabled={loading}>
              {loading ? "저장 중..." : "비밀번호 바꾸기"}
            </button>
          </form>
        )}
        {error && <p className="auth-error">{error}</p>}
      </section>
    </main>
  );
}
