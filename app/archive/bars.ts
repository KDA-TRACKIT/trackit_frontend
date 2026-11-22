"use client";
// 전략보관함 차트용 일봉 (국내 6자리 종목만). 한 번 받은 건 화면을 옮겨도 다시 안 받음
import { useEffect, useState } from "react";
import { fetchBars, searchAllSymbols } from "../../lib/market-data";
import type { Bar } from "../../lib/interval";

const cache = new Map<string, Promise<Bar[]>>();
import { isSpecialCode } from "../../lib/special-symbols";
export const isKrCode = (c: string | null | undefined): c is string => !!c && /^\d{6}$/.test(c);
/** 일봉 time → KST 날짜 */
export const barDate = (t: number) => new Date(t * 1000 + 9 * 3_600_000).toISOString().slice(0, 10);

export function loadDaily(code: string): Promise<Bar[]> {
  let p = cache.get(code);
  if (!p) {
    p = fetchBars(code, "1d", undefined, 300)
      .then((r) => r.bars)
      .catch(() => {
        cache.delete(code);
        return [] as Bar[];
      });
    cache.set(code, p);
  }
  return p;
}

/** 국내 · 미국 일봉 (미국은 거래소를 찾아서). 못 받으면 빈 배열 */
const anyCache = new Map<string, Promise<Bar[]>>();
export function loadDailyAny(code: string): Promise<Bar[]> {
  if (isKrCode(code)) return loadDaily(code);
  let p = anyCache.get(code);
  if (!p && isSpecialCode(code)) {
    // 지수 · 선물 · 환율 (2026-11-22): 거래소 없이 바로
    p = fetchBars(code, "1d", undefined, 3000)
      .then((r) => r.bars)
      .catch(() => {
        anyCache.delete(code);
        return [] as Bar[];
      });
    anyCache.set(code, p);
  }
  if (!p) {
    p = searchAllSymbols(code)
      .then((list) => list.find((s) => s.code === code && s.exchange))
      .then((hit) => (hit?.exchange ? fetchBars(code, "1d", undefined, 3000, hit.exchange).then((r) => r.bars) : []))
      .catch(() => {
        anyCache.delete(code);
        return [] as Bar[];
      });
    anyCache.set(code, p);
  }
  return p;
}

/** 여러 종목 일봉 { code: bars } */
export function useDaily(codes: string[]) {
  const key = codes.filter(isKrCode).join(",");
  const [data, setData] = useState<Record<string, Bar[]>>({});
  useEffect(() => {
    let live = true;
    const list = key ? key.split(",") : [];
    void Promise.all(list.map((c) => loadDaily(c).then((b) => [c, b] as const))).then((pairs) => {
      if (live) setData(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, [key]);
  return data;
}
