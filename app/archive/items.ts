"use client";
// 전략보관함 한 곳에 모으는 재료: 구매한 전략(열람권으로 연 월별 전략 · 무료로 본 첫 전략) + 내 기록(매매 일지 · 일반 노트 · 차트 노트 · 뉴스)
//   기록은 lib/records (로그인 = 서버 확정 노트, 아니면 이 브라우저). 지어낸 기록 없이 있는 것만 보여 줌
import { useEffect, useMemo, useState } from "react";
import { classify, daysAgo, initRecordSource, recordSource, useRecords, type TradeRecord } from "../../lib/records";
import { usePasses } from "../../lib/purchases";
import { useFreeViews } from "../../lib/free-views";
import { monthLabel, strategiesOf, traderById } from "../marketplace/data";

export type ItemKind = "strategy" | "journal" | "note" | "chart" | "news";
export const KINDS: { key: ItemKind; label: string; short: string }[] = [
  { key: "strategy", label: "구매한 전략", short: "전" },
  { key: "journal", label: "매매 일지", short: "일" },
  { key: "note", label: "일반 노트", short: "노" },
  { key: "chart", label: "차트 노트", short: "차" },
  { key: "news", label: "뉴스", short: "뉴" },
];
export const kindLabel = (k: ItemKind) => KINDS.find((x) => x.key === k)!.label;
/** 차트 · 캘린더 점 색 (CSS 의 .ar-k-* 와 같게) */
export const KIND_COLOR: Record<ItemKind, string> = { strategy: "#8b5cf6", journal: "#344d7d", note: "#2f9e5b", chart: "#d9822b", news: "#1592a6" };

export type Item = {
  id: string;
  kind: ItemKind;
  /** KST YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  symbol: string | null;
  symbolName: string | null;
  title: string;
  /** 한 줄 부가 정보 (매수 10주 · 사전 기록 / 트레이더 · 이행률) */
  sub?: string;
  text: string;
  href?: string;
  side?: "매수" | "매도";
  /** 구매한 전략 */
  traderId?: string;
  month?: string;
  ret?: number;
  follow?: number;
};

const sideOf = (s?: string) => (!s ? undefined : /buy|매수|long/i.test(s) ? "매수" : /sell|매도|short/i.test(s) ? "매도" : undefined);
const STAGE: Record<string, string> = { pre: "사전 기록", post: "사후 기록", pending: "체결 연결 전" };

function recordItem(r: TradeRecord): Item {
  const k = classify(r);
  const kind: ItemKind = k === "thought" ? (r.topic === "뉴스" ? "news" : "note") : r.drawings ? "chart" : "journal";
  const lines = r.text.trim().split(/\n+/);
  const first = (lines[0] ?? "").replace(/^\[[^\]]+\]\s*/, "");
  const title = first.length > 34 ? `${first.slice(0, 34)}…` : first || (r.symbolName ?? r.topic ?? "메모");
  const side = sideOf(r.side);
  const sub =
    kind === "journal" || kind === "chart"
      ? [side && `${side}${r.quantity ? ` ${r.quantity.toLocaleString("ko-KR")}주` : ""}`, STAGE[k], kind === "chart" && r.drawings ? `그은 선 ${r.drawings}개` : null].filter(Boolean).join(" · ")
      : r.topic && r.topic !== "뉴스"
        ? r.topic
        : undefined;
  return {
    id: r.id,
    kind,
    date: r.date,
    time: r.noteTime.slice(0, 5),
    symbol: r.symbol,
    symbolName: r.symbolName,
    title,
    sub,
    text: r.text,
    href: r.symbol ? `/workshop?symbol=${encodeURIComponent(r.symbol)}` : undefined,
    side,
  };
}

const kstDate = (iso: string) => (iso ? new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString() : "");

/** 전략보관함 재료 전체 (최신순) */
export function useArchive() {
  const records = useRecords();
  const passes = usePasses();
  const freeViews = useFreeViews();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void initRecordSource().finally(() => setLoading(false));
  }, []);

  const items = useMemo(() => {
    const left = (traderId: string) => passes.filter((p) => p.traderId === traderId && !p.used).length;
    const bought: Item[] = passes
      .filter((p) => p.used)
      .map((p) => {
        const t = traderById(p.traderId);
        const s = t ? strategiesOf(t).find((x) => x.month === p.used!.month) : undefined;
        const at = kstDate(p.used!.at || p.approvedAt || "");
        return {
          id: `pass-${p.id}`,
          kind: "strategy" as const,
          date: at.slice(0, 10),
          time: at.slice(11, 16),
          symbol: null,
          symbolName: null,
          title: `${monthLabel(p.used!.month)} · ${s?.title ?? p.used!.title}`,
          sub: `${p.traderName} · 남은 열람권 ${left(p.traderId)}장`,
          text: s?.summary ?? t?.rule?.desc ?? "",
          href: `/marketplace/${p.traderId}/strategies/${p.used!.month}`,
          traderId: p.traderId,
          month: p.used!.month,
          ret: s?.ret,
          follow: s?.follow,
        };
      });
    // 무료로 본 전략 (열람권으로도 연 달이면 하나만)
    const free: Item[] = freeViews
      .filter((v) => !passes.some((p) => p.traderId === v.traderId && p.used?.month === v.month))
      .map((v) => {
        const t = traderById(v.traderId);
        const s = t ? strategiesOf(t).find((x) => x.month === v.month) : undefined;
        const at = kstDate(v.at);
        return {
          id: `free-${v.traderId}-${v.month}`,
          kind: "strategy" as const,
          date: at.slice(0, 10),
          time: at.slice(11, 16),
          symbol: null,
          symbolName: null,
          title: `${monthLabel(v.month)} · ${s?.title ?? v.title}`,
          sub: `${v.traderName} · 무료로 봄`,
          text: s?.summary ?? t?.rule?.desc ?? "",
          href: `/marketplace/${v.traderId}/strategies/${v.month}`,
          traderId: v.traderId,
          month: v.month,
          ret: s?.ret,
          follow: s?.follow,
        };
      });
    return [...bought, ...free, ...records.map(recordItem)].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  }, [records, passes, freeViews]);

  return { items, loading, source: recordSource() };
}

export type ItemFilter = { kinds?: Set<ItemKind>; symbol?: string | null; days?: number; q?: string };

export function filterItems(items: Item[], f: ItemFilter) {
  const from = f.days ? daysAgo(f.days) : f.days === -1 ? daysAgo(0) : "";
  const word = f.q?.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!f.kinds || f.kinds.has(i.kind)) &&
      (!f.symbol || (f.symbol === "none" ? !i.symbol : i.symbol === f.symbol)) &&
      (!from || i.date >= from) &&
      (!word || [i.title, i.text, i.sub ?? "", i.symbolName ?? "", i.symbol ?? ""].some((s) => s.toLowerCase().includes(word))),
  );
}

/** 기록이 많은 종목 순 */
export function topSymbols(items: Item[]) {
  const m = new Map<string, { code: string; name: string; count: number }>();
  for (const i of items) {
    if (!i.symbol) continue;
    const e = m.get(i.symbol) ?? { code: i.symbol, name: i.symbolName ?? i.symbol, count: 0 };
    e.count++;
    m.set(i.symbol, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export function countBy(items: Item[]) {
  const c = { strategy: 0, journal: 0, note: 0, chart: 0, news: 0 } as Record<ItemKind, number>;
  for (const i of items) c[i.kind]++;
  return c;
}

export const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export const dayTitle = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 ${WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()]}요일`;
export const shortDate = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8)}`;
