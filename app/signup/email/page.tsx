"use client";
// 일반 회원가입 (2026-11-18 시안). 백엔드에는 아이디 · 이메일 · 비밀번호 · 닉네임을 보내고,
// 이름·성별·생년월일은 Supabase user_metadata 에 넣는다 (세션이 바로 없으면 첫 로그인 때)
import Link from "next/link";
import { FormEvent, useState } from "react";
import SiteHeader from "../../SiteHeader";
import { checkUsername, signUp } from "../../../lib/api/auth";
import { DateField, TERMS_VERSION, TermsChecks } from "../../auth-forms";
import { errorMessage } from "../../../lib/api/client";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import { stashExtraProfile, type ExtraProfile } from "../../auth-ui";

function Eye({ off }: { off: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export default function EmailSignupPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "", name: "", gender: "" as "" | "male" | "female", birthdate: "", nickname: "" });
  const [terms, setTerms] = useState({ service: false, privacy: false });
  /** 아이디 확인 결과 (칸을 떠날 때 서버에 물어봄) */
  const [idCheck, setIdCheck] = useState<{ value: string; ok: boolean; msg: string } | null>(null);
  async function checkId() {
    const u = form.username.trim().toLowerCase();
    if (!u) return setIdCheck(null);
    try {
      const r = await checkUsername(u);
      setIdCheck({ value: u, ok: r.available, msg: !r.valid ? "영문 소문자로 시작하는 영문 소문자 · 숫자 · _ 4~20자로 만들어 주세요." : r.available ? "쓸 수 있는 아이디예요." : "이미 쓰고 있는 아이디예요." });
    } catch {
      setIdCheck(null);
    }
  }
  const [show, setShow] = useState({ password: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[a-z][a-z0-9_]{3,19}$/.test(form.username.trim().toLowerCase())) return setError("아이디는 영문 소문자로 시작하는 영문 소문자 · 숫자 · _ 4~20자예요.");
    if (idCheck && idCheck.value === form.username.trim().toLowerCase() && !idCheck.ok) return setError(idCheck.msg);
    if (form.password.length < 8) return setError("비밀번호는 8자 이상이어야 해요.");
    if (form.password !== form.confirm) return setError("비밀번호가 서로 달라요.");
    if (!form.gender) return setError("성별을 선택해 주세요.");
    if (!form.birthdate) return setError("생년월일을 골라 주세요.");
    if (!terms.service || !terms.privacy) return setError("필수 약관에 동의해 주세요.");
    setLoading(true);
    setError("");
    const email = form.email.trim();
    const extra: ExtraProfile = { name: form.name.trim(), gender: form.gender, birthdate: form.birthdate };
    try {
      const result = await signUp({ email, password: form.password, nickname: form.nickname.trim(), username: form.username.trim().toLowerCase() });
      if (result.loggedIn) {
        await getSupabaseBrowser()?.auth.updateUser({ data: { ...extra, signup_completed: true, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() } });
        return window.location.replace("/onboarding");
      }
      stashExtraProfile(email, extra);
      setSentTo(email);
    } catch (e) {
      setError(errorMessage(e));
    }
    setLoading(false);
  }

  const row = (label: string, input: React.ReactNode) => (
    <label className="signup-row">
      <span>
        {label} <i>*</i>
      </span>
      {input}
    </label>
  );

  return (
    <main className="auth-page">
      <SiteHeader />
      <section className="signup-form">
        <h1>일반 회원가입</h1>
        {sentTo ? (
          <div className="auth-done">
            <p>
              <strong>{sentTo}</strong> 으로 가입 확인 메일을 보냈어요.
            </p>
            <p>메일의 링크를 누른 뒤 로그인하면 가입이 끝나요.</p>
            <Link className="login-submit auth-link-button" href="/login">
              로그인으로
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {row(
              "ID",
              <span>
                <input suppressHydrationWarning value={form.username} onChange={(e) => (set({ username: e.target.value.replace(/\s/g, "") }), setIdCheck(null))} onBlur={() => void checkId()} placeholder="아이디를 입력하세요." autoComplete="username" maxLength={20} required />
                {idCheck && <small className={`signup-hint ${idCheck.ok ? "ok" : "err"}`}>{idCheck.msg}</small>}
              </span>,
            )}
            {row(
              "비밀번호",
              <span className="with-icon">
                <input suppressHydrationWarning type={show.password ? "text" : "password"} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="비밀번호를 입력하세요." autoComplete="new-password" minLength={8} required />
                <button type="button" onClick={() => setShow({ ...show, password: !show.password })} aria-label={show.password ? "비밀번호 숨기기" : "비밀번호 보기"}>
                  <Eye off={!show.password} />
                </button>
              </span>,
            )}
            {row(
              "비밀번호 확인",
              <span className="with-icon">
                <input suppressHydrationWarning type={show.confirm ? "text" : "password"} value={form.confirm} onChange={(e) => set({ confirm: e.target.value })} placeholder="비밀번호를 다시 입력하세요." autoComplete="new-password" required />
                <button type="button" onClick={() => setShow({ ...show, confirm: !show.confirm })} aria-label={show.confirm ? "비밀번호 숨기기" : "비밀번호 보기"}>
                  <Eye off={!show.confirm} />
                </button>
              </span>,
            )}
            {row("이메일", <input suppressHydrationWarning type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="이메일을 입력하세요." autoComplete="email" required />)}
            <div className="signup-row">
              <span>
                성별 <i>*</i>
              </span>
              <div className="signup-radios" role="radiogroup" aria-label="성별">
                <label>
                  <input type="radio" name="gender" checked={form.gender === "male"} onChange={() => set({ gender: "male" })} /> 남성
                </label>
                <label>
                  <input type="radio" name="gender" checked={form.gender === "female"} onChange={() => set({ gender: "female" })} /> 여성
                </label>
              </div>
            </div>
            {row("이름", <input suppressHydrationWarning value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="이름을 입력하세요." autoComplete="name" maxLength={30} required />)}
            {row("생년월일", <DateField value={form.birthdate} onChange={(birthdate) => set({ birthdate })} />)}
            {row("닉네임", <input suppressHydrationWarning value={form.nickname} onChange={(e) => set({ nickname: e.target.value })} placeholder="닉네임을 입력하세요." autoComplete="nickname" maxLength={20} required />)}
            <TermsChecks value={terms} onChange={setTerms} />
            <button className="signup-submit" disabled={loading}>
              {loading ? "처리 중..." : "가입하기"}
            </button>
          </form>
        )}
        {error && <p className="auth-error">{error}</p>}
      </section>
    </main>
  );
}
