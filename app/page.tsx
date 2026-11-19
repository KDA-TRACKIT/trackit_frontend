"use client";
// 첫 화면: 로그인 전이면 소개 페이지(intro 브랜치의 /intro), 로그인했으면 홈 대시보드
//   예전 랜딩(Landing.tsx)은 지금 안 씀
import { useProfile } from "./AccountChip";
import HomeDashboard from "./HomeDashboard";
import HomeInvestmentPrompt from "./HomeInvestmentPrompt";
import HomePolicies from "./HomePolicies";
import Intro from "./intro/Intro";
import "./intro/intro.css";

export default function Home() {
  const { profile, ready } = useProfile();
  if (!ready) return <main className="home" />;
  return profile ? <>
    <HomeDashboard />
    {!profile.hasInvestment && <HomeInvestmentPrompt key={`${profile.userId}:${profile.lastSignInAt}`} userId={profile.userId} lastSignInAt={profile.lastSignInAt} />}
  </> : <>
    <Intro />
    <footer><HomePolicies /></footer>
  </>;
}
