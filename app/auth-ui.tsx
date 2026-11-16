"use client";
// 로그인·회원가입 공통: Google 로고, Google OAuth 시작, 가입 때 받은 추가 정보(이름·성별·생년월일) 보관
// 백엔드 /auth/signup 은 email·password·nickname 만 받아서, 나머지는 Supabase user_metadata 에 본인 세션으로 저장한다
import { getSupabaseBrowser } from "../lib/supabase-browser";
import { API_URL } from "../lib/api/client";

export function GoogleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** 백엔드에서 Google 인증 주소를 받아 이동 (로그인·가입 같은 흐름. 처음이면 /auth/callback 에서 가입 마무리로 보냄) */
export async function startGoogle() {
  // 지금 연 주소(localhost 또는 같은 와이파이의 IP)로 돌아오게 알려 준다
  const response = await fetch(`${API_URL}/api/v1/auth/oauth/google?origin=${encodeURIComponent(window.location.origin)}`);
  const body = await response.json();
  if (!response.ok || !body?.data?.authorizationUrl) throw new Error(body?.error?.message ?? "Google 로그인 준비에 실패했습니다.");
  window.location.assign(body.data.authorizationUrl);
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
