"use client";
// 화면 테마: 시스템 설정 따름(기본) / 라이트 / 다크. 고른 값은 이 브라우저(localStorage)에 둔다
// <html data-theme="light|dark"> 로 실제 적용 — CSS 는 html[data-theme="dark"] 만 보면 된다
import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "./theme-script";

export type ThemePref = "system" | "light" | "dark";
const listeners = new Set<() => void>();
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

function read(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

/** 저장된 값(없으면 시스템 설정)대로 <html data-theme> 을 다시 맞춘다 */
export function applyTheme() {
  const pref = read();
  const dark = pref === "dark" || (pref === "system" && window.matchMedia(SYSTEM_DARK).matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  listeners.forEach((l) => l());
}

export function setTheme(pref: ThemePref) {
  if (pref === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyTheme();
}

/**
 * 화면이 열려 있는 동안 계속 맞춘다: 시스템 라이트/다크가 바뀔 때, 다른 탭에서 테마를 바꿀 때,
 * 화면에 다시 돌아올 때. (처음 그릴 때는 <head> 스크립트가 맞춤) 반환값은 정리 함수
 */
export function watchTheme() {
  const media = window.matchMedia(SYSTEM_DARK);
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && applyTheme();
  const onVisible = () => document.visibilityState === "visible" && applyTheme();
  applyTheme();
  media.addEventListener("change", applyTheme);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    media.removeEventListener("change", applyTheme);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "system",
  );
}

export const THEME_LABEL: Record<ThemePref, string> = { system: "시스템", light: "라이트", dark: "다크" };
