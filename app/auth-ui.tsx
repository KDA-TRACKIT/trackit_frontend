"use client";
// 로그인·회원가입 공통: Google 로고, Google OAuth 시작, 가입 때 받은 추가 정보(이름·성별·생년월일) 보관
// 백엔드 /auth/signup 은 email·password·nickname 만 받아서, 나머지는 Supabase user_metadata 에 본인 세션으로 저장한다
import { getSupabaseBrowser } from "../lib/supabase-browser";

export function GoogleIcon({ size = 24 }: { size?: number }) {
  return (
    <span className="auth-google-asset" style={{ width: size, height: size }} aria-hidden="true"><img src="/auth/google.svg" alt="" style={{ transform: `scale(${size / 43.1408})` }} /></span>
  );
}

/** 백엔드에서 Google 인증 주소를 받아 이동 (로그인·가입 같은 흐름. 처음이면 /auth/callback 에서 가입 마무리로 보냄) */
export async function startGoogle() {
  // 지금 연 주소(localhost 또는 같은 와이파이의 IP)로 돌아오게 알려 준다
  // 로그인 시작 요청도 현재 접속한 프론트 origin으로 보낸다.
  // Next rewrite가 백엔드(192.168.1.11:3000)로 전달하므로 오래된 .30 API 주소를 타지 않는다.
  const response = await fetch(`/api/v1/auth/oauth/google?origin=${encodeURIComponent(window.location.origin)}`);
  const body = await response.json();
  if (!response.ok || !body?.data?.authorizationUrl) throw new Error(body?.error?.message ?? "Google 로그인 준비에 실패했습니다.");
  // 백엔드에 예전 프론트 주소가 남아 있어도, 로그인 버튼을 누른 현재 origin으로 돌아온다.
  const authorizationUrl = new URL(body.data.authorizationUrl);
  authorizationUrl.searchParams.set("redirect_to", `${window.location.origin}/auth/callback`);
  window.location.assign(authorizationUrl.toString());
}

export type ExtraProfile = { name?: string; gender?: "male" | "female"; birthdate?: string };
const PENDING = "trackit:pending-profile";

/** 메일 확인 때문에 가입 직후 세션이 없으면, 첫 로그인 때 넣으려고 이 브라우저에 잠시 둔다 */
export function stashExtraProfile(email: string, extra: ExtraProfile) {
  localStorage.setItem(PENDING, JSON.stringify({ email: email.toLowerCase(), extra }));
}

/** 로그인 직후: 보관해 둔 추가 정보가 이 계정 것이면 user_metadata 에 넣고 지운다 */
export async function applyStashedProfile(email: string) {
  const raw = localStorage.getItem(PENDING);
  if (!raw) return;
  try {
    const { email: saved, extra } = JSON.parse(raw) as { email: string; extra: ExtraProfile };
    if (saved !== email.toLowerCase()) return;
    await getSupabaseBrowser()?.auth.updateUser({ data: { ...extra, signup_completed: true } });
    localStorage.removeItem(PENDING);
  } catch {
    // 다음 로그인 때 다시 시도
  }
}
