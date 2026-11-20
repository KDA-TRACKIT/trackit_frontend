"use client";
// 전략 열람권 — 계정(서버 strategy_passes)에 저장. 토스 결제가 서버에서 승인되면 장수만큼 생기고,
//   1장으로 그 트레이더의 월별 전략 하나를 골라 연다 (한 번 연 건 되돌릴 수 없음). 어느 기기 · 주소에서나 같음
//   예전에 이 브라우저에만 저장했던 열람권은 처음 불러올 때 서버로 옮김 (서버가 토스에 승인됐는지 다시 확인)
import { useSyncExternalStore } from "react";
import { accessToken, apiRequest } from "./api/client";

export type Pass = {
  id: string;
  traderId: string;
  traderName: string;
  orderId: string;
  /** 한 장 값 */
  amount: number;
  approvedAt: string | null;
  receiptUrl: string | null;
  /** 이 열람권으로 연 전략 (아직 안 썼으면 null) */
  used: { month: string; title: string; at: string } | null;
};

const OLD_KEYS = ["trackit:passes", "trackit:purchases"];
const EMPTY: Pass[] = [];
const listeners = new Set<() => void>();
let list: Pass[] = EMPTY;
let loaded = false;
let loading: Promise<void> | null = null;
const notify = () => listeners.forEach((l) => l());

type OldPass = { id?: string; orderId?: string; traderId: string; traderName?: string; title?: string; month?: string; approvedAt?: string | null; used?: { month: string; title: string; at: string } | null };

/** 이 브라우저에만 있던 예전 열람권 → 서버로 (토스 승인 확인은 서버가) */
async function importOld() {
  const orders = new Map<string, { orderId: string; traderId: string; traderName: string; used: { month: string; title: string; at: string }[] }>();
  for (const key of OLD_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      for (const p of JSON.parse(raw) as OldPass[]) {
        const orderId = (p.orderId ?? p.id ?? "").split("#")[0];
        if (!orderId) continue;
        const traderName = p.traderName ?? (p.title ?? "").split(" · ")[0];
        const o = orders.get(orderId) ?? { orderId, traderId: p.traderId, traderName, used: [] };
        const used = p.used ?? (p.month ? { month: p.month, title: (p.title ?? "").split(" · ").slice(1).join(" · "), at: p.approvedAt ?? "" } : null);
        if (used) o.used.push(used);
        orders.set(orderId, o);
      }
    } catch {}
  }
  if (!orders.size) return;
  await apiRequest("/me/passes/import", { method: "POST", body: JSON.stringify({ orders: [...orders.values()] }) });
  OLD_KEYS.forEach((k) => localStorage.removeItem(k));
}

/** 서버에서 다시 읽기 (결제 승인 · 열기 뒤) */
export function refreshPasses(): Promise<void> {
  loading ??= (async () => {
    try {
      if (!(await accessToken())) {
        list = EMPTY;
        return;
      }
      await importOld().catch(() => {}); // 못 옮기면 다음에 다시
      list = await apiRequest<Pass[]>("/me/passes");
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

/** 서버에서 열람권을 한 번이라도 다 읽었는지 (읽기 전엔 '없음' 대신 불러오는 중으로) */
export function usePassesLoaded() {
  return useSyncExternalStore(subscribe, () => loaded, () => false);
}

/** 이 트레이더의 이 달 전략을 이미 열었는지 */
export const opened = (passes: Pass[], traderId: string, month: string) => passes.some((p) => p.traderId === traderId && p.used?.month === month);
/** 아직 안 쓴 이 트레이더 열람권 */
export const unusedPasses = (passes: Pass[], traderId: string) => passes.filter((p) => p.traderId === traderId && !p.used);

/** 열람권 1장으로 전략 하나 열기 (서버). 실패하면 이유를 throw */
export async function redeem(traderId: string, month: string, title: string): Promise<void> {
  await apiRequest("/me/passes/redeem", { method: "POST", body: JSON.stringify({ traderId, month, title }) });
  await refreshPasses();
}
