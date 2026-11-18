"use client";
// 프로필 사진: 직접 올린 사진(이 브라우저에만 저장) → 소셜 프로필 사진 → 닉네임 첫 글자
// 사진 저장소(Storage) API 가 생기기 전까지는 서버로 보내지 않는다. user_metadata 는 토큰에 실려서 이미지를 넣지 않는다
import { useLocalAvatar } from "../../../lib/local-avatar";
import { useMypage } from "../context";
// 저장 · 읽기는 lib/local-avatar (상단 계정 칩과 같이 씀)
export { setLocalAvatar, useLocalAvatar } from "../../../lib/local-avatar";

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
