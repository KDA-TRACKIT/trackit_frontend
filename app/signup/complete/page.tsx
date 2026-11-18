"use client";
// Google 가입 마무리: 처음 Google 로 들어온 사용자에게 닉네임 · 생년월일 · 성별과 필수 약관 동의를 받는다
// Google 에서 받은 이메일·이름은 다시 묻지 않는다. 값은 Supabase user_metadata 에 본인 세션으로 저장
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import AuthHeader from "../../AuthHeader";
import { startGoogle } from "../../auth-ui";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import { DateField, TERMS_VERSION, TermsChecks } from "../../auth-forms";

export default function SignupCompletePage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [terms, setTerms] = useState({ service: false, privacy: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase.auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user ?? null;
        setUser(u);
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        if (typeof meta.nickname === "string") setNickname(meta.nickname);
      });
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!birthdate) return setError("생년월일을 골라 주세요.");
    if (!gender) return setError("성별을 선택해 주세요.");
    if (!terms.service || !terms.privacy) return setError("필수 약관에 동의해 주세요.");
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase || !user) throw new Error("Google 계정을 먼저 연결해 주세요.");
      const { error: err } = await supabase.auth.updateUser({
        data: { nickname: nickname.trim(), birthdate, gender, signup_completed: true, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
      });
      if (err) throw err;
      window.location.replace("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입 정보를 저장하지 못했습니다.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-design">
      <AuthHeader title="회원가입" />
      <section className="signup-complete">
        {user === undefined && getSupabaseBrowser() ? (
          <p className="mp-muted">불러오는 중…</p>
        ) : !user ? (
          <>
            <h1>Google 계정으로 가입</h1>
            <p>Google 계정을 연결하고 가입을 마무리해 주세요.</p>
            <button type="button" className="google-connect" disabled={loading} onClick={async () => {
              setLoading(true);
              try { await startGoogle(); } catch (err) { setError(err instanceof Error ? err.message : "Google 계정을 연결하지 못했습니다."); setLoading(false); }
            }}>Google 계정 연결하기 →</button>
            <Link href="/signup">다른 방법으로 가입하기</Link>
            {error && <p className="auth-error" role="alert">{error}</p>}
          </>
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
            <form onSubmit={submit} className="signup-complete-form">
              <label className="signup-row">
                <span>
                  닉네임 <i>*</i>
                </span>
                <input suppressHydrationWarning value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임을 입력하세요." maxLength={20} required />
              </label>
              <div className="signup-row">
                <span>
                  생년월일 <i>*</i>
                </span>
                <DateField value={birthdate} onChange={setBirthdate} />
              </div>
              <div className="signup-row">
                <span>
                  성별 <i>*</i>
                </span>
                <div className="signup-radios" role="radiogroup" aria-label="성별">
                  <label>
                    <input type="radio" name="gender" checked={gender === "male"} onChange={() => setGender("male")} /> 남성
                  </label>
                  <label>
                    <input type="radio" name="gender" checked={gender === "female"} onChange={() => setGender("female")} /> 여성
                  </label>
                </div>
              </div>
              <TermsChecks value={terms} onChange={setTerms} />
              <p className="signup-note">Google에서 받은 이메일·이름은 다시 입력할 필요가 없습니다.</p>
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
