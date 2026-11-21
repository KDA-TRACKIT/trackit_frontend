"use client";
// 무료로 본 전략 (트레이더의 첫 공개 전략): 구독 없이 열어 본 것도 전략보관함에 남도록 이 브라우저에 기록
//   전략 상세(/marketplace/[id]/strategies/[key])에서 무료 전략을 열면 한 번 기록, 같은 전략은 처음 본 시각 그대로 (month 칸 = 전략 번호 s1 …, 예전 기록은 달)
import { useSyncExternalStore } from "react";

const KEY = "trackit:free-views";
export type FreeView = { traderId: string; traderName: string; month: string; title: string; at: string };
const EMPTY: FreeView[] = [];
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: FreeView[] = EMPTY;

function read(): FreeView[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as FreeView[]) : EMPTY;
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

export function useFreeViews() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** 무료 전략을 열었을 때 (이미 있으면 그대로) */
export function markFreeView(v: Omit<FreeView, "at">) {
  const list = read();
  if (list.some((x) => x.traderId === v.traderId && x.month === v.month)) return;
  localStorage.setItem(KEY, JSON.stringify([{ ...v, at: new Date().toISOString() }, ...list]));
  listeners.forEach((l) => l());
}
