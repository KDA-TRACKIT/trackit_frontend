"use client";
// 마이페이지 틀: 상단 바 + 왼쪽 메뉴 + 오른쪽 내용. 로그인 전이면 로그인 안내
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import Sidebar from "./Sidebar";
import { MypageProvider, useSupabaseUser } from "./context";
import "./mypage.css";

export default function MypageLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, setUser } = useSupabaseUser();
  return (
    <main className="mp">
      <SiteHeader />
      <div className="mp-shell">
        <Sidebar />
        <div className="mp-content">
          {!ready ? (
            <div className="mp-skel" aria-busy="true" aria-label="불러오는 중">
              <span />
              <span />
              <span />
            </div>
          ) : !user ? (
            <section className="mp-card">
              <p className="mp-muted">
                로그인이 필요해요. <Link href="/login">로그인</Link>
              </p>
            </section>
          ) : (
            <MypageProvider user={user} onUser={setUser}>
              {children}
            </MypageProvider>
          )}
        </div>
      </div>
    </main>
  );
}
