"use client";
// 첫 화면: 로그인 전이면 랜딩(시작 화면), 로그인했으면 홈 대시보드
import { useProfile } from "./AccountChip";
import HomeDashboard from "./HomeDashboard";
import Landing from "./Landing";

export default function Home() {
  const { profile, ready } = useProfile();
  if (!ready) return <main className="home" />;
  return profile ? <HomeDashboard /> : <Landing />;
}
