"use client";
// 마이페이지 틀: 상단 바 + 왼쪽 메뉴 + 오른쪽 내용. 로그인 전이면 로그인 안내
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import SiteHeader from "../SiteHeader";
import { MypageProvider, useSupabaseUser } from "./context";
import "./mypage.css";

type Item = { label: string; href: string };
type Group = { label: string; href: string; children: Item[] };

const TOP: Item[] = [
  { label: "내 프로필", href: "/mypage/profile" },
  { label: "내 투자 정보", href: "/mypage/investment" },
  { label: "비즈니스 프로필 전환", href: "/mypage/business" },
];
const ACTIVITY: Item[] = [
  { label: "활동 이력", href: "/mypage/activity" },
  { label: "거래 기록", href: "/mypage/activity/trades" },
];
const GROUPS: Group[] = [
  {
    label: "판매 관리",
    href: "/mypage/sales",
    children: [
      { label: "공개 전략", href: "/mypage/sales/strategies" },
      { label: "판매 내역", href: "/mypage/sales/history" },
      { label: "정산 내역", href: "/mypage/sales/settlements" },
    ],
  },
  {
    label: "계정 설정",
    href: "/mypage/account",
    children: [
      { label: "기본 계정 정보 수정", href: "/mypage/account/basic" },
      { label: "개인정보 및 공개 설정", href: "/mypage/account/privacy" },
    ],
  },
];

function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({ "판매 관리": true, "계정 설정": true });
  const link = (it: Item, sub = false) => (
    <Link key={it.href} href={it.href} className={`${sub ? "sub " : ""}${path === it.href ? "on" : ""}`} aria-current={path === it.href ? "page" : undefined}>
      {it.label}
    </Link>
  );
  return (
    <aside className="mp-side">
      <Link href="/mypage" className={`mp-side-title ${path === "/mypage" ? "on" : ""}`}>
        마이페이지
      </Link>
      <nav aria-label="마이페이지 메뉴">
        <div className="mp-side-group">{TOP.map((it) => link(it))}</div>
        <div className="mp-side-group">{ACTIVITY.map((it) => link(it))}</div>
        <div className="mp-side-group">
          <Link href="/mypage/trust" className={`row ${path === "/mypage/trust" ? "on" : ""}`}>
            신뢰도 점수 <span aria-hidden>›</span>
          </Link>
        </div>
        {GROUPS.map((g) => (
          <div key={g.label} className="mp-side-group">
            <div className={`row ${path === g.href ? "on" : ""}`}>
              <Link href={g.href}>{g.label}</Link>
              <button type="button" aria-label={`${g.label} ${open[g.label] ? "접기" : "펼치기"}`} aria-expanded={open[g.label]} onClick={() => setOpen({ ...open, [g.label]: !open[g.label] })}>
                {open[g.label] ? "⌃" : "⌄"}
              </button>
            </div>
            {open[g.label] && g.children.map((it) => link(it, true))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export default function MypageLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, setUser } = useSupabaseUser();
  return (
    <main className="mp">
      <SiteHeader />
      <div className="mp-shell">
        <Sidebar />
        <div className="mp-content">
          {!ready ? (
            <div className="mp-skel" aria-busy="true" aria-label="불러오는 중">
              <span />
              <span />
              <span />
            </div>
          ) : !user ? (
            <section className="mp-card">
              <p className="mp-muted">
                로그인이 필요해요. <Link href="/login">로그인</Link>
              </p>
            </section>
          ) : (
            <MypageProvider user={user} onUser={setUser}>
              {children}
            </MypageProvider>
          )}
        </div>
      </div>
    </main>
  );
}
