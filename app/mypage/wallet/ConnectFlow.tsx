"use client";
// 계좌 연결: 마이데이터처럼 휴대폰 본인인증 한 번 → 내 증권 계좌를 찾아 → 모두 자동 연결
//   실제 마이데이터는 허가받은 사업자만 할 수 있어서, 시연에서는
//     · 본인인증: 문자 대신 화면에 인증번호를 보여 준다 (휴대폰 정보는 어디에도 저장하지 않음)
//     · 연결: 서버에 넣어 둔 증권사 API 키로 연결 (POST /brokers/mydata). 서버 키가 없으면 키움 앱키를 한 번만 받아 연결
//   실제로 연결된 계좌만 보여 준다 (없는 계좌 · 잔고를 지어내지 않음)
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../../lib/api/client";
import { connectBroker, listConnections, mydataConnect, mydataStatus, type BrokerConnection } from "../../../lib/api/orders";
import { useMypage } from "../context";
import { Modal } from "../ui";

type Step = "intro" | "verify" | "search" | "key" | "done";
const CARRIERS = ["SKT", "KT", "LG U+", "알뜰폰"];
const SEARCH_LINES = ["본인 확인 정보로 증권사에 계좌를 묻는 중", "계좌 목록과 잔고 정보를 받는 중", "찾은 계좌를 연결하는 중"];

export default function ConnectFlow({ onClose }: { onClose: (changed: boolean) => void }) {
  const { meta } = useMypage();
  // 본인인증 이름 = 가입 때 적은 실명(name · full_name). 닉네임은 넣지 않음 (없으면 빈 칸으로 직접 입력)
  const realName = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "" && v.trim() !== String(meta.nickname ?? "").trim())?.trim() ?? "";
  const [step, setStep] = useState<Step>("intro");
  const [agree, setAgree] = useState({ send: false, identity: false });
  const [form, setForm] = useState({ name: realName, birth: "", gender: "", carrier: "SKT", phone: "" });
  const [sent, setSent] = useState<{ code: string; until: number } | null>(null);
  const [code, setCode] = useState("");
  /** 시연: 문자 대신 띄우는 인증번호 팝업 */
  const [smsOpen, setSmsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchAt, setSearchAt] = useState(0);
  const [result, setResult] = useState<BrokerConnection[] | null>(null);
  const [key, setKey] = useState({ appKey: "", appSecret: "", mode: "mock" as "mock" | "real" });
  const changed = useRef(false);

  // 인증번호 남은 시간
  useEffect(() => {
    if (!sent) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sent]);
  const left = sent ? Math.max(0, Math.ceil((sent.until - now) / 1000)) : 0;

  const phoneOk = /^01[016789]\d{7,8}$/.test(form.phone);
  const formOk = form.name.trim().length >= 2 && /^\d{6}$/.test(form.birth) && /^[1-4]$/.test(form.gender) && phoneOk;

  function sendCode() {
    setError(null);
    setCode("");
    setSent({ code: String(Math.floor(100000 + Math.random() * 900000)), until: Date.now() + 180_000 });
    setNow(Date.now());
    setSmsOpen(true);
  }

  async function verify() {
    if (!sent || left === 0) return setError("인증 시간이 지났어요. 인증번호를 다시 받아 주세요.");
    if (code !== sent.code) return setError("인증번호가 맞지 않아요.");
    setError(null);
    setStep("search");
    setSearchAt(0);
    const started = Date.now();
    const tick = setInterval(() => setSearchAt((i) => Math.min(i + 1, SEARCH_LINES.length - 1)), 700);
    try {
      const st = await mydataStatus();
      if (!st.auto) {
        clearInterval(tick);
        setStep("key");
        return;
      }
      const list = await mydataConnect();
      changed.current = true;
      await new Promise((r) => setTimeout(r, Math.max(0, 1800 - (Date.now() - started)))); // 찾는 화면이 너무 빨리 지나가지 않게
      setResult(list.filter((c) => c.status === "ACTIVE"));
      setStep("done");
    } catch (e) {
      setError(errorMessage(e));
      setStep("verify");
    } finally {
      clearInterval(tick);
    }
  }

  async function connectWithKey() {
    setBusy(true);
    setError(null);
    try {
      const opened = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
      await connectBroker({ appKey: key.appKey.trim(), appSecret: key.appSecret.trim(), mode: key.mode, openedAt: opened, label: "마이데이터 연결" });
      setKey({ appKey: "", appSecret: "", mode: "mock" }); // 키는 바로 지운다
      changed.current = true;
      setResult((await listConnections()).filter((c) => c.status === "ACTIVE"));
      setStep("done");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => onClose(changed.current);
  const steps: [Step[], string][] = [
    [["intro"], "동의"],
    [["verify"], "본인인증"],
    [["search", "key"], "계좌 찾기"],
    [["done"], "연결 완료"],
  ];
  const at = steps.findIndex(([s]) => s.includes(step));
  const accountCount = (result ?? []).reduce((n, c) => n + c.accounts.filter((a) => a.status === "ACTIVE").length, 0);

  return (
    <Modal label="증권 계좌 연결" onClose={close}>
      <div className="mp-cf">
        <div className="mp-modal-head">
          <div>
            <h2>증권 계좌 한 번에 연결</h2>
            <p>휴대폰 본인인증 한 번이면 내 이름으로 된 증권 계좌를 찾아 모두 연결해요.</p>
          </div>
          <button type="button" className="mp-x" aria-label="닫기" onClick={close}>
            ×
          </button>
        </div>
        <ol className="mp-cf-steps" aria-label="진행 단계">
          {steps.map(([, label], i) => (
            <li key={label} className={i < at ? "done" : i === at ? "on" : ""}>
              <i>{i < at ? "✓" : i + 1}</i>
              {label}
            </li>
          ))}
        </ol>

        {step === "intro" && (
          <>
            <div className="mp-terms">
              <label className="all">
                <input type="checkbox" checked={agree.send && agree.identity} onChange={(e) => setAgree({ send: e.target.checked, identity: e.target.checked })} />
                <strong>모두 동의</strong>
              </label>
              <label>
                <input type="checkbox" checked={agree.send} onChange={(e) => setAgree({ ...agree, send: e.target.checked })} />
                <span>
                  <strong>[필수] 증권 계좌 정보 전송 요구 및 수집 · 이용 동의</strong>
                  <small>계좌 목록, 잔고, 보유 종목, 체결 내역 · 연결을 끊으면 더 받지 않아요</small>
                </span>
              </label>
              <label>
                <input type="checkbox" checked={agree.identity} onChange={(e) => setAgree({ ...agree, identity: e.target.checked })} />
                <span>
                  <strong>[필수] 휴대폰 본인확인 서비스 이용 동의</strong>
                  <small>이름 · 생년월일 · 휴대폰 번호는 인증에만 쓰고 저장하지 않아요</small>
                </span>
              </label>
            </div>
            <div className="mp-actions full">
              <button type="button" className="mp-btn soft" onClick={close}>
                취소
              </button>
              <button type="button" className="mp-btn primary" disabled={!agree.send || !agree.identity} onClick={() => setStep("verify")}>
                본인인증 하기
              </button>
            </div>
          </>
        )}

        {step === "verify" && (
          <>
            <div className="mp-cf-form">
              <label>
                <span>이름</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              </label>
              <label>
                <span>주민등록번호 앞 7자리</span>
                <div className="mp-cf-rrn">
                  <input inputMode="numeric" maxLength={6} placeholder="생년월일 6자리" value={form.birth} onChange={(e) => setForm({ ...form, birth: e.target.value.replace(/\D/g, "") })} />
                  <b>-</b>
                  <input inputMode="numeric" maxLength={1} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value.replace(/\D/g, "") })} aria-label="성별 숫자" />
                  <em aria-hidden>●●●●●●</em>
                </div>
              </label>
              <label>
                <span>휴대폰 번호</span>
                <div className="mp-cf-phone">
                  <select value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} aria-label="통신사">
                    {CARRIERS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <input inputMode="numeric" placeholder="- 없이 숫자만" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} autoComplete="tel" />
                  <button type="button" className="mp-btn" disabled={!formOk} onClick={sendCode}>
                    {sent ? "재전송" : "인증번호 받기"}
                  </button>
                </div>
              </label>
              {sent && (
                <>
                  <label>
                    <span>인증번호</span>
                    <div className="mp-cf-code">
                      <input inputMode="numeric" maxLength={6} placeholder="인증번호 6자리" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
                      <em className={left < 30 ? "warn" : ""}>
                        {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
                      </em>
                    </div>
                  </label>
                  {!smsOpen && (
                    <button type="button" className="mp-cf-sms-again" onClick={() => setSmsOpen(true)}>
                      인증번호 문자 다시 보기
                    </button>
                  )}
                  {smsOpen && (
                    // 시연: 휴대폰 문자 대신 화면 위에 띄우는 인증번호 팝업
                    <div className="mp-cf-sms" role="alertdialog" aria-label="인증번호 문자">
                      <div className="mp-cf-sms-head">
                        <b>메시지</b>
                        <small>지금</small>
                      </div>
                      <p>
                        [TRACKIT] 본인확인 인증번호 <strong>{sent.code}</strong>를 입력해 주세요. (3분 안에)
                      </p>
                      <div className="mp-cf-sms-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setCode(sent.code);
                            setSmsOpen(false);
                          }}
                        >
                          입력하기
                        </button>
                        <button type="button" className="ghost" onClick={() => setSmsOpen(false)}>
                          닫기
                        </button>
                      </div>
                      <em>시연 모드 · 실제 문자는 보내지 않아요</em>
                    </div>
                  )}
                </>
              )}
            </div>
            {error && <p className="mp-notice err">{error}</p>}
            <div className="mp-actions full">
              <button type="button" className="mp-btn soft" onClick={() => setStep("intro")}>
                이전
              </button>
              <button type="button" className="mp-btn primary" disabled={!sent || code.length !== 6} onClick={() => void verify()}>
                인증하고 계좌 찾기
              </button>
            </div>
          </>
        )}

        {step === "search" && (
          <div className="mp-cf-search" aria-live="polite">
            <span className="mp-cf-spin" aria-hidden />
            <strong>내 증권 계좌를 찾고 있어요</strong>
            <ul>
              {SEARCH_LINES.map((l, i) => (
                <li key={l} className={i < searchAt ? "done" : i === searchAt ? "on" : ""}>
                  {i < searchAt ? "✓" : "·"} {l}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === "key" && (
          <>
            <div className="mp-cf-box">
              <strong>시연용 연결 키</strong>
              <p>지금은 서버에 자동 연결 키가 없어서, 키움 OpenAPI 앱키 · 시크릿으로 연결해요. 키는 서버로만 보내고 이 브라우저에는 남기지 않아요.</p>
            </div>
            <div className="mp-cf-form">
              <label>
                <span>구분</span>
                <select value={key.mode} onChange={(e) => setKey({ ...key, mode: e.target.value as "mock" | "real" })}>
                  <option value="mock">모의투자</option>
                  <option value="real">실전투자</option>
                </select>
              </label>
              <label>
                <span>앱키</span>
                <input value={key.appKey} onChange={(e) => setKey({ ...key, appKey: e.target.value })} spellCheck={false} autoComplete="off" />
              </label>
              <label>
                <span>시크릿</span>
                <input type="password" value={key.appSecret} onChange={(e) => setKey({ ...key, appSecret: e.target.value })} autoComplete="new-password" />
              </label>
            </div>
            {error && <p className="mp-notice err">{error}</p>}
            <div className="mp-actions full">
              <button type="button" className="mp-btn soft" onClick={close} disabled={busy}>
                취소
              </button>
              <button type="button" className="mp-btn primary" disabled={busy || !key.appKey.trim() || !key.appSecret.trim()} onClick={() => void connectWithKey()}>
                {busy ? "연결 중…" : "연결하기"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="mp-cf-done">
              <span aria-hidden>✓</span>
              <strong>계좌 {accountCount}개를 연결했어요</strong>
              <p>잔고와 보유 종목은 바로, 체결 내역은 동기화되면 내 계좌와 매매 기록에 보여요.</p>
            </div>
            <ul className="mp-cf-list">
              {(result ?? []).flatMap((c) =>
                c.accounts
                  .filter((a) => a.status === "ACTIVE")
                  .map((a) => (
                    <li key={a.id}>
                      <strong>{c.broker.name}</strong>
                      <span>{a.accountNoMasked}</span>
                      <em className={c.mode}>{c.mode === "mock" ? "모의투자" : "실전"}</em>
                    </li>
                  )),
              )}
            </ul>
            <div className="mp-actions">
              <button type="button" className="mp-btn primary" style={{ minWidth: 120 }} onClick={close}>
                확인
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
