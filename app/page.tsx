"use client";
// 첫 화면: 로그인 전이면 소개 페이지(intro 브랜치의 /intro), 로그인했으면 홈 대시보드
//   예전 랜딩(Landing.tsx)은 지금 안 씀
import { useProfile } from "./AccountChip";
import HomeDashboard from "./HomeDashboard";
import HomeBeeGuide from "./HomeBeeGuide";
import HomeInvestmentPrompt from "./HomeInvestmentPrompt";
import HomePolicies from "./HomePolicies";
import Intro from "./intro/Intro";
import "./intro/intro.css";

export default function Home() {
  const { profile, ready } = useProfile();
  if (!ready) return <main className="home" />;
  return profile ? <>
    <HomeDashboard />
    {/* 가입하고 처음 로그인한 사람에게만 꿀벌이 저절로 기능 안내 (투자 정보 팝업이 닫힌 뒤). 그 밖엔 오른쪽 아래 꿀벌을 눌러야 뜸 */}
    <HomeBeeGuide userId={profile.userId} createdAt={profile.createdAt} seen={profile.beeGuideSeen} />
    {!profile.hasInvestment && <HomeInvestmentPrompt key={`${profile.userId}:${profile.lastSignInAt}`} userId={profile.userId} lastSignInAt={profile.lastSignInAt} />}
  </> : <>
    <Intro />
    <footer><HomePolicies /></footer>
  </>;
}
