"use client";
// 판매 관리 공통 데이터: 내 전략(GET /strategies) + 판매·정산 기록(GET /market/royalties)
//   매출 = 구매자가 낸 금액, 플랫폼 수수료 = 매출 − 판매자 몫(로열티), 정산 예정 = 아직 지급 안 된(PENDING) 판매자 몫
import { useEffect, useMemo, useState } from "react";
import { apiRequest, errorMessage } from "../../../lib/api/client";

export type MyStrategy = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  createdAt: string;
  /** 섹터 · 전략 기간 (2026-11-20 기획: 섹터별로 기간을 정해 만든 전략. 예전 달 단위 전략은 없음) */
  sector?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  listings: { id: string; kind: "MONTHLY" | "ALL"; price: string | number; status: "ACTIVE" | "PAUSED" | string }[];
  _count?: { versions: number };
};

export type Sale = {
  id: string;
  strategy: { id: string; title: string };
  kind: "MONTH" | "ALL";
  month: string | null;
  coveredThrough: string | null;
  /** 매출 (구매자가 낸 금액) */
  price: number;
  /** 판매자 몫 비율 (0.9 = 90%) */
  rate: number;
  /** 판매자 몫 */
  amount: number;
  /** 플랫폼 수수료 */
  fee: number;
  status: "PENDING" | "SETTLED" | "CANCELED" | string;
  settledAt: string | null;
  soldAt: string;
};

type RawSale = Omit<Sale, "price" | "rate" | "amount" | "fee"> & { price: string | number; rate: string | number; amount: string | number };

/** 플랫폼 수수료 (%) — 2026-11-23 결정: 모든 판매자 10% (등급별 차등 없음) */
export const PLATFORM_FEE_PCT = 10;
/** 판매자 몫 비율 = 1 − 수수료 (0.9 = 결제 금액의 90%) */
export const SELLER_SHARE = 1 - PLATFORM_FEE_PCT / 100;

/**
 * 판매자 등급 (수수료는 모든 등급 같음 — 등급은 목록 표시 · 추천 혜택만)
 *   확인된 사실만 씀: 증권사 체결로 확인된 매매 수 · 체결 전에 계획을 먼저 쓴(사전 작성) 비율
 */
export const SELLER_TIERS = [
  { key: "base", name: "기본", fee: PLATFORM_FEE_PCT, need: { trades: 0, pre: 0 }, perk: "판매 가능" },
  { key: "checked", name: "확인 판매자", fee: PLATFORM_FEE_PCT, need: { trades: 30, pre: 50 }, perk: "목록에 '거래내역 확인' 표시" },
  { key: "trusted", name: "우수 판매자", fee: PLATFORM_FEE_PCT, need: { trades: 100, pre: 70 }, perk: "추천순 가산" },
] as const;
export function sellerTier(trades: number, preRate: number) {
  let cur: (typeof SELLER_TIERS)[number] = SELLER_TIERS[0];
  for (const t of SELLER_TIERS) if (trades >= t.need.trades && preRate >= t.need.pre) cur = t;
  const next = SELLER_TIERS[SELLER_TIERS.indexOf(cur) + 1];
  return { cur, next };
}

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-");
export const dayTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
export const SALE_STATUS: Record<string, string> = { PENDING: "정산 예정", SETTLED: "정산 완료", CANCELED: "취소" };
export const saleItem = (s: Pick<Sale, "kind" | "month" | "coveredThrough">) => (s.kind === "ALL" ? `전체${s.coveredThrough ? ` (~${s.coveredThrough})` : ""}` : (s.month ?? "한 달"));

/** 판매 상태: 판매 등록(ACTIVE)이 있으면 판매 중, 멈춤(PAUSED)만 있으면 일시 중지, 없으면 판매 안 함 */
export function saleState(s: MyStrategy): { label: string; tone: "on" | "pause" | "off" } {
  if (s.status === "ARCHIVED") return { label: "보관", tone: "off" };
  if (s.listings.some((l) => l.status === "ACTIVE")) return { label: "판매 중", tone: "on" };
  if (s.listings.some((l) => l.status === "PAUSED")) return { label: "일시 중지", tone: "pause" };
  return { label: "판매 안 함", tone: "off" };
}

export function useSeller() {
  const [strategies, setStrategies] = useState<MyStrategy[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiRequest<MyStrategy[]>("/strategies"), apiRequest<{ pendingTotal: string; items: RawSale[] }>("/market/royalties")])
      .then(([list, roy]) => {
        if (cancelled) return;
        setStrategies(list);
        setSales(
          roy.items.map((r) => {
            const price = Number(r.price);
            const amount = Number(r.amount);
            return { ...r, price, rate: Number(r.rate), amount, fee: Math.max(0, price - amount) };
          }),
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setStrategies([]);
        setSales([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const live = (sales ?? []).filter((s) => s.status !== "CANCELED");
    const sum = (list: Sale[], k: "price" | "fee" | "amount") => list.reduce((a, s) => a + s[k], 0);
    return {
      count: live.length,
      revenue: sum(live, "price"),
      fee: sum(live, "fee"),
      payout: sum(live, "amount"),
      pending: sum(live.filter((s) => s.status === "PENDING"), "amount"),
      settled: sum(live.filter((s) => s.status === "SETTLED"), "amount"),
      pendingCount: live.filter((s) => s.status === "PENDING").length,
    };
  }, [sales]);

  /** 전략별 구매자 수 · 매출 */
  const byStrategy = useMemo(() => {
    const m = new Map<string, { buyers: number; revenue: number }>();
    for (const s of sales ?? []) {
      if (s.status === "CANCELED") continue;
      const cur = m.get(s.strategy.id) ?? { buyers: 0, revenue: 0 };
      m.set(s.strategy.id, { buyers: cur.buyers + 1, revenue: cur.revenue + s.price });
    }
    return m;
  }, [sales]);

  return { strategies, sales, error, totals, byStrategy, loading: strategies === null };
}
