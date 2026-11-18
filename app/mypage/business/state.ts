"use client";
// 비즈니스 프로필 전환 상태 — 판매자 API(seller_profiles)가 생기기 전까지 이 브라우저에만 저장 (화면 확인용)
import { useSyncExternalStore } from "react";

export const SELLER_TERMS_VERSION = "2026-11-draft";
/** 정산 계좌: 계좌번호 전체는 저장하지 않고 끝 4자리만 (실제 지급 정보는 판매자 API 가 생기면 서버로) */
export type Settlement = { bank: string; accountLast4: string; holder: string; businessNo?: string };
export type BusinessState = { termsVersion: string; acceptedAt: string; settlement?: Settlement; publicConsentAt?: string };

const key = (userId: string) => `trackit:business:${userId}`;
const listeners = new Set<() => void>();

export function saveBusiness(userId: string, state: BusinessState | null) {
  if (state) localStorage.setItem(key(userId), JSON.stringify(state));
  else localStorage.removeItem(key(userId));
  listeners.forEach((l) => l());
}

export function useBusiness(userId: string): BusinessState | null {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => localStorage.getItem(key(userId)),
    () => null,
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BusinessState;
  } catch {
    return null;
  }
}
