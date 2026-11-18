"use client";
// Google 가입 마무리: 처음 Google 로 들어온 사용자에게 닉네임 · 생년월일 · 성별과 필수 약관 동의를 받는다
// Google 에서 받은 이메일·이름은 다시 묻지 않는다. 값은 Supabase user_metadata 에 본인 세션으로 저장
import { apiRequest } from "../../../lib/api/client";
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
        // 다시 들어온 경우(닉네임 · 생년월일 · 성별 중 빠진 게 있을 때) 이미 있는 값은 채워 둠
        if (typeof meta.nickname === "string") setNickname(meta.nickname.slice(0, 8));
        if (typeof meta.birthdate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meta.birthdate)) setBirthdate(meta.birthdate);
        if (meta.gender === "male" || meta.gender === "female") setGender(meta.gender);
        if (meta.terms_version === TERMS_VERSION) setTerms({ service: true, privacy: true });
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
      const returning = user.user_metadata?.signup_completed === true;
      const { error: err } = await supabase.auth.updateUser({
        data: { nickname: nickname.trim(), birthdate, gender, signup_completed: true, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
      });
      if (err) throw err;
      // DB(User)에도 이름 · 닉네임 · 성별 · 생년월일 (예전엔 로그인 정보에만 들어가 DB 이름이 비었음). 이름은 Google 계정 이름
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "");
      await apiRequest("/me", { method: "PATCH", body: JSON.stringify({ nickname: nickname.trim(), gender, birthDate: birthdate, ...(name ? { name: name.trim().slice(0, 50) } : {}) }) });
      // 처음 가입이면 투자 정보 설정으로, 빠진 값만 다시 받은 거면 원래 쓰던 화면(홈)으로
      window.location.replace(returning ? "/" : "/onboarding");
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
            <h1>TRACKIT 가입 마무리</h1>
            <p>처음 방문하셨군요. 서비스에서 사용할 정보를 입력해주세요.</p>
            <form onSubmit={submit} className="signup-complete-form">
              <label className="signup-row">
                <span>
                  닉네임 <i>*</i>
                </span>
                <input suppressHydrationWarning value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임을 입력하세요. (8자 이내)" maxLength={8} required />
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
