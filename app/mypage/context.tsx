"use client";
// 마이페이지 공통: 로그인한 Supabase 사용자와 user_metadata 읽기·쓰기
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../../lib/supabase-browser";
import { profileOf, type Profile } from "../AccountChip";

type Ctx = { user: User; profile: Profile; meta: Record<string, unknown>; saveMeta: (patch: Record<string, unknown>) => Promise<void> };
const MypageContext = createContext<Ctx | null>(null);

export function useMypage() {
  const ctx = useContext(MypageContext);
  if (!ctx) throw new Error("useMypage 는 마이페이지 안에서만 써요");
  return ctx;
}

/** 로그인 사용자 (없으면 null). ready = 세션 확인을 마쳤는지 */
export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => getSupabaseBrowser() === null);
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready, setUser };
}

/** user_metadata 일부를 바꾼다 (Supabase 가 기존 값과 합친다) */
export async function updateMeta(patch: Record<string, unknown>) {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  const { data, error } = await supabase.auth.updateUser({ data: patch });
  if (error) throw new Error(error.message);
  return data.user;
}

export function MypageProvider({ user, onUser, children }: { user: User; onUser: (u: User) => void; children: React.ReactNode }) {
  const saveMeta = useCallback(
    async (patch: Record<string, unknown>) => {
      const next = await updateMeta(patch);
      if (next) onUser(next);
    },
    [onUser],
  );
  return <MypageContext.Provider value={{ user, profile: profileOf(user), meta: (user.user_metadata ?? {}) as Record<string, unknown>, saveMeta }}>{children}</MypageContext.Provider>;
}

/** 메타데이터에서 글자 값 */
export function metaText(meta: Record<string, unknown>, key: string) {
  const v = meta[key];
  return typeof v === "string" ? v : "";
}
