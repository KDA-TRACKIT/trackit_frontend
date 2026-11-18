import Link from "next/link";
import AccountChip from "./AccountChip";

type Active = "home" | "fortrade" | "archive" | "marketplace" | null;

type Menu = { key: Exclude<Active, null>; label: string; href: string; sub?: { label: string; href?: string; desc?: string }[] };
const MENU: Menu[] = [
  { key: "home", label: "홈", href: "/" },
  {
    key: "fortrade",
    label: "FOR TRADE",
    href: "/workshop",
    // 매매할 때 보는 화면 두 개: 트레이딩 로그(차트·기록) + 증시 캘린더(/insights, 안에서 탭)
    sub: [
      { label: "트레이딩 로그", href: "/workshop", desc: "차트 분석 · 매매 기록" },
      { label: "증시 캘린더", href: "/insights", desc: "시장 · 뉴스 · 거시경제 · 공시" },
    ],
  },
  { key: "marketplace", label: "전략 쇼핑", href: "/marketplace" },
  {
    key: "archive",
    label: "아카이브",
    href: "/archive",
    // 아카이브 드롭다운: 내 전략 · 구매한 전략 · 전략 분석 (전체 기록 · AI 전략 만들기는 아카이브 첫 화면에서)
    sub: [
      { label: "내 전략", href: "/archive/mine", desc: "만들고 판매하는 전략" },
      { label: "구매한 전략", href: "/archive/purchases", desc: "결제한 전략" },
      { label: "전략 분석", href: "/archive/analysis", desc: "연 전략의 트레이더 비교" },
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
        TRACKIT
      </Link>
      {title !== undefined ? (
        <span className="gnb-title">{title}</span>
      ) : menu ? (
        <nav className="gnb-main" aria-label="주요 메뉴">
          {MENU.map((m) =>
            m.sub ? (
              <div key={m.key} className="gnb-drop">
                <Link className={active === m.key ? "active" : ""} href={m.href} data-label={m.label} aria-current={active === m.key ? "page" : undefined} aria-haspopup="true">
                  {m.label}
                </Link>
                <div className="gnb-drop-menu" role="menu" aria-label={m.label}>
                  {m.sub.map((s) =>
                    s.href ? (
                      <Link key={s.label} href={s.href} role="menuitem">
                        <b>{s.label}</b>
                        {s.desc && <small>{s.desc}</small>}
                      </Link>
                    ) : (
                      <span key={s.label} role="menuitem" aria-disabled="true" className="soon">
                        <b>{s.label}</b>
                        {s.desc && <small>{s.desc}</small>}
                      </span>
                    ),
                  )}
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
