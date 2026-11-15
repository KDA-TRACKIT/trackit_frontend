"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AccountChip from "./AccountChip";

type Active = "home" | "workshop" | "marketplace" | null;

/**
 * 모든 화면 공통 상단 바. 로고·메뉴 위치와 크기를 화면마다 같게 유지하려고 한 곳에서만 그린다.
 * 스타일은 globals.css 의 .gnb
 */
export default function SiteHeader({ active = null }: { active?: Active }) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveTrigger = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 0);
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  return (
    <header className="gnb" data-scrolled={scrolled}>
      <Link className="gnb-brand" href="/" aria-label="TRACKIT 홈">
        TRACKIT
      </Link>
      <nav className="gnb-main" aria-label="주요 메뉴">
        <Link className={active === "home" ? "active" : ""} href="/" aria-current={active === "home" ? "page" : undefined}>
          홈
        </Link>
        <Link className={active === "workshop" ? "active" : ""} href="/workshop" aria-current={active === "workshop" ? "page" : undefined}>
          트레이딩 로그
        </Link>
        <div
          className="gnb-archive"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setArchiveOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setArchiveOpen(false);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setArchiveOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && archiveOpen) {
              archiveTrigger.current?.focus();
              setArchiveOpen(false);
            }
          }}
        >
          <button
            ref={archiveTrigger}
            type="button"
            className="gnb-archive-trigger"
            aria-expanded={archiveOpen}
            aria-controls="archive-links"
            onClick={(event) => setArchiveOpen((open) => event.detail > 0 && window.matchMedia("(hover: hover)").matches ? true : !open)}
          >
            아카이브
          </button>
          <div className="gnb-archive-dropdown" id="archive-links" hidden={!archiveOpen}>
            <button type="button" disabled>구매한 전략</button>
            <Link href="/#trading-log" onClick={() => setArchiveOpen(false)}>나의 기록</Link>
          </div>
        </div>
        <Link className={active === "marketplace" ? "active" : ""} href="/marketplace" aria-current={active === "marketplace" ? "page" : undefined}>
          전략 쇼핑
        </Link>
      </nav>
      {/* 계정: 로그인하면 프로필 사진 + 닉네임 */}
      <nav className="gnb-account" aria-label="계정 메뉴">
        <AccountChip />
      </nav>
    </header>
  );
}
