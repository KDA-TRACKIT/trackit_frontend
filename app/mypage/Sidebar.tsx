"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { label: string; href: string };
type Group = { label: string; href: string; children: Item[] };

const TOP: Item[] = [
  { label: "내 프로필", href: "/mypage/profile" },
  { label: "내 투자 정보", href: "/mypage/investment" },
  { label: "비즈니스 프로필", href: "/mypage/business" },
];
// 시안(2026-11-18): 활동 이력 · 거래 기록 · 신뢰도 · 구매 내역 · 전략 관리는 메뉴에서 뺌 (주소는 남김, 거래 기록은 내 계좌 안으로)
const WALLET: Item = { label: "내 계좌", href: "/mypage/wallet" };
const GROUPS: Group[] = [
  {
    label: "전략 판매 관리",
    href: "/mypage/sales",
    children: [
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

export default function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({ "전략 판매 관리": true, "계정 설정": true });
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
        <div className="mp-side-group">{link(WALLET)}</div>
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
      <div className="mp-side-foot">
        <strong>TRAKIT</strong>
        <small>트레이더를 위한 투자 기록 플랫폼</small>
      </div>
    </aside>
  );
}

