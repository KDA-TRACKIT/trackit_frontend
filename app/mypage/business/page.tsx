"use client";
// 비즈니스 프로필 전환 (시안 2026-11-18):
//   전략 판매 시작하기 → 판매 약관 동의 → 정산 정보 입력 → 프로필 정보 공개 안내(동의) → 완료
//   판매자 API 가 생기기 전까지 전환 상태는 이 브라우저에만. 정산 계좌는 끝 4자리만 저장 (전체 번호는 남기지 않음)
import { useState } from "react";
import { useMypage } from "../context";
import { Card, Modal, PageHead } from "../ui";
import { SELLER_TERMS_VERSION, saveBusiness, useBusiness, type Settlement } from "./state";
import { allPublic, readPrivacy } from "../account/privacy/privacy";

const TERMS = [
  { key: "sale", title: "전략 판매 이용약관에 동의 (필수)", desc: "판매자는 판매 권한이 있는 전략을 등록하고,\n구매자가 확인할 수 있도록 전략 내용과 이용 조건을 안내합니다." },
  { key: "settle", title: "판매 대금 정산 약관에 동의 (필수)", desc: "판매 대금의 정산 기준과 지급 절차,\n환불 시 정산 금액이 조정될 수 있음을 확인합니다." },
] as const;

const BANKS = ["KB국민은행", "신한은행", "우리은행", "하나은행", "NH농협은행", "IBK기업은행", "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일은행", "부산은행", "대구은행", "광주은행", "경남은행", "새마을금고", "우체국", "수협은행", "씨티은행"];

/** 000-00-00000 */
const bizNo = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join("-");
};

type Step = "none" | "terms" | "settle" | "public" | "done";

export default function BusinessPage() {
  const { user, profile, meta, saveMeta } = useMypage();
  const business = useBusiness(user.id);
  const pending = business?.status === "pending";
  const [step, setStep] = useState<Step>("none");
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const all = TERMS.every((t) => agreed[t.key]);
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [biz, setBiz] = useState("");
  const [publicOk, setPublicOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // 비즈니스 프로필 관리(시안 2026-11-19): 정산 정보를 화면에서 바로 고치고 "계좌 변경"으로 저장 → 은행 · 사업자번호는 고치기 전까지 저장된 값
  const [mEdit, setMEdit] = useState<{ bank?: string; biz?: string }>({});
  const mBank = mEdit.bank ?? business?.settlement?.bank ?? "";
  const mBiz = mEdit.biz ?? business?.settlement?.businessNo ?? "";
  const mOk = !!mBank && account.length >= 10 && (mBiz === "" || mBiz.replace(/\D/g, "").length === 10);
  const [saved, setSaved] = useState(false);
  const settleOk = !!bank && account.length >= 10 && (biz === "" || biz.replace(/\D/g, "").length === 10);

  async function convert() {
    setBusy(true);
    setError(null);
    try {
      // 비즈니스 프로필은 모든 프로필 정보가 공개 (전환 뒤 필요 없는 항목은 다시 비공개로 바꿀 수 있음)
      await saveMeta({ privacy: allPublic(readPrivacy(meta)) });
      const settlement: Settlement = { bank, accountLast4: account.slice(-4), holder: profile.name, ...(biz ? { businessNo: biz } : {}) };
      const now = new Date().toISOString();
      saveBusiness(user.id, { status: "pending", termsVersion: SELLER_TERMS_VERSION, acceptedAt: now, settlement, publicConsentAt: now });
      setAccount(""); // 계좌번호는 바로 지운다
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "전환하지 못했어요.");
    }
    setBusy(false);
  }

  const close = () => { if (!busy) { setAccount(""); setError(null); setStep("none"); } };

  function startConversion() {
    setAgreed({});
    setPublicOk(false);
    setBank("");
    setAccount("");
    setBiz("");
    setError(null);
    setEditing(false);
    setStep("terms");
  }

  /** 관리 화면에서 바로 계좌 변경 (계좌번호는 끝 4자리만 남기고 입력칸은 비움) */
  function saveInline() {
    if (!business || !mOk) return;
    try {
      saveBusiness(user.id, { ...business, settlement: { bank: mBank, accountLast4: account.slice(-4), holder: business.settlement?.holder || profile.name, ...(mBiz ? { businessNo: mBiz } : {}) } });
      setAccount("");
      setMEdit({});
      setError(null);
      setSaved(true);
    } catch {
      setError("계좌 변경 내용을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  function registerAccount() {
    if (!business || !settleOk) return;
    try {
      saveBusiness(user.id, { ...business, settlement: { bank, accountLast4: account.slice(-4), holder: business.settlement?.holder || profile.name, ...(biz ? { businessNo: biz } : {}) } });
      setAccount("");
      setEditing(false);
      close();
    } catch {
      setError("계좌 변경 내용을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <>
      <PageHead title={business && !pending ? "비즈니스 프로필 관리" : "비즈니스 프로필 전환"} desc={business && !pending ? undefined : "내 투자 전략을 판매하려면 비즈니스 프로필로 전환해 주세요."} />
      {pending ? <Card className="mp-business-pending" title="전략 판매 시작하기"><div className="mp-biz-box"><strong>계정 전환 심사 중입니다.</strong><p>최대 영업일 기준 3~5일 소요됩니다.</p></div></Card> : business ? (
        <Card className="mp-business-management">
          <h2>정산 정보</h2>
          <p className="mp-card-desc">판매 수익은 매월 20일, 전월 확정 금액이 아래 계좌로 입금됩니다.</p>
          <div className="mp-form mp-settle">
            <div className="mp-row-2">
              <label className="mp-field">
                <span>정산 은행</span>
                <select value={mBank} onChange={(e) => (setMEdit({ ...mEdit, bank: e.target.value }), setSaved(false))}>
                  <option value="">은행을 선택하세요</option>
                  {BANKS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="mp-field">
                <span>
                  계좌번호 {business.settlement && <small>지금 •••• {business.settlement.accountLast4}</small>}
                </span>
                <input inputMode="numeric" autoComplete="off" value={account} onChange={(e) => (setAccount(e.target.value.replace(/\D/g, "").slice(0, 16)), setSaved(false))} placeholder="- 없이 숫자만 입력" />
              </label>
            </div>
            <label className="mp-field"><span>예금주 <small>본인 인증 정보와 같아야 합니다.</small></span><input value={business.settlement?.holder || profile.name} readOnly /></label>
            <label className="mp-field">
              <span>사업자등록번호 <small>선택 · 개인사업자/법인만 입력</small></span>
              <input inputMode="numeric" value={mBiz} onChange={(e) => (setMEdit({ ...mEdit, biz: bizNo(e.target.value) }), setSaved(false))} placeholder="000-00-00000" />
            </label>
          </div>
          {error && <p className="mp-notice err" role="alert">{error}</p>}
          {saved && <p className="mp-notice ok">정산 계좌를 바꿨어요.</p>}
        </Card>
      ) : <Card title="전략 판매 시작하기" desc="판매 조건을 확인하고 약관에 동의하면 비즈니스 프로필로 전환할 수 있어요.">
          <div className="mp-biz-box">
            <strong>개인 프로필 → 비즈니스 프로필</strong>
            <p>비즈니스 프로필에서는 내 전략을 판매하고 판매 내역과 정산 내역을 확인할 수 있어요.</p>
          </div>
      </Card>}
      <div className="mp-actions">
        {pending ? <button type="button" className="mp-btn primary" disabled>계정 전환 취소</button> : business ? (
          <button type="button" className="mp-btn primary" disabled={!mOk} onClick={saveInline}>
            계좌 변경
          </button>
        ) : (
          <button type="button" className="mp-btn primary" onClick={startConversion}>
            계정 전환
          </button>
        )}
      </div>

      {step === "terms" && (
        <Modal label="전략 판매 약관 동의" onClose={close}>
          <div className="mp-modal-head">
            <div>
              <h2>전략 판매 약관 동의</h2>
              <p>전략을 판매하려면 아래 두 항목에 동의해 주세요.</p>
            </div>
          </div>
          <div className="mp-terms">
            <label className="all">
              <input type="checkbox" checked={all} onChange={(e) => setAgreed(Object.fromEntries(TERMS.map((t) => [t.key, e.target.checked])))} />
              <strong>필수 약관에 모두 동의</strong>
            </label>
            {TERMS.map((t) => (
              <label key={t.key}>
                <input type="checkbox" checked={!!agreed[t.key]} onChange={(e) => setAgreed({ ...agreed, [t.key]: e.target.checked })} />
                <span>
                  <strong>{t.title}</strong>
                  <small style={{ whiteSpace: "pre-line" }}>{t.desc}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="mp-actions">
            <button type="button" className="mp-btn soft" onClick={close}>
              취소
            </button>
            <button type="button" className="mp-btn primary" disabled={!all} onClick={() => setStep("settle")}>
              동의하고 전환
            </button>
          </div>
        </Modal>
      )}

      {step === "settle" && (
        <Modal label="정산 정보 입력" onClose={close}>
          <div className="mp-modal-head">
            <div>
              <h2>정산 정보 입력</h2>
              <p>
                판매 수익을 받을 계좌 정보를 입력해 주세요.
                <br />
                판매 수익은 매월 20일, 전월 확정 금액이 아래 계좌로 입금됩니다.
              </p>
            </div>
          </div>
          <div className="mp-form mp-settle">
            <div className="mp-row-2">
              <label className="mp-field">
                <span>정산 은행</span>
                <select value={bank} onChange={(e) => setBank(e.target.value)}>
                  <option value="">은행을 선택하세요</option>
                  {BANKS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="mp-field">
                <span>계좌번호</span>
                <input inputMode="numeric" autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, "").slice(0, 16))} placeholder="- 없이 숫자만 입력" />
              </label>
            </div>
            <label className="mp-field">
              <span>
                예금주 <small>본인 인증 정보와 같아야 합니다.</small>
              </span>
              <input value={editing ? business?.settlement?.holder || profile.name : profile.name} readOnly />
            </label>
            <label className="mp-field">
              <span>
                사업자등록번호 <small>선택 · 개인사업자/법인만 입력</small>
              </span>
              <input inputMode="numeric" value={biz} onChange={(e) => setBiz(bizNo(e.target.value))} placeholder="000-00-00000" />
            </label>
          </div>
          {error && <p className="mp-notice err" role="alert">{error}</p>}
          <div className="mp-actions">
            <button type="button" className="mp-btn" onClick={close}>
              취소
            </button>
            <button type="button" className="mp-btn primary" disabled={!settleOk} onClick={() => editing ? registerAccount() : setStep("public")}>
              {editing ? "계좌 등록" : "다음"}
            </button>
          </div>
        </Modal>
      )}

      {step === "public" && (
        <Modal label="프로필 정보 공개 안내" onClose={close}>
          <div className="mp-modal-head">
            <div>
              <h2>프로필 정보 공개 안내</h2>
              <p>
                비즈니스 프로필로 전환하면 모든 프로필 정보가 공개로 변경됩니다.
                <br />
                동의하시겠습니까?
              </p>
            </div>
          </div>
          <div className="mp-public-box">
            <strong>공개로 바뀌는 정보</strong>
            <p>· 내 프로필: 프로필 이미지, 표시 아이디, 프로필 소개</p>
            <p>· 내 투자 정보: 주요 투자 시장·기간, 매매 방식, 참고 지표, 매매 원칙</p>
            <p>· 전환 후에도 판매에 필요하지 않은 항목은 다시 비공개로 바꿀 수 있어요.</p>
          </div>
          <div className="mp-terms">
            <label className="all">
              <input type="checkbox" checked={publicOk} onChange={(e) => setPublicOk(e.target.checked)} />
              <strong>모든 정보 공개 전환에 동의합니다. (필수)</strong>
            </label>
          </div>
          {error && <p className="mp-notice err">{error}</p>}
          <div className="mp-actions">
            <button type="button" className="mp-btn soft" onClick={close} disabled={busy}>
              취소
            </button>
            <button type="button" className="mp-btn primary" disabled={!publicOk || busy} onClick={() => void convert()}>
              {busy ? "전환 중…" : "동의하고 전환"}
            </button>
          </div>
        </Modal>
      )}

      {step === "done" && (
        <Modal label="전환 신청 완료" onClose={close}>
          <h2>비즈니스 프로필 전환 신청</h2>
          <p className="mp-modal-desc">계정 전환 심사 중입니다. 최대 영업일 기준 3~5일 소요됩니다.</p>
          <div className="mp-actions">
            <button type="button" className="mp-btn primary" style={{ minWidth: 88 }} onClick={close}>
              닫기
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
