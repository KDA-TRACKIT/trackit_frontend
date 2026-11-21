"use client";
// 그리기 설정 (이 브라우저에 저장): 자석 · 모두 감추기 · 모두 잠금 + 스타일 템플릿 (2026-11-22)
//   자석: 점을 찍을 때 그 봉의 시가 · 고가 · 저가 · 종가에 붙임 / 모두 감추기: 드로잉을 지우지 않고 가림 / 모두 잠금: 실수로 옮겨지지 않게
//   템플릿: 드로잉의 색 · 굵기 · 선 모양을 이름 붙여 저장해 두고 다른 드로잉에 한 번에 적용
import { useSyncExternalStore } from "react";
import type { DrawingStyle } from "./types";

export type DrawPrefs = { magnet: boolean; hideAll: boolean; lockAll: boolean };
export type DrawTemplate = { name: string; style: DrawingStyle };

const PREFS_KEY = "trackit:draw-prefs";
const TEMPLATES_KEY = "trackit:draw-templates";
const DEFAULT_PREFS: DrawPrefs = { magnet: false, hideAll: false, lockAll: false };
const NO_TEMPLATES: DrawTemplate[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T, fix: (v: unknown) => T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = fallback;
  try {
    if (raw) value = fix(JSON.parse(raw));
  } catch {
    value = fallback;
  }
  cache.set(key, { raw, value });
  return value;
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 안 되면 이번 화면에서만 (새로고침하면 처음 값)
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => (e.key === PREFS_KEY || e.key === TEMPLATES_KEY) && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

const fixPrefs = (v: unknown): DrawPrefs => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { magnet: o.magnet === true, hideAll: o.hideAll === true, lockAll: o.lockAll === true };
};
const fixTemplates = (v: unknown): DrawTemplate[] =>
  (Array.isArray(v) ? v : []).flatMap((t): DrawTemplate[] => {
    const o = t as { name?: unknown; style?: { color?: unknown; width?: unknown; dash?: unknown } };
    if (typeof o?.name !== "string" || typeof o.style?.color !== "string" || typeof o.style?.width !== "number") return [];
    return [{ name: o.name.slice(0, 20), style: { color: o.style.color, width: o.style.width, ...(o.style.dash === "dashed" || o.style.dash === "dotted" ? { dash: o.style.dash } : {}) } }];
  });

export const getDrawPrefs = () => read(PREFS_KEY, DEFAULT_PREFS, fixPrefs);
export function useDrawPrefs(): DrawPrefs {
  return useSyncExternalStore(subscribe, getDrawPrefs, () => DEFAULT_PREFS);
}
export function setDrawPref(key: keyof DrawPrefs, value: boolean) {
  write(PREFS_KEY, { ...getDrawPrefs(), [key]: value });
}

export function useDrawTemplates(): DrawTemplate[] {
  return useSyncExternalStore(subscribe, () => read(TEMPLATES_KEY, NO_TEMPLATES, fixTemplates), () => NO_TEMPLATES);
}
/** 같은 이름이면 덮어씀. 최대 12개 (오래된 것부터 빠짐) */
export function saveDrawTemplate(t: DrawTemplate) {
  const list = read(TEMPLATES_KEY, NO_TEMPLATES, fixTemplates).filter((x) => x.name !== t.name);
  write(TEMPLATES_KEY, [...list, t].slice(-12));
}
export function removeDrawTemplate(name: string) {
  write(TEMPLATES_KEY, read(TEMPLATES_KEY, NO_TEMPLATES, fixTemplates).filter((x) => x.name !== name));
}
