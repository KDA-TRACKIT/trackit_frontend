"use client";
// 마이페이지 첫 화면: 프로필 · 활동 이력 · 신뢰도 점수 · 판매 · 구매 요약
import Link from "next/link";
import { useMypage, metaText } from "./context";
import { useActivity } from "./data";
import { Card, PageHead, Stat } from "./ui";
import { ProfileAvatar } from "./profile/ProfileAvatar";
import { useBusiness } from "./business/state";
import { useSeller, won } from "./sales/data";
import { usePasses } from "../../lib/purchases";

export default function MyPage() {
  const { profile, meta, user } = useMypage();
  const { trades, records, symbols } = useActivity();
  const handle = metaText(meta, "handle") || user.email?.split("@")[0] || "";
  const bio = metaText(meta, "bio");
  const business = useBusiness(user.id) !== null;
  const { strategies, totals } = useSeller();
  const passes = usePasses();
  const SALES = [
    { title: "전략 관리", value: `${strategies?.length ?? 0}개`, href: "/mypage/sales/strategies" },
    { title: "판매 내역", value: `${totals.count}건`, href: "/mypage/sales/history" },
    { title: "정산 예정 금액", value: won(totals.pending), href: "/mypage/sales/settlements" },
    { title: "구매 내역", value: `${passes.filter((p) => p.used).length}개 열람 중`, href: "/mypage/purchases" },
  ];

  return (
    <>
      <PageHead title="마이페이지" />
      <Card>
        <div className="mp-profile">
          <ProfileAvatar size={76} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{profile.name}</h2>
            <span className="id">
              @{handle}
              <em className={business ? "mp-badge biz" : "mp-badge"}>{business ? "비즈니스" : "개인"}</em>
            </span>
            {bio ? <p className="bio">{bio}</p> : <Link className="bio empty" href="/mypage/profile">+ 소개 추가</Link>}
          </div>
          <Link className="mp-btn" href="/mypage/profile">
            프로필 수정
          </Link>
        </div>
      </Card>

      <div className="mp-grid-2">
        <Card title="활동 이력" action={<Link className="mp-link" href="/mypage/activity">전체 보기 ›</Link>}>
          <div className="mp-stats">
            <Stat label="매매" value={trades.length} unit="회" />
            <Stat label="메모" value={records.length} unit="건" />
            <Stat label="거래 종목" value={symbols.length} unit="개" />
          </div>
          {symbols.length > 0 && (
            <div className="mp-tags">
              {symbols.slice(0, 8).map((s) => (
                <span key={s}>{s}</span>
              ))}
              {symbols.length > 8 && <span className="more">+{symbols.length - 8}</span>}
            </div>
          )}
        </Card>
        <Card title="신뢰도 점수" action={<Link className="mp-link" href="/mypage/trust">자세히 ›</Link>}>
          <strong className="mp-big-muted">평가 대기</strong>
          <Link className="mp-tag" href="/mypage/account/privacy">
            활용 동의 필요
          </Link>
        </Card>
      </div>

      <Card title="판매 · 구매 관리">
        <div className="mp-quad">
          {SALES.map((s) => (
            <Link key={s.title} href={s.href}>
              <span>{s.title}</span>
              <strong>{s.value}</strong>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
