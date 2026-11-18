"use client";
// Google 로 가입한 사람이 닉네임 · 생년월일 · 성별을 아직 안 넣었으면(DB 기준) 어느 화면을 열든 가입 마무리로 보냄
//   예전 Google 가입은 이 값들을 DB 에 안 넣어서, 이미 로그인해 있는 사람도 한 번은 다시 받아야 함
//   로그인 · 회원가입 · 인증 화면에서는 보내지 않음. 탭마다 한 번만 확인 (sessionStorage)
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowser } from "../lib/supabase-browser";
import { apiRequest } from "../lib/api/client";

const SKIP = /^\/(signup|login|auth|find-id|reset-password|payments)(\/|$)/;
const DONE = "trackit:profile-gate";

export default function ProfileGate() {
  const path = usePathname();
  useEffect(() => {
    if (SKIP.test(path) || sessionStorage.getItem(DONE)) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || user.app_metadata?.provider !== "google") return;
      const me = await apiRequest<{ nickname: string | null; gender: string | null; birthDate: string | null }>("/me").catch(() => null);
      if (cancelled || !me) return;
      if (!me.nickname || !me.gender || !me.birthDate) window.location.replace("/signup/complete");
      else sessionStorage.setItem(DONE, "1");
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);
  return null;
}
