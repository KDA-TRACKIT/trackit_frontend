// 회원가입 · 아이디 찾기 · 비밀번호 찾기. 가입·메일 발송은 백엔드(/auth/*)가 Supabase Auth 로 처리한다.
// 새 비밀번호 저장만 브라우저에서: 재설정 메일 링크로 받은 세션(본인 것)으로 Supabase 에 직접 바꾼다 (anon key 만 사용)
import { getSupabaseBrowser } from "../supabase-browser";
import { apiRequest } from "./client";

type Session = { access_token: string; refresh_token: string };

/** 가입. 메일 확인을 켜 둔 프로젝트면 session 이 없고 확인 메일이 간다 */
export async function signUp(input: { email: string; password: string; nickname: string; username?: string }) {
  const data = await apiRequest<{ session: Session | null; requiresEmailConfirmation: boolean }>("/auth/signup", {
    method: "POST",
    auth: false,
    body: JSON.stringify(input),
  });
  if (data.session) {
    const supabase = getSupabaseBrowser();
    if (supabase) await supabase.auth.setSession(data.session);
  }
  return { loggedIn: !!data.session, requiresEmailConfirmation: data.requiresEmailConfirmation };
}

/** 아이디 찾기: 가입 때 적은 이름 + 이메일 → 가운데를 가린 아이디 (맞는 계정이 없으면 found=false) */
export async function findId(name: string, email: string) {
  return apiRequest<{ found: boolean; username?: string | null; google?: boolean }>("/auth/find-id", { method: "POST", auth: false, body: JSON.stringify({ name, email }) });
}

/** 아이디를 쓸 수 있는지 (형식 · 중복) */
export async function checkUsername(u: string) {
  return apiRequest<{ valid: boolean; available: boolean }>(`/auth/username?u=${encodeURIComponent(u)}`, { auth: false });
}

/** 비밀번호 재설정 메일 요청. 아이디를 함께 주면 그 아이디의 이메일일 때만 (어느 경우든 같은 응답) */
export async function requestPasswordReset(email: string, username?: string) {
  await apiRequest<{ sent: boolean }>("/auth/password/reset", { method: "POST", auth: false, body: JSON.stringify({ email, ...(username ? { username } : {}) }) });
}

/**
 * 재설정 메일 링크로 들어온 경우 세션을 잡는다. 링크는 #access_token=…&type=recovery 또는 ?code=… 형태
 * 반환: 세션을 잡았으면 true
 */
export async function startRecoverySession(): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return false;
  const code = new URLSearchParams(window.location.search).get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const access_token = hash.get("access_token");
  const refresh_token = hash.get("refresh_token");
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    // 주소창에 토큰이 남지 않게
    window.history.replaceState(null, "", window.location.pathname);
    return !error;
  }
  // 메일 링크 없이 들어오면(로그인만 된 상태 포함) 바꾸지 못하게 한다
  return false;
}

/** 새 비밀번호 저장 (재설정 링크로 잡은 세션 필요) */
export async function updatePassword(password: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(/same|different from the old/i.test(error.message) ? "이전과 다른 비밀번호를 입력해 주세요." : error.message);
}
