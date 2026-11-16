"use client";
// 상단 바 오른쪽: 로그인했으면 프로필 사진 + 닉네임, 아니면 로그인 버튼
// 브라우저의 Supabase 세션(공개 URL·anon key)에서 프로필만 읽는다
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../lib/supabase-browser";

type Profile = { name: string; avatar: string | null };

/** 소셜 로그인마다 이름·사진 필드가 달라서 있는 것을 고른다 */
function profileOf(user: User): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((k) => meta[k]).find((v): v is string => typeof v === "string" && v.trim() !== "");
  const name = pick("nickname", "name", "full_name", "user_name", "preferred_username") ?? user.email?.split("@")[0] ?? "내 계정";
  return { name, avatar: pick("avatar_url", "picture") ?? null };
}

const nicknameSegmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });

export default function AccountChip() {
  const [profile, setProfile] = useState<Profile | null>(null);
  // Supabase 설정이 없으면 기다릴 세션이 없으니 바로 로그인 버튼
  const [ready, setReady] = useState(() => getSupabaseBrowser() === null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setProfile(data.session ? profileOf(data.session.user) : null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setProfile(session ? profileOf(session.user) : null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <span className="gnb-chip gnb-chip-loading" aria-hidden />;
  if (!profile)
    return (
      <Link className="gnb-chip" href="/login">
        로그인
      </Link>
    );
  const nicknameCharacters = Array.from(nicknameSegmenter.segment(profile.name), ({ segment }) => segment);
  const displayName = nicknameCharacters.length > 4 ? nicknameCharacters.slice(0, 3).join("") + "..." : profile.name;

  return (
    <Link className="gnb-chip" href="/login" title={profile.name}>
      {profile.avatar ? (
        // 소셜 프로필 사진(외부 주소)이라 next/image 대신 img
        // eslint-disable-next-line @next/next/no-img-element
        <img className="gnb-avatar" src={profile.avatar} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="gnb-avatar gnb-avatar-empty" aria-hidden>
          {profile.name.slice(0, 1)}
        </span>
      )}
      <span className="gnb-name">{displayName}</span>
    </Link>
  );
}
