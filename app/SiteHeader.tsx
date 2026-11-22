import Link from "next/link";
import { ChevronDown } from "lucide-react";
import AccountChip from "./AccountChip";
import HeaderDropdown, { type HeaderDropdownItem } from "./HeaderDropdown";

type Active = "home" | "fortrade" | "archive" | "marketplace" | null;

type Menu = { key: Exclude<Active, null>; label: string; href: string; sub?: HeaderDropdownItem[] };
const MENU: Menu[] = [
  { key: "home", label: "홈", href: "/" },
  {
    key: "fortrade",
    label: "투자작업실",
    href: "/workshop",
    // 매매할 때 보는 화면 두 개: 트레이딩 로그(차트·기록) + 증시 캘린더(/insights, 안에서 탭)
    sub: [
      { label: "트레이딩 로그", href: "/workshop", icon: "candlestick" },
      { label: "증시 캘린더", href: "/insights", icon: "calendar" },
    ],
  },
  { key: "marketplace", label: "전략마켓", href: "/marketplace" },
  {
    key: "archive",
    label: "전략보관함",
    href: "/archive/notes",
    // '전략보관함'을 누르면 첫 화면은 내 노트
    //   (예전 '내 전략'(/archive/mine, 판매 등록 · AI 초안)은 메뉴에선 빠지고 마이페이지 판매 · AI 전략 만들기에서 들어감)
    sub: [
      { label: "내 노트", href: "/archive/notes", icon: "notebook" },
      { label: "구독 목록", href: "/archive/purchases", icon: "bookmark" },
      { label: "전략 분석", href: "/archive/analysis", icon: "chart" },
    ],
  },
];

/**
 * 모든 화면 공통 상단 바. 로고·메뉴 위치와 크기를 화면마다 같게 유지하려고 한 곳에서만 그린다.
 * 스타일은 globals.css 의 .gnb
 * - tone="dark": 랜딩처럼 검은 바탕 위 (위치·크기는 같고 색만 다름)
 * - right: 오른쪽 칸을 바꿀 때 (기본은 알림·닉네임·사진 / 로그인)
 * - title: 로그인 · 회원가입처럼 메뉴 대신 로고 옆에 화면 이름 (시안: "TRACKIT | 회원가입"). 주면 메뉴는 안 보임
 * - menu={false}: 가운데 메뉴를 숨긴다 (칸은 남겨서 로고·오른쪽 위치는 그대로)
 */
export default function SiteHeader({ active = null, tone, right, menu = true, title }: { active?: Active; tone?: "dark"; right?: React.ReactNode; menu?: boolean; title?: string }) {
  return (
    <header className={`gnb${tone === "dark" ? " gnb-dark" : ""}${title !== undefined || !menu ? " gnb-auth" : ""}`}>
      <Link className="gnb-brand" href="/" aria-label="TRACKIT 홈">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-mark" src="/home/brand.png" alt="" width={32} height={32} />
        TRACKIT
      </Link>
      {title !== undefined ? (
        <span className="gnb-title">{title}</span>
      ) : menu ? (
        <nav className="gnb-main" aria-label="주요 메뉴">
          {MENU.map((m) =>
            m.sub ? (
              <div key={m.key} className="gnb-drop">
                <Link className={active === m.key ? "active" : ""} href={m.href} data-label={m.label}>
                  <span className="gnb-drop-label">{m.label}<ChevronDown size={15} aria-hidden="true" /></span>
                </Link>
                <HeaderDropdown label={m.label} items={m.sub} />
              </div>
            ) : (
              <Link key={m.key} className={active === m.key ? "active" : ""} href={m.href} data-label={m.label} aria-current={active === m.key ? "page" : undefined}>
                {m.label}
              </Link>
            ),
          )}
        </nav>
      ) : (
        <span className="gnb-main" aria-hidden />
      )}
      <nav className="gnb-account" aria-label="계정 메뉴">
        {right ?? <AccountChip />}
      </nav>
    </header>
  );
}
