"use client";
// 미국 주식 거래 시간대 (키움 기준). 백엔드 trackit_backend/lib/brokers/us-session.ts 와 같은 계산
//   키움 미국주식 주문에는 "장 구분" 값이 없어서, 넣은 시각에 열린 시장으로 들어간다
//   주간거래  미국 동부 20:00 ~ 다음날 03:45 (한국 월~금, 서머타임 09:00~16:45 · 아니면 10:00~17:45)
//   프리마켓  04:00 ~ 09:30 · 정규장 09:30 ~ 16:00 · 애프터마켓 16:00 ~ 20:00 (미국 동부)
//   정규장 밖은 지정가만. 미국 휴장일은 모른다 (그날 주문은 증권사가 거부)
import { useEffect, useState } from "react";

export type UsSession = "daytime" | "pre" | "regular" | "after" | "closed";

export const US_SESSION_LABEL: Record<UsSession, string> = {
  daytime: "주간거래",
  pre: "프리마켓",
  regular: "정규장",
  after: "애프터마켓",
  closed: "주문 불가 시간",
};

function nyClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dow, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function usSession(now = new Date()): UsSession {
  const { dow, minutes } = nyClock(now);
  const kstDow = new Date(now.getTime() + 9 * 3_600_000).getUTCDay();
  if ((minutes >= 20 * 60 || minutes < 3 * 60 + 45) && kstDow >= 1 && kstDow <= 5) return "daytime";
  if (dow < 1 || dow > 5) return "closed";
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "regular";
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "after";
  return "closed";
}

export const usOrderTypes = (s: UsSession): ("LIMIT" | "MARKET")[] => (s === "regular" ? ["LIMIT", "MARKET"] : s === "closed" ? [] : ["LIMIT"]);

/** 지금 뉴욕이 서머타임인지 (한국 시각 안내용) */
export function usDst(now = new Date()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "short" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value;
  return name === "EDT";
}

/** 시간대별 한국 시각 안내 (서머타임에 따라) */
export function usHoursKst(now = new Date()) {
  const dst = usDst(now);
  return dst
    ? [
        { s: "daytime" as const, kst: "09:00 ~ 16:45" },
        { s: "pre" as const, kst: "17:00 ~ 22:30" },
        { s: "regular" as const, kst: "22:30 ~ 05:00" },
        { s: "after" as const, kst: "05:00 ~ 09:00" },
      ]
    : [
        { s: "daytime" as const, kst: "10:00 ~ 17:45" },
        { s: "pre" as const, kst: "18:00 ~ 23:30" },
        { s: "regular" as const, kst: "23:30 ~ 06:00" },
        { s: "after" as const, kst: "06:00 ~ 10:00" },
      ];
}

/** 지금 시간대. 20초마다 다시 본다 */
export function useUsSession(): UsSession {
  const [s, setS] = useState<UsSession>(() => usSession());
  useEffect(() => {
    const t = setInterval(() => setS(usSession()), 20_000);
    return () => clearInterval(t);
  }, []);
  return s;
}
