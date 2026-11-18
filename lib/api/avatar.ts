// 프로필 사진 = 계정 사진 (백엔드가 Supabase Storage 에 올리고 user_metadata.custom_avatar_url 에 주소를 넣음)
import { apiRequest } from "./client";
import { getSupabaseBrowser } from "../supabase-browser";

/** dataUrl: 256px 로 줄인 이미지 (shrinkImage). null 이면 올린 사진 지우기 */
export async function saveAccountAvatar(dataUrl: string | null): Promise<string | null> {
  const r = dataUrl
    ? await apiRequest<{ avatarUrl: string }>("/me/avatar", { method: "POST", body: JSON.stringify({ dataUrl }) })
    : await apiRequest<{ avatarUrl: null }>("/me/avatar", { method: "DELETE" });
  // 세션을 새로 받아야 이 브라우저의 계정 정보(상단 사진 등)에 바로 반영됨
  await getSupabaseBrowser()?.auth.refreshSession();
  return r.avatarUrl;
}
