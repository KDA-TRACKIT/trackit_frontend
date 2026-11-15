import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

/**
 * 지금 로그인한 사용자 id (Supabase 가 localStorage 에 둔 세션에서 바로 읽음, 네트워크 없음). 로그아웃이면 null
 * 화면 설정처럼 이 브라우저에 두는 값을 사용자별로 나눌 때 쓴다
 */
export function currentUserIdSync(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const session = key ? (JSON.parse(localStorage.getItem(key) ?? "null") as { user?: { id?: string } } | null) : null;
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** 사용자별 localStorage 키: 로그인했으면 `${base}:u:${id}`, 아니면 base (손님) */
export function userStorageKey(base: string): string {
  const id = currentUserIdSync();
  return id ? `${base}:u:${id}` : base;
}

/** 사용자별 값 읽기. 로그인 사용자의 값이 아직 없으면 손님(예전) 값을 한 번 이어받는다 */
export function readUserStorage(base: string): string | null {
  if (typeof window === "undefined") return null;
  const key = userStorageKey(base);
  return localStorage.getItem(key) ?? (key !== base ? localStorage.getItem(base) : null);
}
