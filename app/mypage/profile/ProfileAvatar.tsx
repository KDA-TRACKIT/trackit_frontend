"use client";
// 프로필 사진: 직접 올린 사진(이 브라우저에만 저장) → 소셜 프로필 사진 → 닉네임 첫 글자
// 사진 저장소(Storage) API 가 생기기 전까지는 서버로 보내지 않는다. user_metadata 는 토큰에 실려서 이미지를 넣지 않는다
import { useSyncExternalStore } from "react";
import { useMypage } from "../context";

const key = (userId: string) => `trackit:avatar:${userId}`;
const listeners = new Set<() => void>();

export function setLocalAvatar(userId: string, dataUrl: string | null) {
  if (dataUrl) localStorage.setItem(key(userId), dataUrl);
  else localStorage.removeItem(key(userId));
  listeners.forEach((l) => l());
}

export function useLocalAvatar(userId: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => localStorage.getItem(key(userId)),
    () => null,
  );
}

/** 고른 이미지를 정사각형 256px JPEG 로 줄인다 */
export function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const s = Math.min(img.width, img.height);
      canvas.getContext("2d")?.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("이미지를 읽지 못했어요."));
    img.src = url;
  });
}

export function ProfileAvatar({ size, preview }: { size: number; preview?: string | null }) {
  const { user, profile } = useMypage();
  const local = useLocalAvatar(user.id);
  const src = preview === undefined ? (local ?? profile.avatar) : (preview ?? profile.avatar);
  return (
    <span className="mp-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" />
      ) : (
        profile.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
