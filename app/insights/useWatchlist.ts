"use client";
// 관심 종목: 로그인했으면 계정(user_metadata.watchlist)에, 아니면 이 브라우저(localStorage)에 둔다
import { useCallback, useEffect, useState } from "react";
import { updateMeta, useSupabaseUser } from "../mypage/context";

/** 미국 종목은 code = 티커, exchange = 키움 거래소 코드 (ND 나스닥 · NY 뉴욕 · NA 아멕스) */
export type WatchItem = { code: string; name: string; market: string; exchange?: "ND" | "NY" | "NA" };
/** 시세 요청 키: 국내 "005930", 미국 "ND:AAPL" */
export const quoteKey = (it: WatchItem) => (it.exchange ? `${it.exchange}:${it.code}` : it.code);
const STORE = "trackit:watchlist";
const MAX = 30;

function readLocal(): WatchItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x?.code === "string") : [];
  } catch {
    return [];
  }
}

export function useWatchlist() {
  const { user, ready, setUser } = useSupabaseUser();
  const [local, setLocal] = useState<WatchItem[] | null>(null);
  useEffect(() => {
    // 로그인 안 한 경우에만 브라우저 목록을 읽는다 (첫 그림은 서버와 같게 비워 두고)
    const t = setTimeout(() => setLocal(readLocal()), 0);
    // 같은 화면의 다른 칸(오늘의 종목 ★ 등)이 바꾸면 다시 읽음
    const sync = () => setLocal(readLocal());
    window.addEventListener("trackit:watchlist", sync);
    return () => {
      clearTimeout(t);
      window.removeEventListener("trackit:watchlist", sync);
    };
  }, []);
  const fromUser = user?.user_metadata?.watchlist;
  const items: WatchItem[] = user ? (Array.isArray(fromUser) ? (fromUser as WatchItem[]) : []) : (local ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (next: WatchItem[]) => {
      setError(null);
      if (user) {
        try {
          const u = await updateMeta({ watchlist: next });
          if (u) setUser(u);
        } catch (e) {
          setError(e instanceof Error ? e.message : "저장하지 못했어요");
        }
      } else {
        localStorage.setItem(STORE, JSON.stringify(next));
        setLocal(next);
        window.dispatchEvent(new Event("trackit:watchlist"));
      }
    },
    [user, setUser],
  );

  return {
    items,
    ready: ready && (user ? true : local !== null),
    signedIn: !!user,
    error,
    has: (code: string) => items.some((i) => i.code === code),
    add: (it: WatchItem) => (items.some((i) => i.code === it.code) || items.length >= MAX ? Promise.resolve() : save([...items, it])),
    remove: (code: string) => save(items.filter((i) => i.code !== code)),
    max: MAX,
  };
}
