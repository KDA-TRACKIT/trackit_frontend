"use client";
// 로그인 전에는 소개 첫 화면(/) · 로그인 · 가입 · 아이디/비밀번호 찾기 · 인증 콜백만 열림
//   그 밖의 화면(트레이딩 로그 · 증시 캘린더 · 전략 마켓 · 전략보관함 · 마이페이지 · 결제 …)은 로그인 화면으로 보냄
//   세션을 확인하는 동안에는 막힌 화면 내용을 그리지 않음 (잠깐 보였다 사라지지 않게)
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useProfile } from "./AccountChip";

const PUBLIC = ["/", "/intro", "/login", "/signup", "/find-id", "/reset-password", "/auth"];
const isPublic = (path: string) => PUBLIC.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)));

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  const router = useRouter();
  const { profile, ready } = useProfile();
  const open = isPublic(path);
  const blocked = !open && ready && !profile;

  useEffect(() => {
    if (blocked) router.replace("/login");
  }, [blocked, router]);

  if (open || (ready && profile)) return <>{children}</>;
  return <main className="auth-gate" aria-busy="true" />;
}
