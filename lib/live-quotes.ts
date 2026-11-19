"use client";
// 화면 쪽 현재가 한 줄 세우기
//   여러 칸(관심 종목 · 지수 카드 옆 종목 …)이 useQuotes(codes) 로 원하는 코드를 걸어 두면,
//   페이지에 하나뿐인 타이머가 걸린 코드 전체를 한 줄로 모아 /insights/quotes 한 번에 받고, 받은 값을 칸마다 나눠 줌.
//   서버도 같은 방식(lib/market/quote-hub)이라 키움 호출은 서버에서 한 번만 일어남.
//   - 장중(평일 09:00~15:30 KST) 5초, 그 밖 60초 · 미국 코드가 있으면 미국 정규장 동안 15초
//   - 탭이 안 보이면 멈추고, 다시 보이면 바로 받음
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getQuotes, type Quote } from "./api/insights";
import { krxHours } from "./krx-hours";

type Entry = Quote & { at: number };

const wants = new Map<number, string[]>(); // 구독자 id → 코드
const board = new Map<string, Entry>();
const listeners = new Set<() => void>();
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;
let lastAt = 0;
let version = 0;
/** 한 번이라도 물어본 코드 (없는 코드로 계속 되부르지 않게) */
const asked = new Set<string>();
const fresh = (codes: string[]) => codes.some((c) => !asked.has(c));

const kstMinutes = (offsetH: number) => {
  const d = new Date(Date.now() + offsetH * 3_600_000);
  return { dow: d.getUTCDay(), m: d.getUTCHours() * 60 + d.getUTCMinutes() };
};
/** 한국 정규장 */
export function krOpen() {
  const { dow, m } = kstMinutes(9);
  const h = krxHours(); // 수능일 등 늦게 여는 날
  return dow >= 1 && dow <= 5 && m >= h.open && m < h.close;
}
/** 미국 정규장 (뉴욕 09:30~16:00, 서머타임은 대략 3~11월로) */
export function usOpen() {
  const mo = new Date().getUTCMonth();
  const { dow, m } = kstMinutes(mo >= 2 && mo <= 9 ? -4 : -5);
  return dow >= 1 && dow <= 5 && m >= 9 * 60 + 30 && m < 16 * 60;
}

function line() {
  return [...new Set([...wants.values()].flat())];
}
function interval(codes: string[]) {
  if (krOpen() && codes.some((c) => !c.includes(":"))) return 5_000;
  if (usOpen() && codes.some((c) => c.includes(":"))) return 15_000;
  return 60_000;
}

async function tick() {
  timer = null;
  const codes = line();
  if (!codes.length) return;
  if (typeof document !== "undefined" && document.hidden) return; // 보이면 wake() 가 다시 시작
  busy = true;
  try {
    for (let i = 0; i < codes.length; i += 50) {
      const part = codes.slice(i, i + 50);
      part.forEach((c) => asked.add(c));
      const { quotes } = await getQuotes(part);
      const at = Date.now();
      for (const q of quotes) board.set(q.code, { ...q, at });
    }
    lastAt = Date.now();
    version += 1;
    listeners.forEach((l) => l());
  } catch {
    /* 다음 차례에 다시 */
  } finally {
    busy = false;
    // 받는 동안 새 코드가 걸렸으면 바로 한 번 더
    schedule(fresh(line()));
  }
}

function schedule(now = false) {
  if (timer || busy) return;
  const codes = line();
  if (!codes.length) return;
  timer = setTimeout(tick, now ? 0 : interval(codes));
}

function wake() {
  if (document.hidden) return;
  const codes = line();
  if (!codes.length) return;
  if (Date.now() - lastAt >= interval(codes) || fresh(codes)) {
    if (timer) clearTimeout(timer);
    timer = null;
    schedule(true);
  }
}
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 코드들의 현재가 (계속 새로). 받은 적 없는 코드는 빠져 있음 */
export function useQuotes(codes: string[]) {
  const sig = codes.join(",");
  useEffect(() => {
    if (!sig) return;
    const id = nextId++;
    wants.set(id, sig.split(","));
    // 새 코드가 있으면 바로 한 번
    if (fresh(sig.split(","))) {
      if (timer) clearTimeout(timer);
      timer = null;
      schedule(true);
    } else schedule();
    return () => {
      wants.delete(id);
    };
  }, [sig]);
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  return useMemo(() => {
    const out: Record<string, Entry> = {};
    for (const c of sig ? sig.split(",") : []) {
      const q = board.get(c);
      if (q) out[c] = q;
    }
    return { quotes: out, updatedAt: lastAt || null, version: v };
  }, [sig, v]);
}
