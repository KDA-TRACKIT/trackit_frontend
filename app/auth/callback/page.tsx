"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("로그인 처리 중입니다...");
  useEffect(() => {
    const run = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) { setMessage("Supabase 환경변수가 설정되지 않았습니다."); return; }
      const code = new URLSearchParams(window.location.search).get("code");
      let error;
      if (code) {
        ({ error } = await supabase.auth.exchangeCodeForSession(code));
      } else {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (!accessToken || !refreshToken) { setMessage("Google 로그인 토큰이 없습니다. 다시 시도해주세요."); return; }
        ({ error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
      }
      if (error) { setMessage(`로그인에 실패했습니다: ${error.message}`); return; }
      // 방금 Google 로 처음 가입한 계정이면 가입 마무리(닉네임·생년월일·약관)로. 예전 계정은 그대로 홈으로
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const isNew = !!user && Date.now() - new Date(user.created_at).getTime() < 10 * 60 * 1000;
      if (user && isNew && user.app_metadata?.provider === "google" && user.user_metadata?.signup_completed !== true) {
        window.location.replace("/signup/complete");
        return;
      }
      window.location.replace("/");
    };
    void run();
  }, []);
  return <main className="auth-callback"><p>{message}</p></main>;
}
