"use client";
// 최초 프로필 생성 (가입 직후): 나만의 투자 정보 설정. 마이페이지 · 내 투자 정보와 같은 값(user_metadata.investment)
import Link from "next/link";
import { useEffect, useState } from "react";
import SiteHeader from "../SiteHeader";
import { getSupabaseBrowser } from "../../lib/supabase-browser";
import { updateMeta } from "../mypage/context";
import { EMPTY_INVESTMENT, InvestmentFields, readInvestment } from "../mypage/investment/InvestmentFields";
import { Card, Notice } from "../mypage/ui";
import "../mypage/mypage.css";

export default function OnboardingPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [value, setValue] = useState(EMPTY_INVESTMENT);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    getSupabaseBrowser()
      ?.auth.getSession()
      .then(({ data }) => {
        setLoggedIn(!!data.session);
        if (data.session) setValue(readInvestment((data.session.user.user_metadata ?? {}) as Record<string, unknown>));
      });
  }, []);

  async function create() {
    setBusy(true);
    setNote(null);
    try {
      await updateMeta({ investment: value });
      window.location.replace("/");
    } catch (err) {
      setNote({ ok: false, msg: err instanceof Error ? err.message : "저장하지 못했어요." });
      setBusy(false);
    }
  }

  return (
    <main className="mp onboarding">
      <SiteHeader />
      <div className="onboarding-body">
        <header className="mp-head">
          <h1>투자 스타일을 알려 주세요</h1>
          <p>프로필에 보여요. 건너뛰고 나중에 마이페이지에서 정해도 돼요.</p>
        </header>
        {loggedIn === false ? (
          <Card>
            <p className="mp-muted">
              로그인이 필요해요. <Link href="/login">로그인</Link>
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <InvestmentFields value={value} onChange={setValue} showPeriod={false} variant="onboarding" />
              <Notice text={note} />
            </Card>
            <div className="onboarding-foot">
              <span />
              <div className="mp-actions">
                <Link className="mp-btn" style={{ width: 180 }} href="/">
                  건너뛰기
                </Link>
                <button type="button" className="mp-btn primary" style={{ width: 180 }} onClick={() => void create()} disabled={busy || loggedIn === null}>
                  {busy ? "저장 중…" : "완료"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
