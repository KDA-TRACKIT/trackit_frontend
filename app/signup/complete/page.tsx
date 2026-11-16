"use client";
// Google 가입 마무리: 처음 Google 로 들어온 사용자에게 닉네임 · 생년월일 · 성별과 필수 약관 동의를 받는다
// Google 에서 받은 이메일·이름은 다시 묻지 않는다. 값은 Supabase user_metadata 에 본인 세션으로 저장
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import SiteHeader from "../../SiteHeader";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";

const TERMS_VERSION = "2026-11";

export default function SignupCompletePage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [birth, setBirth] = useState({ y: "", m: "", d: "" });
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [terms, setTerms] = useState({ service: false, privacy: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSupabaseBrowser()
      ?.auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user ?? null;
        setUser(u);
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        if (typeof meta.nickname === "string") setNickname(meta.nickname);
      });
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const y = Number(birth.y);
    const m = Number(birth.m);
    const d = Number(birth.d);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (!(y > 1900 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && date.getTime() < Date.now())) return setError("생년월일을 확인해 주세요.");
    if (!gender) return setError("성별을 선택해 주세요.");
    if (!terms.service || !terms.privacy) return setError("필수 약관에 동의해 주세요.");
    setLoading(true);
    setError("");
    const birthdate = date.toISOString().slice(0, 10);
    const { error: err } = (await getSupabaseBrowser()?.auth.updateUser({
      data: { nickname: nickname.trim(), birthdate, gender, signup_completed: true, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
    })) ?? { error: null };
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    window.location.replace("/onboarding");
  }

  const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);

  return (
    <main className="auth-page">
      <SiteHeader />
      <section className="signup-complete">
        {user === undefined ? (
          <p className="mp-muted">불러오는 중…</p>
        ) : !user ? (
          <p className="auth-done">
            로그인 정보가 없어요. <Link href="/signup">회원가입</Link>으로 돌아가 주세요.
          </p>
        ) : (
          <>
            <div className="google-linked">
              <span aria-hidden>✓</span>
              <div>
                <strong>Google 계정이 연결되었습니다</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <h1>TRAKIT 가입 마무리</h1>
            <p>처음 방문하셨군요. 서비스에서 사용할 정보를 입력해주세요.</p>
            <form onSubmit={submit}>
              <label className="field">
                <span>닉네임 *</span>
                <input suppressHydrationWarning value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="사용할 닉네임을 입력해주세요" maxLength={20} required />
              </label>
              <div className="field">
                <span>생년월일 *</span>
                <div className="birth">
                  <input suppressHydrationWarning inputMode="numeric" value={birth.y} onChange={(e) => setBirth({ ...birth, y: digits(e.target.value, 4) })} placeholder="YYYY" aria-label="태어난 해" required />/
                  <input suppressHydrationWarning inputMode="numeric" value={birth.m} onChange={(e) => setBirth({ ...birth, m: digits(e.target.value, 2) })} placeholder="MM" aria-label="태어난 달" required />/
                  <input suppressHydrationWarning inputMode="numeric" value={birth.d} onChange={(e) => setBirth({ ...birth, d: digits(e.target.value, 2) })} placeholder="DD" aria-label="태어난 날" required />
                </div>
              </div>
              <div className="gender" role="radiogroup" aria-label="성별">
                <span>
                  성별 <i>*</i>
                </span>
                <label>
                  <input type="radio" name="gender" checked={gender === "male"} onChange={() => setGender("male")} /> 남성
                </label>
                <label>
                  <input type="radio" name="gender" checked={gender === "female"} onChange={() => setGender("female")} /> 여성
                </label>
              </div>
              <div className="terms">
                <label>
                  <input type="checkbox" checked={terms.service} onChange={(e) => setTerms({ ...terms, service: e.target.checked })} /> [필수] 서비스 이용약관에 동의합니다.
                </label>
                <label>
                  <input type="checkbox" checked={terms.privacy} onChange={(e) => setTerms({ ...terms, privacy: e.target.checked })} /> [필수] 개인정보 수집 및 이용에 동의합니다.
                </label>
                <small>Google에서 받은 이메일·이름은 다시 입력할 필요가 없습니다.</small>
              </div>
              <button className="signup-submit big" disabled={loading}>
                {loading ? "처리 중..." : "가입 완료하고 프로필 설정하기 →"}
              </button>
            </form>
            {error && <p className="auth-error">{error}</p>}
          </>
        )}
      </section>
    </main>
  );
}
