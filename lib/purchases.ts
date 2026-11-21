"use client";
// 전략 구독 — 계정(서버 author_subscriptions)에 저장. 토스 결제가 서버에서 승인되면 한 건씩 생김
//   한 건 = 그 트레이더 30일 구독 (lib/subscription)
import { useSyncExternalStore } from "react";
import { accessToken, apiRequest } from "./api/client";
import { toRecords, type Subscription } from "./subscription";

export type Pass = {
  id: string;
  traderId: string;
  traderName: string;
  orderId: string;
  /** 한 장 값 */
  amount: number;
  approvedAt: string | null;
  receiptUrl: string | null;
  /** 이 구독으로 연 전략 (아직 안 썼으면 null) */
  used: { month: string; title: string; at: string } | null;
};

const EMPTY: Pass[] = [];
const listeners = new Set<() => void>();
let list: Pass[] = EMPTY;
let loaded = false;
let loading: Promise<void> | null = null;
const notify = () => listeners.forEach((l) => l());

/** 서버에서 다시 읽기 (결제 승인 · 열기 뒤) */
export function refreshPasses(): Promise<void> {
  loading ??= (async () => {
    try {
      if (!(await accessToken())) {
        list = EMPTY;
        return;
      }
      // 구독 기간 = 서버 구독 표 (/me/subscriptions)
      list = toRecords(await apiRequest<Subscription[]>("/me/subscriptions"), [] as Pass[]);
    } catch {
      // 서버가 꺼져 있으면 그대로
    } finally {
      loaded = true;
      loading = null;
      notify();
    }
  })();
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!loaded && !loading) void refreshPasses();
  return () => listeners.delete(l);
}

export function usePasses() {
  return useSyncExternalStore(subscribe, () => list, () => EMPTY);
}

/** 서버에서 구독을 한 번이라도 다 읽었는지 (읽기 전엔 '없음' 대신 불러오는 중으로) */
export function usePassesLoaded() {
  return useSyncExternalStore(subscribe, () => loaded, () => false);
}

/** 월 구독 (lib/subscription): 구독 중이면 그 트레이더 전략을 다 봄 */
export { SUB_DAYS, subscriptionEnd, subscribed } from "./subscription";
/** 이 트레이더의 이 전략(전략 번호 s1 … 또는 달)을 볼 수 있는지 (구독 중이거나 예전 구독으로 연 달) */
export { canView as opened } from "./subscription";
