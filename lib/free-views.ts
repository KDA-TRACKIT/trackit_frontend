"use client";
// 무료로 본 전략 (트레이더의 첫 공개 전략): 구독 없이 열어 본 것도 전략보관함에 남도록 이 브라우저에 기록
//   전략 상세(/marketplace/[id]/strategies/[key])에서 무료 전략을 열면 한 번 기록, 같은 전략은 처음 본 시각 그대로 (month 칸 = 전략 번호 s1 …, 예전 기록은 달)
import { useSyncExternalStore } from "react";
import { strategyOf, traderById } from "../app/marketplace/data";

const KEY = "trackit:free-views";
export type FreeView = { traderId: string; traderName: string; month: string; title: string; at: string };
const EMPTY: FreeView[] = [];
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: FreeView[] = EMPTY;

/**
 * 지금 마켓에 있는 트레이더 · 전략의 기록인지 (2026-11-22)
 *   예전 트레이더(예시 41명 · 열람권 시절)는 없어졌고 같은 번호(t1 …)를 지금은 다른 사람이 씀 → 이름이 다르면 예전 기록
 *   예전 기록이 남아 있으면 구독 목록에 꿀통 · 이행률이 없는 카드나 다른 사람 숫자가 붙은 카드로 보였음
 */
function current(v: FreeView) {
  const t = traderById(v.traderId);
  return !!t && t.name === v.traderName && !!strategyOf(t, v.month);
}

/** 예전 방식으로 이 브라우저에 남아 있던 열람권 기록 (지금은 서버 구독만 씀) */
const OLD_KEYS = ["trackit:passes", "trackit:purchases"];

function read(): FreeView[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const all = raw ? (JSON.parse(raw) as FreeView[]) : EMPTY;
      const kept = all.filter(current);
      cache = kept.length ? kept : EMPTY;
      // 예전 기록은 저장소에서도 지움 (한 번 지우면 raw 가 바뀌어 다음엔 그대로 읽음)
      if (kept.length !== all.length) {
        cacheRaw = kept.length ? JSON.stringify(kept) : null;
        if (cacheRaw) localStorage.setItem(KEY, cacheRaw);
        else localStorage.removeItem(KEY);
      }
      for (const k of OLD_KEYS) localStorage.removeItem(k);
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
