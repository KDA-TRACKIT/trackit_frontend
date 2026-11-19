"use client";
// 장바구니: 나중에 열고 싶은 월별 전략을 모아 두는 곳 (이 브라우저에 저장)
//   열람권은 트레이더별로 사서 달마다 한 장씩 쓰므로, 장바구니에서 트레이더마다 담은 개수만큼 한 번에 사고 바로 열 수 있다
import { useSyncExternalStore } from "react";

const KEY = "trackit:cart";
export type CartItem = { traderId: string; month: string; title: string; at: string };
const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: CartItem[] = EMPTY;

function read(): CartItem[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as CartItem[]) : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function write(next: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
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

export function useCart() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const inCart = (list: CartItem[], traderId: string, month: string) => list.some((c) => c.traderId === traderId && c.month === month);

export function toggleCart(traderId: string, month: string, title: string) {
  const list = read();
  write(inCart(list, traderId, month) ? list.filter((c) => !(c.traderId === traderId && c.month === month)) : [...list, { traderId, month, title, at: new Date().toISOString() }]);
}

export function removeFromCart(traderId: string, month: string) {
  write(read().filter((c) => !(c.traderId === traderId && c.month === month)));
}
