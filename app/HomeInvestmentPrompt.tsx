"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./home-investment-prompt.css";

export default function HomeInvestmentPrompt({ userId, lastSignInAt }: { userId: string; lastSignInAt: string | null }) {
  const storageKey = `trackit:investment-prompt:${userId}:${lastSignInAt ?? "session"}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === "dismissed"; } catch { return false; }
  });
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dismissed) return;
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [dismissed]);

  function rememberDismissal() {
    try { sessionStorage.setItem(storageKey, "dismissed"); } catch { /* Still dismiss when storage is unavailable. */ }
  }
  function dismiss() {
    rememberDismissal();
    setDismissed(true);
  }

  if (dismissed) return null;
  return (
    <dialog ref={dialog} className="home-investment-prompt" aria-labelledby="investment-prompt-title" onCancel={(event) => { event.preventDefault(); dismiss(); }}>
      <h2 id="investment-prompt-title">저장된 투자 정보가 없습니다.</h2>
      <div className="home-investment-prompt-actions">
        <Link className="primary" href="/onboarding?from=home" onClick={rememberDismissal}>프로필 설정하러가기</Link>
        <button type="button" onClick={dismiss}>나중에 설정하기</button>
      </div>
    </dialog>
  );
}
