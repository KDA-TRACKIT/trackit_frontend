"use client";
// 마이페이지 첫 화면 (시안 2026-11-18): 프로필 · 활동 이력 · 나의 이행률 · 판매 관리
import Link from "next/link";
import { useMypage, metaText } from "./context";
import { useActivity } from "./data";
import { Card, PageHead } from "./ui";
import { ProfileAvatar } from "./profile/ProfileAvatar";
import { useBusiness } from "./business/state";
import { useSeller } from "./sales/data";

export default function MyPage() {
  const { profile, meta, user } = useMypage();
  const { trades, records, symbols } = useActivity();
  const handle = metaText(meta, "handle") || user.email?.split("@")[0] || "";
  const bio = metaText(meta, "bio");
  const businessState = useBusiness(user.id);
  const business = businessState !== null && businessState.status !== "pending";
  const { totals } = useSeller();
  const num = (n: number, unit: string, ready = true) => (
    <strong>
      {ready && n > 0 ? n.toLocaleString("ko-KR") : "—"} <small>{unit}</small>
    </strong>
  );
  // 시안(2026-11-19): 공개 전략 · 유료 열람권 · 판매 내역 · 정산 내역 4칸
  const SALES = [
    { title: "공개 전략", sub: "무료 열람", href: "/mypage/sales/strategies" },
    { title: "유료 열람권", sub: "열람권 관리", href: "/mypage/sales" },
    { title: "판매 내역", sub: totals.count ? `판매 기록 ${totals.count}건` : "판매 기록", href: "/mypage/sales/history" },
    { title: "정산 내역", sub: "정산 기록", href: "/mypage/sales/settlements" },
  ];

  return (
    <>
      <PageHead title="마이페이지" desc="나의 활동과 전략 판매 현황을 한눈에 확인하세요." />
      <Card>
        <div className="mp-profile">
          <ProfileAvatar size={76} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{profile.name}</h2>
            <span className="id">
              @{handle} · {business ? "비즈니스 프로필" : "투자자 프로필"}
            </span>
            <small className="mp-profile-label">프로필 소개</small>
            {bio ? <p className="bio">{bio}</p> : <Link className="bio empty" href="/mypage/profile">+ 소개 추가</Link>}
          </div>
          <Link className="mp-btn primary" href="/mypage/profile">
            프로필 수정
          </Link>
        </div>
      </Card>

      <div className="mp-grid-2 mp-home-grid">
        <Card title="활동 이력" desc="나의 매매 활동과 작성 기록">
          <div className="mp-home-stats">
            <div>
              <span>매매 횟수</span>
              {num(trades.length, "회")}
            </div>
            <div>
              <span>메모 개수</span>
              {num(records.length, "건")}
            </div>
            <div>
              <span>거래 종목</span>
              {num(symbols.length, "종목")}
            </div>
          </div>
          <div className="mp-home-symbols">
            <b>거래한 종목</b>
            {symbols.length ? (
              <div className="mp-tags">
                {symbols.slice(0, 8).map((s) => (
                  <span key={s}>{s}</span>
                ))}
                {symbols.length > 8 && <span className="more">+{symbols.length - 8}</span>}
              </div>
            ) : (
              <span className="mp-pill-muted">거래 내역 등록 후 종목명이 표시됩니다</span>
            )}
          </div>
        </Card>
        <Card title="나의 이행률" desc="전략의 신뢰도를 확인하는 지표">
          <strong className="mp-home-rate">{business ? "산출 준비 중이에요." : "비즈니스 계정 전환 시 산출됩니다."}</strong>
          <p className="mp-home-rate-desc">
            사전·사후 기록 비율, 저장 이력 및
            <br />
            전략 평가 점수로 구성됩니다.
          </p>
          <div className="mp-home-consent">
            <Link className="mp-tag-warn" href="/mypage/account">
              추가 동의 필요
            </Link>
            <small>신뢰도 산출 및 공개에 대한 별도 동의 후 이용할 수 있습니다.</small>
          </div>
        </Card>
      </div>

      <Card title="판매 관리" desc="내 전략의 공개·유료 열람권과 판매 내역을 관리합니다.">
        <div className="mp-home-sales">
          {SALES.map((s) => (
            <div key={s.title}>
              <strong>{s.title}</strong>
              <span>{s.sub}</span>
              <Link href={s.href}>조회하기 →</Link>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
