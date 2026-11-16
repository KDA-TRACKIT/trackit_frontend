"use client";
// 상단 바 오른쪽: 로그인했으면 프로필 사진 + 닉네임 (누르면 마이페이지 · 로그아웃 메뉴), 아니면 로그인 버튼
// 브라우저의 Supabase 세션(공개 URL·anon key)에서 프로필만 읽는다
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../lib/supabase-browser";
import ThemeSwitch from "./ThemeSwitch";
import { useNotifications } from "../lib/notifications";

export type Profile = {
  name: string;
  email: string | null;
  avatar: string | null;
};

/** 소셜 로그인마다 이름·사진 필드가 달라서 있는 것을 고른다 */
export function profileOf(user: User): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) =>
    keys
      .map((k) => meta[k])
      .find((v): v is string => typeof v === "string" && v.trim() !== "");
  const name =
    pick("nickname", "name", "full_name", "user_name", "preferred_username") ??
    user.email?.split("@")[0] ??
    "내 계정";
  return {
    name,
    email: user.email ?? null,
    avatar: pick("avatar_url", "picture") ?? null,
  };
}

/** 로그인한 사용자 프로필 (없으면 null). ready = 세션 확인을 마쳤는지 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  // Supabase 설정이 없으면 기다릴 세션이 없으니 바로 끝
  const [ready, setReady] = useState(() => getSupabaseBrowser() === null);
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setProfile(data.session ? profileOf(data.session.user) : null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setProfile(session ? profileOf(session.user) : null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return { profile, ready };
}

export async function signOut() {
  await getSupabaseBrowser()?.auth.signOut();
  window.location.assign(window.location.origin); // 홈으로 (세션이 지워진 상태로 새로 그림)
}

export function Avatar({
  profile,
  size = 28,
}: {
  profile: Profile;
  size?: number;
}) {
  return profile.avatar ? (
    // 소셜 프로필 사진(외부 주소)이라 next/image 대신 img
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="gnb-avatar"
      src={profile.avatar}
      alt=""
      referrerPolicy="no-referrer"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="gnb-avatar gnb-avatar-empty"
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {profile.name.slice(0, 1)}
    </span>
  );
}

/** 알림 종: 판매(내 전략을 누가 샀을 때) + 즐겨찾기한 트레이더의 새 전략 (lib/notifications) */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [prevSeen, setPrevSeen] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { items, unread, markSeen, favorites } = useNotifications(true);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const toggle = () => {
    if (!open) {
      // 연 순간까지 안 읽은 것은 이번에 열린 목록에서 "새" 로 보여 주고, 읽음 처리
      setPrevSeen(localStorage.getItem("trackit:noti-seen") ?? "");
      markSeen();
    }
    setOpen(!open);
  };
  return (
    <div className="gnb-bell-box" ref={ref}>
      <button type="button" className="gnb-bell" aria-label={unread ? `알림 ${unread}개 새로 옴` : "알림"} aria-expanded={open} onClick={toggle}>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="gnb-bell-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="gnb-menu gnb-bell-menu" role="menu" aria-label="알림">
          <div className="gnb-bell-head">
            <strong>알림</strong>
            <small>판매 · 즐겨찾기한 트레이더의 새 전략</small>
          </div>
          {items.length ? (
            <ul className="gnb-noti">
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} role="menuitem" className={!prevSeen || n.at > prevSeen ? "new" : ""} onClick={() => setOpen(false)}>
                    <span className={`gnb-noti-kind ${n.kind}`}>{n.kind === "sale" ? "판매" : "즐겨찾기"}</span>
                    <b>{n.title}</b>
                    <small>{n.body}</small>
                    <time dateTime={n.at}>{ago(n.at)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gnb-noti-empty">
              새 알림이 없어요.
              <br />
              {favorites ? "즐겨찾기한 트레이더가 전략을 올리거나 내 전략이 팔리면 알려 드려요." : "전략 쇼핑에서 트레이더를 ☆ 즐겨찾기하면 새 전략을 알려 드려요."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** "방금" · "5분 전" · "3시간 전" · "2일 전" · 11.02 */
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  if (m < 1440 * 7) return `${Math.floor(m / 1440)}일 전`;
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString();
  return `${d.slice(5, 7)}.${d.slice(8, 10)}`;
}

export default function AccountChip() {
  const { profile, ready } = useProfile();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 메뉴 밖을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (!ready) return <span className="gnb-chip gnb-chip-loading" aria-hidden />;
  if (!profile)
    return (
      <Link className="gnb-chip" href="/login">
        로그인
      </Link>
    );
  return (
    <>
      <NotificationBell />
      <div className="gnb-account-box" ref={boxRef}>
        <button
          type="button"
          className="gnb-chip gnb-user"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${profile.name} 계정 메뉴`}
        >
          <span className="gnb-name">{profile.name}</span>
          <Avatar profile={profile} size={34} />
        </button>
        {open && (
          <div className="gnb-menu" role="menu">
            <div className="gnb-menu-head">
              <strong>{profile.name}</strong>
              {profile.email && <small>{profile.email}</small>}
            </div>
            <Link href="/mypage" role="menuitem" onClick={() => setOpen(false)}>
              마이페이지
            </Link>
            <div className="gnb-menu-theme">
              <span>화면</span>
              <ThemeSwitch />
            </div>
            <button
              type="button"
              role="menuitem"
              className="gnb-signout"
              onClick={() => void signOut()}
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </>
  );
}
