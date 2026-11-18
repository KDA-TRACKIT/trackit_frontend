"use client";
// 계정 설정 모달 (시안 2026-11-18): 이메일 변경 · 비밀번호 변경 · 계정 연동 관리
// Supabase Auth 에 본인 세션으로 직접 요청 (anon key 만). 이메일 변경은 새 주소로 간 6자리 인증번호로 확인
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import { updatePassword } from "../../../lib/api/auth";
import { Modal } from "../ui";

type Note = { ok: boolean; msg: string } | null;

function Head({ title, desc, onClose }: { title: string; desc: string; onClose: () => void }) {
  return (
    <div className="mp-modal-head">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <button type="button" className="mp-x" aria-label="닫기" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function EmailModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!sentAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);
  const left = sentAt ? Math.max(0, 180 - Math.floor((now - sentAt) / 1000)) : 0;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function request() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !valid) return;
    if (email.trim() === user.email) return setNote({ ok: false, msg: "지금 쓰는 이메일과 같아요." });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setBusy(false);
    if (error) return setNote({ ok: false, msg: error.message });
    setSentAt(Date.now());
    setNow(Date.now());
    setNote({ ok: true, msg: "인증번호를 보냈어요. 메일함을 확인해 주세요." });
  }

  async function confirm() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email_change" });
    setBusy(false);
    if (error) return setNote({ ok: false, msg: "인증번호가 맞지 않거나 시간이 지났어요." });
    setNote({ ok: true, msg: "이메일을 바꿨어요" });
    setTimeout(onClose, 800);
  }

  return (
    <Modal label="이메일 변경" onClose={onClose}>
      <div className="mp-acc-modal">
        <Head title="이메일 변경" desc="새 이메일로 인증번호를 받아 인증하면 변경이 완료돼요." onClose={onClose} />
        <label className="mp-field">
          <span>현재 이메일</span>
          <input value={user.email ?? ""} readOnly />
        </label>
        <div className="mp-field">
          <span>변경할 이메일</span>
          <div className="mp-inline">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="변경할 이메일을 입력하세요" autoComplete="email" />
            <button type="button" className="mp-btn secondary" onClick={() => void request()} disabled={!valid || busy || (left > 150)}>
              인증요청
            </button>
          </div>
        </div>
        <div className="mp-field">
          <span>인증번호</span>
          <div className="mp-with-timer">
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="인증번호 6자리를 입력하세요" disabled={!sentAt} />
            {sentAt && <b>{`${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}</b>}
          </div>
          <small>
            인증번호가 오지 않았나요?{" "}
            <button type="button" className="mp-underline" onClick={() => void request()} disabled={!sentAt || busy}>
              재전송
            </button>
          </small>
        </div>
        {note && <p className={note.ok ? "mp-notice ok" : "mp-notice err"}>{note.msg}</p>}
        <div className="mp-actions full">
          <button type="button" className="mp-btn soft" onClick={onClose}>
            취소
          </button>
          <button type="button" className="mp-btn primary" onClick={() => void confirm()} disabled={code.length !== 6 || !left || busy}>
            변경하기
          </button>
        </div>
      </div>
    </Modal>
  );
}

const RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,20}$/;

function Secret({ value, onChange, placeholder, auto }: { value: string; onChange: (v: string) => void; placeholder: string; auto: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mp-with-eye">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={auto} />
      <button type="button" aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShow((v) => !v)}>
        <svg viewBox="0 0 20 20" aria-hidden>
          <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
          <circle cx="10" cy="10" r="2.4" />
          {!show && <path d="M3 3l14 14" />}
        </svg>
      </button>
    </div>
  );
}

export function PasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const hasPassword = (user.identities ?? []).some((i) => i.provider === "email");

  async function save() {
    setNote(null);
    if (!RULE.test(pw.next)) return setNote({ ok: false, msg: "영문·숫자·특수문자를 포함해 8~20자로 입력해 주세요." });
    if (pw.next !== pw.confirm) return setNote({ ok: false, msg: "새 비밀번호가 서로 달라요." });
    const supabase = getSupabaseBrowser();
    if (!supabase || !user.email) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pw.current });
      if (error) throw new Error("현재 비밀번호가 맞지 않아요.");
      await updatePassword(pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setNote({ ok: true, msg: "비밀번호를 바꿨어요" });
      setTimeout(onClose, 800);
    } catch (err) {
      setNote({ ok: false, msg: err instanceof Error ? err.message : "바꾸지 못했어요." });
    }
    setBusy(false);
  }

  return (
    <Modal label="비밀번호 변경" onClose={onClose}>
      <div className="mp-acc-modal">
        <Head title="비밀번호 변경" desc="현재 비밀번호를 확인한 뒤 새 비밀번호로 변경해요." onClose={onClose} />
        {hasPassword ? (
          <>
            <label className="mp-field">
              <span>현재 비밀번호</span>
              <Secret value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} placeholder="현재 비밀번호를 입력하세요" auto="current-password" />
            </label>
            <label className="mp-field">
              <span>변경할 비밀번호</span>
              <Secret value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} placeholder="새 비밀번호를 입력하세요" auto="new-password" />
              <small>영문·숫자·특수문자를 포함해 8~20자로 입력해 주세요.</small>
            </label>
            <label className="mp-field">
              <span>비밀번호 확인</span>
              <Secret value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} placeholder="새 비밀번호를 한 번 더 입력하세요" auto="new-password" />
            </label>
          </>
        ) : (
          <p className="mp-muted">Google로 가입한 계정은 비밀번호가 없어요.</p>
        )}
        {note && <p className={note.ok ? "mp-notice ok" : "mp-notice err"}>{note.msg}</p>}
        <div className="mp-actions full">
          <button type="button" className="mp-btn soft" onClick={onClose}>
            취소
          </button>
          <button type="button" className="mp-btn primary" onClick={() => void save()} disabled={!hasPassword || busy || !pw.current || !pw.next || !pw.confirm}>
            {busy ? "변경 중…" : "변경하기"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function LinkModal({ user, handle, onClose }: { user: User; handle: string; onClose: () => void }) {
  const ids = user.identities ?? [];
  const google = ids.find((i) => i.provider === "google");
  const hasPassword = ids.some((i) => i.provider === "email");
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const linkedAt = google?.created_at ? new Date(google.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\.\s?/g, ".").replace(/\.$/, "") : "";
  const gEmail = (google?.identity_data as { email?: string } | undefined)?.email;

  async function link() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) {
      setBusy(false);
      setNote({ ok: false, msg: `Google 연결을 시작하지 못했어요: ${error.message}` });
    }
  }

  async function unlink() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !google) return;
    if (!hasPassword) return setNote({ ok: false, msg: "로그인할 다른 방법이 없어서 연결을 해제할 수 없어요." });
    if (!window.confirm("Google 연결을 해제할까요? 다음부터는 아이디·비밀번호로 로그인해요.")) return;
    setBusy(true);
    const { error } = await supabase.auth.unlinkIdentity(google);
    setBusy(false);
    setNote(error ? { ok: false, msg: error.message } : { ok: true, msg: "연결을 해제했어요" });
  }

  return (
    <Modal label="계정 연동 관리" onClose={onClose}>
      <div className="mp-acc-modal">
        <Head title="계정 연동 관리" desc="현재 로그인 방식과 연결된 소셜 계정을 확인할 수 있어요." onClose={onClose} />
        <div className="mp-field">
          <span>현재 로그인 방식</span>
          <div className="mp-login-card">
            <i className="mp-login-ico" aria-hidden>
              <svg viewBox="0 0 20 20">
                <circle cx="10" cy="7" r="3.2" />
                <path d="M3.5 17c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
              </svg>
            </i>
            <div>
              <strong>
                {hasPassword ? "일반 계정" : "Google 계정"} <em className="mp-chip-tag">{hasPassword ? "ID·비밀번호" : "Google"}</em>
              </strong>
              <small>
                아이디 {handle} · {user.email}
              </small>
            </div>
          </div>
        </div>
        <div className="mp-field">
          <span>소셜 계정 연동</span>
          <div className="mp-login-card line">
            <i className="mp-login-ico g" aria-hidden>
              G
            </i>
            <div>
              <strong>
                Google <em className={google ? "mp-status" : "mp-chip-tag off"}>{google ? "연결됨" : "연결 안 됨"}</em>
              </strong>
              <small>{google ? `${gEmail ?? ""}${linkedAt ? ` · ${linkedAt} 연결` : ""}` : "아직 연결된 Google 계정이 없어요."}</small>
            </div>
            {google && !hasPassword ? (
              <small className="mp-muted" title="다른 로그인 방법이 없어 해제할 수 없어요">
                기본 로그인
              </small>
            ) : google ? (
              <button type="button" className="mp-unlink" onClick={() => void unlink()} disabled={busy}>
                연결 해제
              </button>
            ) : (
              <button type="button" className="mp-btn primary small" onClick={() => void link()} disabled={busy}>
                연결하기
              </button>
            )}
          </div>
        </div>
        {!google && <p className="mp-info">ⓘ Google 계정을 연결하면 다음부터 아이디·비밀번호 없이 Google로 로그인할 수 있어요.</p>}
        {note && <p className={note.ok ? "mp-notice ok" : "mp-notice err"}>{note.msg}</p>}
        <button type="button" className="mp-btn soft wide" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  );
}
