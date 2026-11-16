// 백엔드 API 공통 호출. 컴포넌트는 fetch를 직접 부르지 않고 lib/api/* 함수나 hooks/* 를 쓴다.
// 브라우저에 두는 값은 NEXT_PUBLIC_API_URL, Supabase public URL·anon key 뿐이다 (AI·Redis·MCP·증권사 비밀값 없음).
import { getSupabaseBrowser } from "../supabase-browser";
import { apiBase } from "../api-url";

export const API_URL = apiBase();

/** 실제 API가 아직 없으면 mock 어댑터. NEXT_PUBLIC_AI_API=http 면 백엔드 /ai, /trading 을 부른다 */
export const USE_MOCK_TRADING = process.env.NEXT_PUBLIC_AI_API !== "http";

const STATUS_MESSAGE: Record<number, string> = {
  401: "로그인이 필요해요.",
  403: "이 작업을 할 권한이 없어요.",
  404: "데이터를 찾을 수 없어요.",
  409: "이미 처리됐거나 진행 중인 작업이에요.",
  422: "입력값을 확인해 주세요.",
  429: "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.",
  500: "서버 오류가 났어요. 잠시 뒤 다시 시도해 주세요.",
  503: "AI 분석 서버가 지금 꺼져 있어요. (AI·큐·워커 비활성)",
};

/** 백엔드 공통 에러 { error: { code, message } } */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 화면에 보여줄 문장. 서버 메시지를 우선하고 없으면 상태코드별 기본 문장 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || STATUS_MESSAGE[error.status] || "요청에 실패했어요.";
  if (error instanceof TypeError) return "백엔드에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요.";
  return error instanceof Error ? error.message : "요청에 실패했어요.";
}

/** 로그인 토큰 (Supabase 세션). 없으면 null */
export async function accessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** { data } 를 벗겨서 돌려준다. 실패하면 ApiError */
export async function apiRequest<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, ...rest } = init;
  const token = auth ? await accessToken() : null;
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...rest,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...rest.headers },
  });
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !body || !("data" in body)) {
    const status = res.ok ? 500 : res.status;
    throw new ApiError(status, body?.error?.code ?? `HTTP_${status}`, body?.error?.message ?? STATUS_MESSAGE[status] ?? `HTTP ${status}`);
  }
  return body.data as T;
}
