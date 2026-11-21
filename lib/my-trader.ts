"use client";
// 내가 전략 마켓의 어느 트레이더인지 (백엔드 GET /me/trader, 서버가 판정) + 트레이더별 구독자 수 (GET /market/subscribers)
//   내 전략에는 '내 전략' 표시를 하고 구독 버튼을 감춤, 내 전략 내용은 구독 없이 봄 (2026-11-21)
//   undefined = 아직 확인 중 (그동안 구독 버튼을 그렸다 지우지 않게 화면이 기다림), null = 트레이더 아님 · 로그인 전
import { useSyncExternalStore } from "react";
import { accessToken, apiRequest } from "./api/client";

let mine: string | null | undefined;
let loadingMine: Promise<void> | null = null;
const mineListeners = new Set<() => void>();

function loadMine() {
  loadingMine ??= (async () => {
    try {
      mine = (await accessToken()) ? ((await apiRequest<{ traderId: string | null }>("/me/trader")).traderId ?? null) : null;
    } catch {
      mine = null; // 서버가 꺼져 있으면 트레이더 아님으로 (구독 결제는 서버가 다시 막음)
    } finally {
      mineListeners.forEach((l) => l());
    }
  })();
}

/** 내 트레이더 번호 (t42 …). undefined = 확인 중, null = 아님 */
export function useMyTrader(): string | null | undefined {
  return useSyncExternalStore(
    (l) => {
      mineListeners.add(l);
      if (mine === undefined) loadMine();
      return () => mineListeners.delete(l);
    },
    () => mine,
    () => undefined,
  );
}

let counts: Record<string, number> | null = null;
let loadingCounts: Promise<void> | null = null;
const countListeners = new Set<() => void>();

/** 트레이더별 지금 구독 중인 사람 수. null = 아직 못 받음 */
export function useSubscriberCounts(): Record<string, number> | null {
  return useSyncExternalStore(
    (l) => {
      countListeners.add(l);
      if (!counts && !loadingCounts) {
        loadingCounts = apiRequest<Record<string, number>>("/market/subscribers", { auth: false })
          .then((c) => {
            counts = c;
          })
          .catch(() => {
            loadingCounts = null; // 다음에 다시
          })
          .finally(() => countListeners.forEach((x) => x()));
      }
      return () => countListeners.delete(l);
    },
    () => counts,
    () => null,
  );
}
