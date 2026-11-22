"use client";
// 전략 분석 채팅 브리핑 (2026-11-20, 쓰론처럼 비서가 먼저 말을 거는 메시지)
//   기본 채팅: 내 종목(노트 · 보유) 오늘 시세와 내 계획 체크 결과 + 앞으로 7일 중요 경제 일정
//   산 전략 채팅: 오늘 이 전략의 매수 조건 확인 (answerLocally 의 매매 전 체크)
//   종목 채팅: 오늘 현재가와 내 매수 조건 · 손절선 체크
//   숫자는 모두 시세 · 내 노트 · 체결 · 캘린더에서 (지어낸 말 없음)
import type { TradeRecord } from "./records";
import { getEconCalendar, getQuotes } from "./api/insights";
import { recentTrades } from "./api/performance";
import { pairTrades } from "./strategy-use";
import { answerLocally, type Reply, type Target } from "./strategy-chat";

const won = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

export async function briefing(target: Target | null, records: TradeRecord[], stocks: Target[]): Promise<Reply> {
  if (target) {
    const r = await answerLocally("오늘 브리핑", "check", target, records);
    return { ...r, answer: target.kind === "trader" ? `오늘 ${target.name}의 매수 조건을 확인해 봤어요.` : `오늘 ${target.name} 가격으로 내 매수 조건과 손절선을 확인해 봤어요.` };
  }
  // 기본 채팅: 내 종목 브리핑
  const evidence: Reply["evidence"] = [];
  const points: Reply["points"] = [];
  const trades = await recentTrades().catch(() => null);
  const open = trades ? pairTrades(trades).filter((r) => !r.exit) : [];
  const codes = [...new Set([...open.map((r) => r.symbol), ...stocks.map((s) => s.id)])].filter((c) => /^\d{6}$/.test(c)).slice(0, 8);
  const quotes = codes.length ? await getQuotes(codes).then((r) => r.quotes).catch(() => []) : [];
  const nameOf = (c: string) => stocks.find((s) => s.id === c)?.name ?? quotes.find((q) => q.code === c)?.name ?? c;
  if (quotes.length) {
    const rows = quotes.map((q) => {
      const held = open.find((r) => r.symbol === q.code);
      return `${nameOf(q.code)} ${won(q.price)} (${q.changeRate >= 0 ? "+" : ""}${q.changeRate.toFixed(2)}%)${held ? ` · 보유 평단 ${won(Math.round(held.entry.px))} 대비 ${((q.price / held.entry.px - 1) * 100).toFixed(1)}%` : ""}`;
    });
    evidence.push({ id: "E1", label: "내 종목 시세", text: rows.join(" / ") });
    const movers = [...quotes].sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate));
    const big = movers.filter((q) => Math.abs(q.changeRate) >= 3);
    points.push({ text: big.length ? `오늘 크게 움직인 내 종목: ${big.map((q) => `${nameOf(q.code)} ${q.changeRate >= 0 ? "+" : ""}${q.changeRate.toFixed(1)}%`).join(", ")}. 종목 채팅에서 내 계획과 맞는지 확인해 보세요.` : `내 종목 ${quotes.length}개 모두 오늘 ±3% 안에서 움직였어요.`, refs: ["E1"] });
    const losing = open.filter((r) => {
      const q = quotes.find((x) => x.code === r.symbol);
      return q && q.price < r.entry.px * 0.95;
    });
    if (losing.length) points.push({ text: `평단보다 5% 넘게 내려간 보유 종목: ${losing.map((r) => nameOf(r.symbol)).join(", ")}. 손절 기준을 정해 뒀는지 확인하세요.`, refs: ["E1"] });
  } else points.push({ text: "아직 시세를 볼 내 종목이 없어요. 종목 노트를 남기거나 매매하면 매일 여기서 챙겨 드려요.", refs: [] });

  const cal = await getEconCalendar().catch(() => null);
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const week = new Date(Date.now() + 9 * 3_600_000 + 7 * 86_400_000).toISOString().slice(0, 10);
  const events = (cal?.events ?? []).filter((e) => e.date >= today && e.date <= week && e.impact >= 2).slice(0, 5);
  if (events.length) {
    const id = `E${evidence.length + 1}`;
    evidence.push({ id, label: "다가오는 경제 일정", href: "/insights?tab=economy", text: events.map((e) => `${e.date}${e.time ? ` ${e.time}` : ""} ${e.country} ${e.title}${e.forecast ? ` (예상 ${e.forecast})` : ""}`).join(" / ") });
    points.push({ text: `이번 주 챙길 일정: ${events.map((e) => `${Number(e.date.slice(5, 7))}/${Number(e.date.slice(8))} ${e.title}`).join(", ")}.`, refs: [id] });
  }
  const basic: Target = { key: "basic", kind: "stock", id: "", name: "기본 채팅" };
  return {
    intent: "check",
    target: basic,
    evidence,
    answer: "오늘 내 종목과 이번 주 일정을 먼저 정리했어요.",
    points,
    stocks: quotes.map((q) => ({ code: q.code, name: nameOf(q.code), ret: q.changeRate })),
  };
}
