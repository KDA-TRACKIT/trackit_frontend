"use client";
// 아이디 찾기: 가입 때 쓴 닉네임으로 아이디(이메일)를 찾는다. 이메일은 가운데를 가려서 보여 준다
import Link from "next/link";
import { FormEvent, useState } from "react";
import SiteHeader from "../SiteHeader";
import { findId } from "../../lib/api/auth";
import { errorMessage } from "../../lib/api/client";

export default function FindIdPage() {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emails, setEmails] = useState<string[] | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      setEmails(await findId(nickname.trim()));
    } catch (e) {
      setError(errorMessage(e));
    }
    setLoading(false);
  }

  return (
    <main className="login-page">
      <SiteHeader />
      <section className="login-panel">
        <div className="login-wordmark">아이디 찾기</div>
        <form onSubmit={submit}>
          <label>
            <span>가입할 때 쓴 닉네임</span>
            <input suppressHydrationWarning value={nickname} onChange={(e) => setNickname(e.target.value)} required />
          </label>
          <button className="login-submit" disabled={loading}>
            {loading ? "찾는 중..." : "아이디 찾기"}
          </button>
        </form>
        {emails && (
          <div className="auth-done">
            {emails.length ? (
              <>
                <p>이 닉네임으로 가입한 아이디예요.</p>
                <ul className="auth-id-list">
                  {emails.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>이 닉네임으로 가입한 아이디가 없어요. Google 로 가입했다면 Google 계정으로 로그인해 주세요.</p>
            )}
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}
        <div className="login-links">
          <Link href="/login">로그인</Link>
          <Link href="/reset-password">비밀번호 찾기</Link>
          <Link href="/signup">회원가입</Link>
        </div>
      </section>
    </main>
  );
}
