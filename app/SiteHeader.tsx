import Link from "next/link";
import AccountChip from "./AccountChip";

type Active = "home" | "workshop" | "archive" | "marketplace" | null;

const MENU: { key: Exclude<Active, null>; label: string; href: string }[] = [
  { key: "home", label: "홈", href: "/" },
  { key: "workshop", label: "트레이딩 로그", href: "/workshop" },
  { key: "archive", label: "아카이브", href: "/archive" },
  { key: "marketplace", label: "전략 쇼핑", href: "/marketplace" },
];

/**
 * 모든 화면 공통 상단 바. 로고·메뉴 위치와 크기를 화면마다 같게 유지하려고 한 곳에서만 그린다.
 * 스타일은 globals.css 의 .gnb
 * - tone="dark": 랜딩처럼 검은 바탕 위 (위치·크기는 같고 색만 다름)
 * - right: 오른쪽 칸을 바꿀 때 (기본은 알림·닉네임·사진 / 로그인)
 * - menu={false}: 가운데 메뉴를 숨긴다 (칸은 남겨서 로고·오른쪽 위치는 그대로)
 */
export default function SiteHeader({ active = null, tone, right, menu = true }: { active?: Active; tone?: "dark"; right?: React.ReactNode; menu?: boolean }) {
  return (
    <header className={tone === "dark" ? "gnb gnb-dark" : "gnb"}>
      <Link className="gnb-brand" href="/" aria-label="TRACKIT 홈">
        TRACKIT
      </Link>
      {menu ? (
        <nav className="gnb-main" aria-label="주요 메뉴">
          {MENU.map((m) => (
            <Link key={m.key} className={active === m.key ? "active" : ""} href={m.href} aria-current={active === m.key ? "page" : undefined}>
              {m.label}
            </Link>
          ))}
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
