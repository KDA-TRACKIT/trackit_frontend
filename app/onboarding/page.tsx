"use client";
// 최초 프로필 생성 (가입 직후): 나만의 투자 정보 설정. 마이페이지 · 내 투자 정보와 같은 값(user_metadata.investment)
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "../SiteHeader";
import { getSupabaseBrowser } from "../../lib/supabase-browser";
import { updateMeta } from "../mypage/context";
import { EMPTY_INVESTMENT, InvestmentFields, readInvestment } from "../mypage/investment/InvestmentFields";
import { Card, Notice } from "../mypage/ui";
import "../mypage/mypage.css";
import { hasSavedInvestment } from "../../lib/investment-profile";

function OnboardingForm() {
  const fromHome = useSearchParams().get("from") === "home";
  const [loggedIn, setLoggedIn] = useState<boolean | null>(() => getSupabaseBrowser() ? null : false);
  const [value, setValue] = useState(EMPTY_INVESTMENT);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase.auth.getSession()
      .then(({ data }) => {
        setLoggedIn(!!data.session);
        if (data.session) setValue(readInvestment((data.session.user.user_metadata ?? {}) as Record<string, unknown>));
      });
  }, []);

  async function create() {
    if (fromHome && !hasSavedInvestment({ investment: value })) {
      setNote({ ok: false, msg: "투자 정보를 입력해 주세요." });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await updateMeta({ investment: value });
      window.location.replace(fromHome ? "/" : "/signup/success");
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
          <h1>나만의 투자 정보 설정</h1>
          <p>자주 사용하는 지표와 매매 스타일을 설정하면 전략 기록을 더 쉽게 정리할 수 있어요.</p>
        </header>
        {loggedIn === false ? (
          <Card>
            <p className="mp-muted">
              로그인이 필요해요. <Link href="/login">로그인</Link>
            </p>
          </Card>
        ) : (
          <>
            <Card title="기본 프로필" desc="다른 사용자에게 보여질 정보를 작성해주세요.">
              <InvestmentFields value={value} onChange={setValue} variant="onboarding" />
              <Notice text={note} />
            </Card>
            <div className="onboarding-foot">
              <span className="mp-muted" style={{ fontSize: 12 }}>
                입력한 내용은 프로필에서 언제든 수정할 수 있습니다.
              </span>
              <div className="mp-actions">
                <Link className="mp-btn" style={{ width: 180 }} href={fromHome ? "/" : "/login"}>
                  나중에 설정하기
                </Link>
                <button type="button" className="mp-btn primary" style={{ width: 180 }} onClick={() => void create()} disabled={busy || loggedIn === null}>
                  {busy ? "저장 중…" : "프로필 생성하기"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return <Suspense fallback={<main className="mp onboarding" aria-busy="true" />}><OnboardingForm /></Suspense>;
}
