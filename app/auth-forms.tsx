"use client";
// 로그인 · 회원가입 공통 조각 (2026-11-18 시안): 생년월일 달력, 필수 약관(모달로 읽고 동의), 아이디 · 비밀번호 찾기 모달
import { useEffect, useRef, useState } from "react";
import { findId, requestPasswordReset } from "../lib/api/auth";
import { errorMessage } from "../lib/api/client";
import { startGoogle } from "./auth-ui";

export const TERMS_VERSION = "2026-11";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 생년월일: YYYY. MM. DD 칸 + 달력. 달력 위 "2026년 11월 ▾"를 누르면 연도 · 월 고르기 (12년씩) */
export function DateField({ value, onChange, label = "생년월일" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const today = ymd(new Date());
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"day" | "ym">("day");
  const init = value || "2000-01-01";
  const [view, setView] = useState({ y: Number(init.slice(0, 4)), m: Number(init.slice(5, 7)) - 1 });
  const [pick, setPick] = useState(value);
  const [page, setPage] = useState(() => Math.floor((Number(init.slice(0, 4)) - 1900) / 12));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const show = () => {
    const v = value || "2000-01-01";
    setView({ y: Number(v.slice(0, 4)), m: Number(v.slice(5, 7)) - 1 });
    setPage(Math.floor((Number(v.slice(0, 4)) - 1900) / 12));
    setPick(value);
    setMode("day");
    setOpen(true);
  };
  const first = new Date(view.y, view.m, 1);
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(view.y, view.m, i + 1)))];
  const years = Array.from({ length: 12 }, (_, i) => 1900 + page * 12 + i);
  const thisYear = new Date().getFullYear();
  return (
    <div className="af-date" ref={box}>
      <button type="button" className={value ? "af-date-input" : "af-date-input empty"} onClick={() => (open ? setOpen(false) : show())} aria-label={label} aria-expanded={open}>
        <span>{value ? value.replaceAll("-", ". ") : "YYYY. MM. DD"}</span>
        <svg viewBox="0 0 16 16" aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 7h12" />
        </svg>
      </button>
      {open && (
        <div className="af-cal" role="dialog" aria-label={`${label} 고르기`}>
          {mode === "day" ? (
            <>
              <div className="af-cal-head">
                <button type="button" aria-label="이전 달" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}>
                  ‹
                </button>
                <button type="button" className="af-cal-title" onClick={() => setMode("ym")}>
                  {view.y}년 {view.m + 1}월 <small>▾</small>
                </button>
                <button type="button" aria-label="다음 달" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}>
                  ›
                </button>
              </div>
              <div className="af-cal-grid">
                {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
                  <span key={w} className={`wd${i === 0 ? " sun" : ""}`}>
                    {w}
                  </span>
                ))}
                {cells.map((d, i) =>
                  d ? (
                    <button key={d} type="button" disabled={d > today} className={`${d === pick ? "on" : ""}${i % 7 === 0 ? " sun" : ""}`} onClick={() => setPick(d)}>
                      {Number(d.slice(8))}
                    </button>
                  ) : (
                    <span key={`e${i}`} />
                  ),
                )}
              </div>
            </>
          ) : (
            <>
              <div className="af-cal-head">
                <button type="button" aria-label="이전 12년" onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  ‹
                </button>
                <strong>
                  {years[0]} – {years[11]}
                </strong>
                <button type="button" aria-label="다음 12년" disabled={years[11] >= thisYear} onClick={() => setPage((p) => p + 1)}>
                  ›
                </button>
              </div>
              <p className="af-cal-sec">연도</p>
              <div className="af-cal-pick">
                {years.map((y) => (
                  <button key={y} type="button" disabled={y > thisYear} className={y === view.y ? "on" : ""} onClick={() => setView((v) => ({ ...v, y }))}>
                    {y}
                  </button>
                ))}
              </div>
              <p className="af-cal-sec">월</p>
              <div className="af-cal-pick">
                {Array.from({ length: 12 }, (_, m) => (
                  <button key={m} type="button" className={m === view.m ? "on" : ""} onClick={() => (setView((v) => ({ ...v, m })), setMode("day"))}>
                    {m + 1}월
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="af-cal-actions">
            <button type="button" onClick={() => setOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="primary"
              disabled={mode === "day" && !pick}
              onClick={() => {
                if (mode === "ym") return setMode("day");
                onChange(pick);
                setOpen(false);
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dialog({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="af-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`af-dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="af-dialog-head">
          <div>
            {sub && <small>{sub}</small>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="af-x" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SERVICE_TERMS: [string, string][] = [
  ["제1조 (목적)", '이 약관은 TRACKIT(이하 "회사")이 제공하는 매매 기록·분석 서비스(이하 "서비스")의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임 사항을 정하는 것을 목적으로 합니다.'],
  ["제2조 (정의)", '1. "회원"이란 이 약관에 동의하고 회원가입을 완료하여 서비스를 이용하는 자를 말합니다.\n2. "계정"이란 회원 식별과 서비스 이용을 위해 회원이 설정하거나 Google 등 외부 계정과 연동한 정보를 말합니다.\n3. "게시물"이란 회원이 서비스에 기록하거나 게시한 매매 일지, 전략, 글, 이미지 등을 말합니다.'],
  ["제3조 (약관의 효력 및 변경)", "회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일 7일 전(회원에게 불리한 경우 30일 전)부터 서비스 내 공지합니다. 변경에 동의하지 않는 회원은 이용계약을 해지할 수 있습니다."],
  ["제4조 (회원가입 및 계정 관리)", "회원가입은 이용자가 약관에 동의하고 가입 신청을 하며 회사가 이를 승낙함으로써 성립합니다. 회원은 계정 정보를 정확하게 유지해야 하며, 계정을 다른 사람에게 양도하거나 빌려줄 수 없습니다."],
  ["제5조 (서비스의 성격)", "서비스가 제공하는 기록 · 지표 · AI 정리 · 다른 회원의 전략은 투자 판단을 돕는 참고 정보이며 투자 권유가 아닙니다. 투자 판단과 그 결과의 책임은 회원 본인에게 있습니다."],
  ["제6조 (회원의 의무)", "회원은 다른 회원의 전략이나 게시물을 무단으로 복제 · 재판매하거나, 허위 기록으로 성과를 꾸며서는 안 됩니다."],
  ["제7조 (탈퇴 및 이용 제한)", "회원은 언제든 탈퇴할 수 있으며, 회사는 약관을 위반한 회원의 서비스 이용을 제한할 수 있습니다."],
];

function ServiceTerms() {
  return (
    <div className="af-terms-body">
      <p>TRACKIT 서비스를 이용해 주셔서 감사합니다. 서비스 이용 전 아래 약관을 확인해 주세요.</p>
      {SERVICE_TERMS.map(([h, t]) => (
        <section key={h}>
          <h3>{h}</h3>
          <p style={{ whiteSpace: "pre-line" }}>{t}</p>
        </section>
      ))}
    </div>
  );
}

function PrivacyTerms() {
  return (
    <div className="af-terms-body">
      <p>TRACKIT은 회원가입 및 서비스 제공을 위해 아래와 같이 개인정보를 수집·이용합니다. 내용을 확인하신 후 동의해 주세요.</p>
      <table className="af-terms-table">
        <tbody>
          <tr>
            <th>수집 항목</th>
            <td>아이디, 이메일, 이름, 닉네임, 생년월일, 성별</td>
          </tr>
          <tr>
            <th>수집 목적</th>
            <td>회원 식별, 서비스 제공 및 운영</td>
          </tr>
          <tr>
            <th>보유 기간</th>
            <td>회원 탈퇴 시까지 (법령상 보존 기간 별도)</td>
          </tr>
        </tbody>
      </table>
      <section>
        <h3>1. 수집하는 개인정보 항목</h3>
        <p>· Google 계정 연동 시: 이메일 주소, 이름(Google 프로필), Google 계정 식별값{"\n"}· 회원이 직접 입력: 아이디, 닉네임, 생년월일, 성별{"\n"}· 서비스 이용 과정에서 자동 수집: 접속 기록, 기기 정보, 쿠키</p>
      </section>
      <section>
        <h3>2. 수집 및 이용 목적</h3>
        <p>· 회원 식별 및 가입 의사 확인, 본인 계정 관리{"\n"}· 연령 확인 및 맞춤형 서비스 제공{"\n"}· 서비스 이용 기록 분석, 부정 이용 방지{"\n"}· 공지사항 전달 및 문의 응대</p>
      </section>
    </div>
  );
}

/** [필수] 약관 두 줄. 글자를 누르면 약관 모달, "동의하고 닫기"를 누르면 체크 */
export function TermsChecks({ value, onChange }: { value: { service: boolean; privacy: boolean }; onChange: (v: { service: boolean; privacy: boolean }) => void }) {
  const [open, setOpen] = useState<"service" | "privacy" | null>(null);
  const row = (key: "service" | "privacy", text: string) => (
    <div className="af-term">
      <input type="checkbox" id={`af-term-${key}`} checked={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
      <label htmlFor={`af-term-${key}`}>[필수]</label>
      <button type="button" onClick={() => setOpen(key)}>
        {text}
      </button>
    </div>
  );
  return (
    <div className="af-terms">
      {row("service", "서비스 이용약관에 동의합니다.")}
      {row("privacy", "개인정보 수집 및 이용에 동의합니다.")}
      {open && (
        <Dialog title={open === "service" ? "서비스 이용약관" : "개인정보 수집 및 이용 동의"} sub="[필수]" onClose={() => setOpen(null)} wide>
          {open === "service" ? <ServiceTerms /> : <PrivacyTerms />}
          <div className="af-dialog-foot">
            <button
              type="button"
              className="af-primary"
              onClick={() => {
                onChange({ ...value, [open]: true });
                setOpen(null);
              }}
            >
              동의하고 닫기
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** 로그인 화면의 아이디 찾기 · 비밀번호 찾기 (모달) */
export function FindModal({ kind, onKind, onClose }: { kind: "id" | "pw"; onKind: (k: "id" | "pw") => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", username: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { username?: string | null; google?: boolean; found?: boolean }>(null);
  const isId = kind === "id";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isId) setDone(await findId(form.name.trim(), form.email.trim()));
      else {
        await requestPasswordReset(form.email.trim(), form.username.trim() || undefined);
        setDone({});
      }
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }
  const google = (
    <div className="af-note">
      <strong>Google 계정으로 가입하셨나요?</strong>
      <button type="button" onClick={() => void startGoogle()}>
        Google 계정으로 로그인하기 →
      </button>
    </div>
  );

  if (done) {
    return (
      <Dialog title={isId ? "아이디를 확인해 주세요" : "이메일을 확인해 주세요"} sub={isId ? "아이디 찾기" : "비밀번호 찾기"} onClose={onClose}>
        <span className="af-mail" aria-hidden>
          <svg viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </span>
        {isId ? (
          done.found && done.username ? (
            <p className="af-dialog-text">
              입력한 정보와 일치하는 아이디예요: <b>{done.username}</b>
            </p>
          ) : done.found && done.google ? (
            <p className="af-dialog-text">이 계정은 Google로 가입해 아이디가 없어요. Google 계정으로 로그인해 주세요.</p>
          ) : (
            <p className="af-dialog-text">입력한 이름 · 이메일과 일치하는 아이디를 찾지 못했어요. 입력한 정보를 다시 확인해 주세요.</p>
          )
        ) : (
          <p className="af-dialog-text">
            입력한 정보와 일치하는 계정이 있으면
            <br />
            비밀번호 재설정 메일이 발송됩니다.
            <br />
            메일의 링크에서 새 비밀번호를 설정해 주세요.
          </p>
        )}
        {!isId && (
          <div className="af-note">
            <strong>메일이 도착하지 않았나요?</strong>
            <p>
              스팸함과 입력한 이메일 주소를 확인해 주세요.
              <br />
              Google 가입자는 Google 계정으로 로그인해 주세요.
            </p>
          </div>
        )}
        <div className="af-dialog-foot col">
          <button type="button" className="af-primary" onClick={onClose}>
            로그인으로 돌아가기
          </button>
          <button type="button" className="af-soft" onClick={() => setDone(null)}>
            입력 정보 수정
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={isId ? "아이디 찾기" : "비밀번호 찾기"} onClose={onClose}>
      <p className="af-dialog-sub">
        {isId ? "가입할 때 입력한 이름과 이메일을 입력해 주세요." : "아이디와 가입한 이메일을 입력해 주세요."}
        <br />
        {isId ? "일치하는 계정의 아이디를 알려 드려요." : "비밀번호를 재설정할 수 있는 링크를 보내드립니다."}
      </p>
      <form className="af-find" onSubmit={(e) => void submit(e)}>
        {isId ? (
          <label>
            <span>이름</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="가입할 때 입력한 이름" autoComplete="name" required />
          </label>
        ) : (
          <label>
            <span>아이디</span>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="아이디를 입력해 주세요" autoComplete="username" required />
          </label>
        )}
        <label>
          <span>가입 이메일</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="이메일 주소를 입력해 주세요" autoComplete="email" required />
        </label>
        {google}
        {error && <p className="auth-error">{error}</p>}
        <button className="af-primary" disabled={busy}>
          {busy ? "확인 중…" : isId ? "아이디 찾기" : "재설정 메일 받기"}
        </button>
        <div className="af-find-links">
          <button type="button" onClick={onClose}>
            로그인으로 돌아가기
          </button>
          <button type="button" onClick={() => (onKind(isId ? "pw" : "id"), setDone(null), setError(""))}>
            {isId ? "비밀번호 찾기 →" : "아이디 찾기 →"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

