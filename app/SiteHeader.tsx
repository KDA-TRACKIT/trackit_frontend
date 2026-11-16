import Link from "next/link";
import AccountChip from "./AccountChip";

type Active = "home" | "fortrade" | "archive" | "marketplace" | null;

type Menu = { key: Exclude<Active, null>; label: string; href: string; sub?: { label: string; href: string; desc: string }[] };
const MENU: Menu[] = [
  { key: "home", label: "홈", href: "/" },
  {
    key: "fortrade",
    label: "FOR TRADE",
    href: "/workshop",
    // 매매할 때 보는 화면 두 개: 트레이딩 로그(차트·기록) + 증시 캘린더(/insights, 안에서 탭)
    sub: [
      { label: "트레이딩 로그", href: "/workshop", desc: "차트 분석 · 매매 기록" },
      { label: "증시 캘린더", href: "/insights", desc: "시장 · 뉴스 · 거시경제 · 공시 · 매매 캘린더" },
    ],
  },
  { key: "marketplace", label: "전략 쇼핑", href: "/marketplace" },
  { key: "archive", label: "아카이브", href: "/archive" },
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
          {MENU.map((m) =>
            m.sub ? (
              <div key={m.key} className="gnb-drop">
                <Link className={active === m.key ? "active" : ""} href={m.href} data-label={m.label} aria-current={active === m.key ? "page" : undefined} aria-haspopup="true">
                  {m.label}
                </Link>
                <div className="gnb-drop-menu" role="menu" aria-label={m.label}>
                  {m.sub.map((s) => (
                    <Link key={s.href} href={s.href} role="menuitem">
                      <b>{s.label}</b>
                      <small>{s.desc}</small>
                    </Link>
                  ))}
                </div>
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
