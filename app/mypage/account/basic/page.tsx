"use client";
// 기본 계정 정보 수정: 이메일 변경(인증 메일) · 비밀번호 변경 · 계정 연동 상태
// Supabase Auth 에 본인 세션으로 직접 요청한다 (anon key 만 사용)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "../../../../lib/supabase-browser";
import { updatePassword } from "../../../../lib/api/auth";
import { useMypage } from "../../context";
import { Card, Notice, PageHead } from "../../ui";

type Note = { ok: boolean; msg: string } | null;
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function AccountBasicPage() {
  const { user } = useMypage();
  const router = useRouter();
  const providers = (user.identities ?? []).map((i) => i.provider);
  const hasPassword = providers.includes("email");
  const google = providers.includes("google");

  const [email, setEmail] = useState(user.email ?? "");
  const [emailNote, setEmailNote] = useState<Note>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  async function changeEmail() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    if (email.trim() === user.email) return setEmailNote({ ok: false, msg: "지금 쓰는 이메일과 같아요." });
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setEmailNote(error ? { ok: false, msg: error.message } : { ok: true, msg: "인증 메일을 보냈어요. 메일의 링크를 누르면 바뀌어요" });
  }

  async function save() {
    setNote(null);
    if (!pw.current && !pw.next && !pw.confirm) return router.push("/mypage/account");
    if (!PASSWORD_RULE.test(pw.next)) return setNote({ ok: false, msg: "새 비밀번호는 영문·숫자·특수문자를 섞어 8자 이상이어야 해요." });
    if (pw.next !== pw.confirm) return setNote({ ok: false, msg: "새 비밀번호가 서로 달라요." });
    const supabase = getSupabaseBrowser();
    if (!supabase || !user.email) return;
    setBusy(true);
    try {
      // 현재 비밀번호 확인
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pw.current });
      if (error) throw new Error("현재 비밀번호가 맞지 않아요.");
      await updatePassword(pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setNote({ ok: true, msg: "비밀번호를 바꿨어요" });
    } catch (err) {
      setNote({ ok: false, msg: err instanceof Error ? err.message : "바꾸지 못했어요." });
    }
    setBusy(false);
  }

  async function linkGoogle() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) setNote({ ok: false, msg: `Google 연결을 시작하지 못했어요: ${error.message}` });
  }

  return (
    <>
      <PageHead title="기본 계정 정보" />
      <Card>
        <div className="mp-form">
          <div className="mp-field">
            <span>이메일</span>
            <div className="mp-row-2" style={{ alignItems: "center" }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" autoComplete="email" />
              <div>
                <button type="button" className="mp-btn" onClick={() => void changeEmail()}>
                  인증 메일 받기
                </button>
              </div>
            </div>
            <Notice text={emailNote} />
          </div>
          <div className="mp-sep" />
          <strong style={{ fontSize: 15, fontWeight: 600 }}>비밀번호 변경</strong>
          {hasPassword ? (
            <div className="mp-row-2">
              <label className="mp-field">
                <span>현재 비밀번호</span>
                <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
              </label>
              <label className="mp-field">
                <span>새 비밀번호</span>
                <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="영문, 숫자, 특수문자 포함 8자 이상" autoComplete="new-password" />
              </label>
              <span />
              <label className="mp-field">
                <span>새 비밀번호 확인</span>
                <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
              </label>
            </div>
          ) : (
            <p className="mp-muted" style={{ margin: "-8px 0 0", fontSize: 12 }}>
              Google로 가입한 계정은 비밀번호가 없어요
            </p>
          )}
          <Notice text={note} />
          <div className="mp-sep" />
          <strong style={{ fontSize: 15, fontWeight: 600 }}>계정 연동</strong>
          <div className="mp-callout" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <strong>Google 계정</strong>
              <p>{google ? "연결됨" : "연결 안 됨"}</p>
            </div>
            <button type="button" className="mp-btn" disabled={google} onClick={() => void linkGoogle()}>
              {google ? "연결됨" : "연결하기"}
            </button>
          </div>
          <div className="mp-actions">
            <button type="button" className="mp-btn" onClick={() => router.push("/mypage/account")} disabled={busy}>
              취소
            </button>
            <button type="button" className="mp-btn primary" onClick={() => void save()} disabled={busy || !pw.current || !pw.next || !pw.confirm}>
              {busy ? "저장 중…" : "비밀번호 변경"}
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}
