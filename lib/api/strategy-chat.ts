// 전략 분석 채팅 기록 (서버, 로그인한 사람마다): GET/POST/DELETE /me/strategy-chat
//   채팅(thread)마다 최근 40개. 메시지 id 는 화면이 만든 숫자 (같은 id 로 다시 보내면 덮어씀)
import { apiRequest } from "./client";

export type StoredMsg = { id: number; role: "user" | "bot" | "pick"; at: string } & Record<string, unknown>;

export const loadChat = () => apiRequest<{ threads: Record<string, StoredMsg[]> }>("/me/strategy-chat");

export function saveChatMsg(thread: string, msg: StoredMsg) {
  const { id, role, at, ...payload } = msg;
  return apiRequest<{ saved: boolean }>("/me/strategy-chat", { method: "POST", body: JSON.stringify({ thread, id, role, at, payload }) });
}

export const clearChat = (thread: string) => apiRequest<{ deleted: number }>(`/me/strategy-chat?thread=${encodeURIComponent(thread)}`, { method: "DELETE" });
