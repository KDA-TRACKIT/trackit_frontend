"use client";
// 고른 재료(구매한 전략 · 내 기록)를 하나의 전략 초안으로 정리 + 이 브라우저에 초안 저장
//   AI 전략 생성 API 가 아직 없어서, 재료에 실제로 적힌 문장에서만 골라 정리한다 (빈칸을 지어내지 않음)
import { useSyncExternalStore } from "react";
import { INDICATORS, traderById } from "../marketplace/data";
import { uuid } from "../../lib/uuid";
import { kindLabel, type Item, type ItemKind } from "./items";

export type Draft = {
  id: string;
  title: string;
  month: string; // 2026-11
  style: string;
  risk: string;
  indicators: string[];
  entry: string;
  exit: string;
  stop: string;
  note: string;
  request: string;
  sources: { kind: ItemKind; title: string; date: string; symbolName: string | null }[];
  createdAt: string;
};

const TAGS: { key: "entry" | "exit" | "stop"; tag: RegExp; word: RegExp }[] = [
  { key: "stop", tag: /^\[(손절 기준|손절)\]\s*/, word: /손절|이탈 시|무효/ },
  { key: "exit", tag: /^\[(목표|청산|매도 조건)\]\s*/, word: /목표|청산|익절|매도|분할 매도/ },
  { key: "entry", tag: /^\[(진입 근거|매수 조건|진입 조건)\]\s*/, word: /매수|진입|지지|돌파|반등|눌림/ },
];
const IND_WORDS: Record<string, RegExp> = {
  이동평균선: /이평|이동평균|\d+일선|골든크로스|데드크로스/,
  거래량: /거래량/,
  RSI: /RSI/i,
  MACD: /MACD/i,
  "볼린저 밴드": /볼린저/,
  "지지·저항": /지지|저항/,
  추세선: /추세선|채널/,
};

const sentences = (t: string) =>
  t
    .split(/\n+|(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

/** 재료 → 초안. 각 칸은 재료에 있는 문장으로만 채움 (없으면 빈칸) */
export function compose(items: Item[], request: string): Draft {
  const bucket = { entry: [] as string[], exit: [] as string[], stop: [] as string[] };
  const add = (k: keyof typeof bucket, s: string) => {
    if (!bucket[k].includes(s)) bucket[k].push(s);
  };
  const texts: string[] = [];
  for (const i of items) {
    if (i.kind === "strategy") {
      const t = i.traderId ? traderById(i.traderId) : undefined;
      if (t?.rule?.desc) {
        add("entry", `${t.name}: ${t.rule.desc}`);
        texts.push(t.rule.desc);
      }
      if (i.text) texts.push(i.text);
      continue;
    }
    texts.push(i.text);
    for (const s of sentences(i.text)) {
      const tagged = TAGS.find((x) => x.tag.test(s));
      if (tagged) {
        add(tagged.key, s.replace(tagged.tag, ""));
        continue;
      }
      const hit = TAGS.find((x) => x.word.test(s));
      if (hit) add(hit.key, s);
    }
  }
  const all = [...texts, request].join("\n");
  const styles = items.flatMap((i) => (i.traderId ? (traderById(i.traderId)?.styles ?? []) : []));
  const style = /단타|당일|스캘/.test(all) ? "단타" : /장기|가치/.test(all) ? "중장기" : (styles[0] ?? "스윙");
  const indicators = INDICATORS.filter((n) => IND_WORDS[n]?.test(all));
  const hasStop = bucket.stop.length > 0;
  const risk = !hasStop ? "확인 필요" : /-?\s?[1-3]\s?%/.test(bucket.stop.join(" ")) ? "보수형" : "중립형";
  const syms = [...new Set(items.map((i) => i.symbolName).filter(Boolean))] as string[];
  const kst = new Date(Date.now() + 9 * 3_600_000).toISOString();
  const head = indicators.slice(0, 2).join(" × ") || (syms.length ? syms.slice(0, 2).join(" · ") : "내 기록");
  return {
    id: uuid(),
    title: `${head} ${style} 전략`,
    month: kst.slice(0, 7),
    style,
    risk,
    indicators,
    entry: bucket.entry.slice(0, 3).join("\n"),
    exit: bucket.exit.slice(0, 3).join("\n"),
    stop: bucket.stop.slice(0, 2).join("\n"),
    note: syms.length ? `다루는 종목: ${syms.join(", ")}` : "",
    request: request.trim(),
    sources: items.map((i) => ({ kind: i.kind, title: i.title, date: i.date, symbolName: i.symbolName })),
    createdAt: kst.slice(0, 19),
  };
}

export const sourceLabel = (s: Draft["sources"][number]) => `${kindLabel(s.kind)} · ${s.title}${s.symbolName ? ` · ${s.symbolName}` : ""}`;

// ── 이 브라우저에 저장한 초안 ──
const KEY = "trackit:strategy-drafts";
const EMPTY: Draft[] = [];
let raw: string | null = null;
let cache: Draft[] = EMPTY;
const listeners = new Set<() => void>();
function read(): Draft[] {
  const r = localStorage.getItem(KEY);
  if (r !== raw) {
    raw = r;
    try {
      cache = r ? (JSON.parse(r) as Draft[]) : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}
const notify = () => listeners.forEach((l) => l());
export function saveDraft(d: Draft) {
  localStorage.setItem(KEY, JSON.stringify([d, ...read().filter((x) => x.id !== d.id)]));
  notify();
}
export function removeDraft(id: string) {
  localStorage.setItem(KEY, JSON.stringify(read().filter((x) => x.id !== id)));
  notify();
}
export function useDrafts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => EMPTY,
  );
}
