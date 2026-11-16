"use client";
// 즐겨찾기한 트레이더 (이 브라우저에 저장). 상단 종 알림이 이 목록의 새 전략을 알려 준다
import { useSyncExternalStore } from "react";

const KEY = "trackit:fav-traders";
export type Favorite = { id: string; name: string; at: string };
const EMPTY: Favorite[] = [];
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: Favorite[] = EMPTY;

function read(): Favorite[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as Favorite[]) : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFavorites() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function isFavorite(list: Favorite[], id: string) {
  return list.some((f) => f.id === id);
}

export function toggleFavorite(id: string, name: string) {
  const list = read();
  const next = isFavorite(list, id) ? list.filter((f) => f.id !== id) : [{ id, name, at: new Date().toISOString() }, ...list];
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
