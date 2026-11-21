"use client";
// 전략 후기: ♥ (산 사람만, 트레이더 옆 숫자는 합계) · 익명 댓글 — 백엔드 /market/feedback
import { useEffect, useSyncExternalStore } from "react";
import { apiRequest } from "./api/client";

export type Comment = { id: string; month: string; body: string; createdAt: string; mine: boolean };
export type TraderFeedback = {
  traderId: string;
  total: number;
  likesByMonth: Record<string, number>;
  myLikes: string[];
  openedMonths: string[];
  /** 지금 이 트레이더를 구독 중인지 (그러면 모든 달에 꿀 · 후기) */
  subscribed?: boolean;
  comments: Comment[];
};

// ── 트레이더별 ♥ 합계 (목록 · 홈 트레이더 보드) ──
let totals: Record<string, number> = {};
let totalsLoaded = false;
const totalListeners = new Set<() => void>();

export function refreshLikeTotals() {
  return apiRequest<Record<string, number>>("/market/feedback", { auth: false })
    .then((t) => {
      totals = t;
      totalsLoaded = true;
      totalListeners.forEach((l) => l());
    })
    .catch(() => {}); // 서버가 꺼져 있으면 0
}

export function useLikeTotals(): Record<string, number> {
  return useSyncExternalStore(
    (l) => {
      totalListeners.add(l);
      if (!totalsLoaded) void refreshLikeTotals();
      return () => totalListeners.delete(l);
    },
    () => totals,
    () => totals,
  );
}

// ── 트레이더 한 명 (상세 · 전략) ──
const cache = new Map<string, TraderFeedback>();
const listeners = new Map<string, Set<() => void>>();

function set(traderId: string, data: TraderFeedback) {
  cache.set(traderId, data);
  totals = { ...totals, [traderId]: data.total };
  totalListeners.forEach((l) => l());
  listeners.get(traderId)?.forEach((l) => l());
}

export function loadFeedback(traderId: string) {
  return apiRequest<TraderFeedback>(`/market/feedback/${traderId}`)
    .then((d) => set(traderId, d))
    .catch(() => {});
}

export function useFeedback(traderId: string): TraderFeedback | null {
  const data = useSyncExternalStore(
    (l) => {
      const s = listeners.get(traderId) ?? new Set();
      s.add(l);
      listeners.set(traderId, s);
      return () => s.delete(l);
    },
    () => cache.get(traderId) ?? null,
    () => null,
  );
  useEffect(() => {
    void loadFeedback(traderId);
  }, [traderId]);
  return data;
}

export async function toggleLike(traderId: string, month: string) {
  set(traderId, await apiRequest<TraderFeedback>(`/market/feedback/${traderId}/like`, { method: "POST", body: JSON.stringify({ month }) }));
}

export async function postComment(traderId: string, month: string, body: string) {
  set(traderId, await apiRequest<TraderFeedback>(`/market/feedback/${traderId}/comments`, { method: "POST", body: JSON.stringify({ month, body }) }));
}

export async function removeComment(traderId: string, commentId: string) {
  set(traderId, await apiRequest<TraderFeedback>(`/market/feedback/comments/${commentId}`, { method: "DELETE" }));
}
