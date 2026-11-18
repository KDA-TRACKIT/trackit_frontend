"use client";
// 직접 올린 프로필 사진 (이 브라우저에만 저장, 사진 저장소 API 가 생기기 전까지)
//   마이페이지 프로필 화면과 상단 계정 칩이 같이 읽어서, 사진을 바꾸면 상단 사진도 바로 바뀜 (다른 탭은 storage 이벤트로)
import { useSyncExternalStore } from "react";

const key = (userId: string) => `trackit:avatar:${userId}`;
const listeners = new Set<() => void>();

export function setLocalAvatar(userId: string, dataUrl: string | null) {
  if (dataUrl) localStorage.setItem(key(userId), dataUrl);
  else localStorage.removeItem(key(userId));
  listeners.forEach((l) => l());
}

export function useLocalAvatar(userId: string | null | undefined) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => {
        if (!e.key || (userId && e.key === key(userId))) l();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(l);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => (userId ? localStorage.getItem(key(userId)) : null),
    () => null,
  );
}
