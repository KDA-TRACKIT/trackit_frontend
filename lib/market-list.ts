"use client";
// 전략 마켓 목록에서 마지막으로 본 주소 (검색어 · 필터 · 쪽 포함). 트레이더 상세의 "트레이더 목록" 이 여기로 돌아간다
import type { MouseEvent } from "react";

const KEY = "trackit:market-list";

export function rememberListUrl(url: string) {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {}
}

/** "트레이더 목록" 링크 onClick: 기억한 주소가 있으면 그리로 */
export function backToList(e: MouseEvent, push: (href: string) => void) {
  let url: string | null = null;
  try {
    url = sessionStorage.getItem(KEY);
  } catch {}
  if (!url || url === "/marketplace") return; // 기본 링크(/marketplace) 그대로
  e.preventDefault();
  push(url);
}
