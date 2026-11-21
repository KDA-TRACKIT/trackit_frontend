"use client";
// 추세선 얼러트 (2026-11-22): 차트에 그은 선(추세선 · 반직선 · 수평선)에 현재가가 닿으면 종 알림으로 — 백엔드 /me/alerts
//   서버가 종 알림을 물어볼 때(1분마다)와 작업 프로그램에서 지금 시세로 확인함. 로그인해야 쓸 수 있음
import { useSyncExternalStore } from "react";
import { accessToken, apiRequest } from "./client";
import type { Drawing } from "../drawing/types";

export type AlertLine = { pts: [[number, number], [number, number]] } | { price: number };
export type PriceAlert = { id: string; symbol: string; quoteCode: string; symbolName: string; drawingId: string | null; label: string; line: AlertLine; status: "ACTIVE" | "TRIGGERED" | "CANCELLED"; triggeredAt: string | null; triggeredPrice: number | null; lineValue: number | null; createdAt: string };

/** 얼러트를 걸 수 있는 선 도구 */
const LINE_TOOLS = new Set(["trendline", "ray", "extended-line", "info-line", "trend-angle", "horizontal-line", "horizontal-ray"]);
export const canAlert = (d: Drawing) => LINE_TOOLS.has(d.toolId) && d.points.length >= 1 && Number(d.points[0].price) > 0;

/** 드로잉 → 얼러트 선: 수평선은 가격 하나, 그 밖은 두 점을 양쪽으로 늘린 직선 */
export function alertLineOf(d: Drawing): AlertLine | null {
  if (!canAlert(d)) return null;
  const [a, b] = d.points;
  if (d.toolId === "horizontal-line" || d.toolId === "horizontal-ray" || !b || a.time === b.time) return { price: Number(a.price) };
  return { pts: [[a.time, Number(a.price)], [b.time, Number(b.price)]] };
}
export const sameLine = (x: AlertLine, y: AlertLine) => JSON.stringify("pts" in x ? [...x.pts].sort((p, q) => p[0] - q[0]) : x.price) === JSON.stringify("pts" in y ? [...y.pts].sort((p, q) => p[0] - q[0]) : y.price);

const EMPTY: PriceAlert[] = [];
let list: PriceAlert[] = EMPTY;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (next: PriceAlert[]) => {
  list = next;
  listeners.forEach((l) => l());
};

export function refreshAlerts(): Promise<void> {
  loading ??= (async () => {
    try {
      set((await accessToken()) ? await apiRequest<PriceAlert[]>("/me/alerts") : EMPTY);
    } catch {
      // 서버가 꺼져 있으면 그대로
    } finally {
      loaded = true;
      loading = null;
    }
  })();
  return loading;
}

/** 내 얼러트 (켜 둔 것 + 최근에 울린 것) */
export function useAlerts(): PriceAlert[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      if (!loaded && !loading) void refreshAlerts();
      return () => listeners.delete(l);
    },
    () => list,
    () => EMPTY,
  );
}

/** 얼러트 넣기 (같은 드로잉에 켜 둔 것이 있으면 선만 바꿈). 로그인 전이면 오류 */
export async function putAlert(input: { symbol: string; quoteCode: string; symbolName: string; drawingId: string; label: string; line: AlertLine }) {
  if (!(await accessToken())) throw new Error("로그인하면 얼러트를 넣을 수 있어요.");
  const saved = await apiRequest<PriceAlert>("/me/alerts", { method: "POST", body: JSON.stringify(input) });
  set([saved, ...list.filter((a) => a.id !== saved.id)]);
  return saved;
}

export async function removeAlert(id: string) {
  set(await apiRequest<PriceAlert[]>(`/me/alerts/${id}`, { method: "DELETE" }));
}
