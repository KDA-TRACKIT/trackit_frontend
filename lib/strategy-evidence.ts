"use client";
// 전략 분석 근거 모으기 (2026-11-20, 쓰론처럼 '데이터로 답하는' 질문 · 답의 재료)
//   종목: 일봉 상황(RSI · 20일선 · 60일 범위 · 수익률) · 내 종목 전략(매수 · 손절 · 목표)과 지금 가격 거리 · 내가 그은 지지 · 저항
//         · 기본 정보(PER · PBR · ROE · 실적 · 52주 고저) · 최근 공시 · 최근 뉴스
//   산 전략: 트레이더 규칙 전문 · 연 달 매매 결과 · 그 사람이 산 날 상황과 지금 관심 종목 상황
//   AI 는 이 목록만 근거로 답하고, AI 가 없으면 localAnswer 가 같은 근거로 규칙대로 정리 (지어낸 말 없음)
import { fetchBars, fetchCompany } from "./market-data";
import { getDisclosures } from "./api/insights";
import { fetchDailyNews, fetchNewsDays } from "./api/news";
import type { TradeRecord } from "./records";
import { accumulate, currentRecords, symbolRecords } from "./strategy";
import { planOf, reviewRounds } from "./self-review";
import { ownItems } from "./strategyText";
import { recentTrades } from "./api/performance";
import { pairTrades } from "./strategy-use";
import { describe, situationAt, entryCases, closeness, type EntryCase } from "./strategy-use";
import type { StrategyEvidence } from "./api/ai";
import type { SimDetail } from "../app/marketplace/GuessFirst";
import type { Bar } from "./mock/workshop";

const won = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const kstDate = (t: number) => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 화면에 보여 줄 근거 카드 (AI 에 보내는 것과 같음) + 규칙 정리용 숫자 */
export type Gathered = {
  evidence: StrategyEvidence[];
  facts: { close?: number; rsi?: number; ma20?: number; pos60?: number; ret20?: number; stop?: number | null; target?: number | null; buy?: number | null; support?: number | null; resistance?: number | null };
};

export async function gatherStock(code: string, name: string, records: TradeRecord[]): Promise<Gathered> {
  const evidence: StrategyEvidence[] = [];
  const facts: Gathered["facts"] = {};
  let n = 0;
  const add = (label: string, text: string) => evidence.push({ id: `E${++n}`, label, text });

  // 1) 시세 상황
  const bars: Bar[] = await fetchBars(code, "1d", undefined, 260)
    .then((r) => r.bars)
    .catch(() => []);
  const last = bars.at(-1);
  if (last) {
    facts.close = last.close;
    const s = situationAt(bars, bars.length - 1);
    const ret60 = bars.length > 60 ? (last.close / bars[bars.length - 61].close - 1) * 100 : null;
    if (s) {
      Object.assign(facts, { rsi: s.rsi, ma20: s.ma20, pos60: s.pos60, ret20: s.ret20 });
      add("시세 상황", `${kstDate(last.time)} 종가 ${won(last.close)}. ${describe(s)}${ret60 !== null ? ` · 60일 ${pct(ret60)}` : ""}. 거래량은 20일 평균의 ${s.vol.toFixed(1)}배.`);
    } else add("시세 상황", `${kstDate(last.time)} 종가 ${won(last.close)} (일봉이 60개보다 적어 지표는 계산 못 함)`);
  }

  // 2) 내 종목 전략 (투자자가 쓴 문장만) + 지금 가격과 거리
  const mine = currentRecords(symbolRecords(records, code)).sort((a, b) => `${a.date} ${a.noteTime}`.localeCompare(`${b.date} ${b.noteTime}`));
  const latest = mine.at(-1);
  if (latest) {
    // 칸마다 가장 최근에 적은 값 (복기형과 같은 방식: 예전 노트의 손절도 다시 안 썼으면 이어받음)
    const p = mine.map(planOf).reduce((acc, x) => ({ ...acc, buy: x.buy ?? acc.buy, stop: x.stop ?? acc.stop, target: x.target ?? x.sell ?? acc.target }), { at: "", recordId: "", buy: null as number | null, stop: null as number | null, target: null as number | null, sell: null as number | null });
    Object.assign(facts, { buy: p.buy, stop: p.stop, target: p.target });
    const dist = (v: number | null, label: string) => (v === null ? `${label} 없음` : `${label} ${won(v)}${facts.close ? ` (지금가 대비 ${pct((v / facts.close - 1) * 100)})` : ""}`);
    // 투자자가 직접 쓴 문장만 (예전 AI 분석 문단 · 자동 줄은 근거로 안 씀 → AI 가 그걸 내 전략처럼 말하지 않게)
    const KIND = { buy: "매수", sell: "매도", stop: "손절", target: "목표", note: "메모" } as const;
    const own = mine.flatMap((r) => ownItems(r.text ?? "")).slice(-8);
    add("내 종목 전략", `${latest.date} 기준. ${dist(p.buy, "매수")} · ${dist(p.stop, "손절")} · ${dist(p.target, "목표")}. ${own.length ? `내가 쓴 문장: ${own.map((i) => `${KIND[i.kind]} — ${i.text}`).join(" / ")}` : "내가 직접 쓴 전략 문장은 없어요 (AI 분석 글만 있음)."}`);
  } else add("내 종목 전략", "이 종목에 남긴 종목 전략이 없어요.");

  // 3) 내가 그은 지지 · 저항 (지금가 바로 아래 · 위)
  const lines = accumulate(symbolRecords(records, code));
  if (lines.length && facts.close) {
    // 기울어진 선은 오늘 시각에서의 가격으로 (두 점을 이어 늘림)
    const nowT = last?.time ?? 0;
    const atNow = (pts: [number, number][]) => {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      return b[0] === a[0] ? b[1] : a[1] + ((b[1] - a[1]) * (nowT - a[0])) / (b[0] - a[0]);
    };
    const prices = lines.map((l) => Math.round(l.price ?? (l.low && l.high ? (l.low + l.high) / 2 : l.pts && l.pts.length > 1 ? atNow(l.pts) : 0))).filter((v) => v > 0);
    const below = prices.filter((v) => v < facts.close!).sort((a, b) => b - a)[0] ?? null;
    const above = prices.filter((v) => v > facts.close!).sort((a, b) => a - b)[0] ?? null;
    Object.assign(facts, { support: below, resistance: above });
    add("내가 그은 선", `선 ${prices.length}개. 바로 아래 지지 ${below ? `${won(below)} (${pct((below / facts.close - 1) * 100)})` : "없음"} · 바로 위 저항 ${above ? `${won(above)} (${pct((above / facts.close - 1) * 100)})` : "없음"}`);
  }

  // 3-1) 내 매매 기록 (증권사 체결을 알아서 가져옴) + 계획 대비 실제
  const trades = await recentTrades().catch(() => null);
  if (trades) {
    const rounds = pairTrades(trades.filter((t) => t.symbol === code));
    if (rounds.length) {
      const rv = reviewRounds(records, rounds, () => name);
      add(
        "내 매매 기록",
        rv
          .slice(0, 5)
          .map((r) => `${r.round.entry.d} 매수 ${won(Math.round(r.round.entry.px))}${r.round.exit ? ` → ${r.round.exit.d} 매도 ${won(r.round.exit.px)} (${pct(r.round.ret ?? 0)})` : " · 보유 중"}${r.flags.length ? ` [${r.flags.map((f) => f.text).join(", ")}]` : ""}`)
          .join(" / "),
      );
    } else add("내 매매 기록", "이 종목을 매매한 체결이 없어요.");
  }

  // 4) 기본 정보 (국내만)
  if (/^\d{6}$/.test(code)) {
    const c = await fetchCompany(code).catch(() => null);
    if (c) {
      const f = (v: number | null, unit = "") => (v === null ? "—" : `${v.toLocaleString("ko-KR")}${unit}`);
      add("기본 정보", `시가총액 ${f(c.marketCap, "억")} · PER ${f(c.per)} · PBR ${f(c.pbr)} · ROE ${f(c.roe, "%")} · 매출 ${f(c.sales, "억")} · 영업이익 ${f(c.operatingProfit, "억")} · 순이익 ${f(c.netIncome, "억")} · 외국인 비율 ${f(c.foreignRate, "%")} · 52주 고가 ${f(c.high250)} · 저가 ${f(c.low250)} (기준 ${c.asOf})`);
    }
    // 5) 최근 공시
    const d = await getDisclosures([code]).catch(() => null);
    const items = (d?.items ?? []).filter((x) => x.code === code).slice(0, 5);
    if (items.length) add("최근 공시", items.map((x) => `${x.date} ${x.title}`).join(" / "));
  }

  // 6) 최근 뉴스 (기사가 있는 날 중 가장 최근 이틀)
  if (last) {
    const today = kstDate(last.time);
    const days = await fetchNewsDays(code, addDays(today, -14), today, undefined, [], name).catch(() => new Set<string>());
    const recent = [...days].sort().reverse().slice(0, 2);
    const news = (await Promise.all(recent.map((day) => fetchDailyNews(code, day, { close: last.close, isLast: day === today, time: last.time }, undefined, name).catch(() => [])))).flat().slice(0, 5);
    if (news.length) add("최근 뉴스", news.map((a) => `${a.publishedAt?.slice(0, 10) ?? ""} ${a.title}${a.summary ? ` — ${a.summary.slice(0, 120)}` : ""}`).join(" / "));
  }
  return { evidence, facts };
}

export async function gatherTrader(detail: SimDetail[], traderName: string, barsOf: (code: string) => Promise<Bar[]>): Promise<{ evidence: StrategyEvidence[]; cases: EntryCase[]; now: { name: string; score: number; text: string }[] }> {
  const evidence: StrategyEvidence[] = [];
  let n = 0;
  const add = (label: string, text: string) => evidence.push({ id: `E${++n}`, label, text });
  const rule = detail[0]?.rule;
  if (rule) add("트레이더 규칙", `${traderName} · ${rule.name}: ${rule.desc}`);
  const months = detail.flatMap((d) => d.months);
  const trades = months.flatMap((m) => m.trades);
  if (trades.length) {
    const wins = trades.filter((t) => t.ret > 0);
    const avg = trades.reduce((s, t) => s + t.ret, 0) / trades.length;
    const days = trades.reduce((s, t) => s + (Date.parse(t.exit.d) - Date.parse(t.entry.d)) / 86_400_000, 0) / trades.length;
    add("연 달 매매 결과", `${months.map((m) => m.month).join(", ")} · 매매 ${trades.length}건 · 이긴 비율 ${Math.round((wins.length / trades.length) * 100)}% · 평균 ${pct(avg)} · 평균 보유 ${days.toFixed(1)}일 · 계획대로 ${trades.filter((t) => t.followed).length}건`);
    add("매매 예시", trades.slice(0, 4).map((t) => `${t.entry.d} ${t.name} 매수 "${t.entry.why}" → ${t.exit.d} ${t.exit.why} (${pct(t.ret)})`).join(" / "));
  }
  const notes = months.flatMap((m) => (m.notes ?? []).filter((x) => x.type === "market")).slice(-3);
  if (notes.length) add("트레이더의 시장 메모", notes.map((x) => `${x.d} ${x.text}`).join(" / "));
  // 그 사람이 산 날 상황 vs 지금 (그 사람이 다룬 종목)
  const cases = await entryCases(months, barsOf);
  if (cases.length) add("산 날의 상황", cases.slice(0, 5).map((c) => `${c.trade.entry.d} ${c.trade.name}: ${describe(c.situation)}`).join(" / "));
  const now: { name: string; score: number; text: string }[] = [];
  for (const s of (detail[0]?.symbols ?? []).slice(0, 5)) {
    const bars = await barsOf(s.code).catch(() => [] as Bar[]);
    const sit = situationAt(bars, bars.length - 1);
    if (!sit || !cases.length) continue;
    const best = cases.map((c) => closeness(sit, c.situation)).sort((a, b) => b - a)[0];
    now.push({ name: s.name, score: best, text: describe(sit) });
  }
  if (now.length) add("지금 그 종목들", now.map((x) => `${x.name}: ${x.text} (산 날과 비슷한 정도 ${x.score}점)`).join(" / "));
  return { evidence, cases, now };
}

/** AI 가 없을 때: 같은 근거로 규칙대로 정리 (지어내지 않음) */
export function localAnswer(question: string, g: Gathered): { answer: string; points: { text: string; refs: string[] }[]; cautions: string[] } {
  const f = g.facts;
  const ref = (label: string) => g.evidence.filter((e) => e.label === label).map((e) => e.id);
  const points: { text: string; refs: string[] }[] = [];
  if (f.close && f.stop) points.push({ text: f.close < f.stop ? `지금 가격이 내 손절선 ${won(f.stop)} 아래예요 (${pct((f.close / f.stop - 1) * 100)}). 계획대로라면 정리할 자리예요.` : `손절선 ${won(f.stop)}까지 ${pct((f.stop / f.close - 1) * 100)} 남았어요.`, refs: [...ref("시세 상황"), ...ref("내 종목 전략")] });
  else if (f.close) points.push({ text: "종목 전략에 손절 가격이 없어요. 어디서 틀렸다고 볼지 먼저 정해 두세요.", refs: ref("내 종목 전략") });
  if (f.close && f.target) points.push({ text: `목표 ${won(f.target)}까지 ${pct((f.target / f.close - 1) * 100)}.${f.stop ? ` 손익비는 약 ${((f.target - f.close) / Math.max(1, f.close - f.stop)).toFixed(1)} : 1이에요.` : ""}`, refs: ref("내 종목 전략") });
  if (f.close && f.buy) points.push({ text: f.close <= f.buy ? `계획 매수가 ${won(f.buy)} 아래로 와 있어요. 매수 조건 문장이 함께 맞는지 확인하세요.` : `계획 매수가 ${won(f.buy)}까지 ${pct((f.buy / f.close - 1) * 100)} 더 내려와야 해요.`, refs: ref("내 종목 전략") });
  if (f.support || f.resistance) points.push({ text: `내가 그은 선 기준으로 바로 아래 지지 ${f.support ? won(f.support) : "없음"}, 바로 위 저항 ${f.resistance ? won(f.resistance) : "없음"}이에요.`, refs: ref("내가 그은 선") });
  if (f.rsi !== undefined) points.push({ text: f.rsi <= 30 ? `RSI ${f.rsi.toFixed(0)}로 과매도 구간이에요. 반등 확인 전 서둘러 사지 않는 기준이 있으면 좋아요.` : f.rsi >= 70 ? `RSI ${f.rsi.toFixed(0)}로 과열 구간이에요. 추격 매수 기준을 다시 보세요.` : `RSI ${f.rsi.toFixed(0)}, 20일선과 ${pct(f.ma20 ?? 0)} 떨어져 있어요.`, refs: ref("시세 상황") });
  if (ref("최근 공시").length) points.push({ text: "최근 공시가 있어요. 실적 · 증자 · 지분 변화처럼 전략 전제를 바꾸는 내용인지 확인하세요.", refs: ref("최근 공시") });
  if (ref("최근 뉴스").length) points.push({ text: "최근 뉴스가 있어요. 가격 움직임의 이유가 내 전략의 근거와 같은 방향인지 보세요.", refs: ref("최근 뉴스") });
  return {
    answer: `"${question}"에 대해 모은 근거로 정리했어요. 지금 가격과 내 계획(매수 · 손절 · 목표)의 거리, 차트 상황, 공시 · 뉴스를 함께 보세요.`,
    points,
    cautions: ["AI 요약 없이 근거 데이터로만 정리했어요. 판단과 주문은 직접 하세요."],
  };
}
