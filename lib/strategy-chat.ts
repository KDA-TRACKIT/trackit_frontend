"use client";
// 전략 분석 채팅 (2026-11-20): 질문 → 질문 종류 · 대상 판단 → 관련 전략 · 버전 · 노트 · 매매 기록 · 시세를 찾아 근거로 → 답
//   질문 종류
//     about     이 전략 매수 조건이 뭐였지?          (전략 원문 · 적용 버전 · 매매 예시)
//     adherence 내가 이 전략 잘 지키고 있어?         (내 매매 기록 · 진입일 조건 확인 · 추가 매수 · 손절 · 계획 대비)
//     changes   전략이 어떻게 바뀌었어?              (버전 = 달마다 · 내 종목 전략 고친 이력)
//     check     지금 매수 조건 충족됐어?             (현재 버전 조건을 오늘 일봉에 · 내 계획과 지금 가격)
//     fit       내가 이 전략 잘 활용할 수 있을까?    (전략 성격 vs 내 매매 습관)
//   대상: 산 전략(트레이더) · 내 종목 전략. 질문에 이름이 있으면 그것, 없으면 고른 것
//   AI 가 없거나 실패하면 같은 근거로 규칙대로 답함 (숫자는 모두 근거에서)
import type { TradeRecord } from "./records";
import { recentTrades, type Trade } from "./api/performance";
import { fetchBars, type UsExchange } from "./market-data";
import { fetchStrategyMonth } from "./strategy-data";
import { checkRule } from "./trader-method";
import { pairTrades, statsOf, type MyRound } from "./strategy-use";
import { habits, planChanges, reviewRounds } from "./self-review";
import { gatherStock, localAnswer } from "./strategy-evidence";
import type { StrategyEvidence } from "./api/ai";
import type { SimDetail } from "../app/marketplace/GuessFirst";
import type { Bar } from "./mock/workshop";

export type Intent = "about" | "adherence" | "changes" | "check" | "fit";
export const INTENTS: { key: Intent; label: string; ask: string }[] = [
  { key: "about", label: "전략 내용", ask: "이 전략 매수 조건이 뭐였지?" },
  { key: "adherence", label: "이행 분석", ask: "내가 이 전략 잘 지키고 있어?" },
  { key: "changes", label: "변경점", ask: "전략이 어떻게 바뀌었어?" },
  { key: "check", label: "매매 전 체크", ask: "지금 매수 조건 충족됐어?" },
  { key: "fit", label: "나와 맞나", ask: "내가 이 전략 잘 활용할 수 있을까?" },
];
export type Target = { key: string; kind: "stock" | "trader"; id: string; name: string; months?: string[] };
export type Reply = { intent: Intent; target: Target; evidence: StrategyEvidence[]; answer: string; points: { text: string; refs: string[] }[] };

export function detectIntent(q: string): Intent {
  if (/충족|지금\s*(?:사|매수|들어가)|진입\s*조건.*(?:됐|맞)|살\s*(?:때|타이밍)|매수해도|들어가도/.test(q)) return "check";
  if (/지키|이행|잘\s*(?:하고|따르|따라)|어겼|어기|실행/.test(q)) return "adherence";
  if (/바뀌|바꿨|변경|달라|버전|수정/.test(q)) return "changes";
  if (/맞는|맞을|활용|어울|나한테|나에게|나랑/.test(q)) return "fit";
  return "about";
}
/** 질문에 대상 이름이 있으면 그것 (트레이더 이름 · 종목 이름) */
export function detectTarget(q: string, targets: Target[]): Target | null {
  return targets.find((t) => q.includes(t.name.replace(/ 전략$/, ""))) ?? null;
}

const won = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const kst = (t: number) => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10);

// 한 번 받은 것은 다시 안 받음
let tradesCache: Promise<Trade[] | null> | null = null;
const myTrades = () => (tradesCache ??= recentTrades().catch(() => null));
const barsCache = new Map<string, Promise<Bar[]>>();
function daily(code: string, market: string): Promise<Bar[]> {
  const key = `${market}:${code}`;
  if (!barsCache.has(key))
    barsCache.set(
      key,
      (async () => {
        if (market !== "US") return (await fetchBars(code, "1d", undefined, 400)).bars;
        for (const ex of ["ND", "NY", "NA"] as UsExchange[]) {
          const b = await fetchBars(code, "1d", undefined, 400, ex)
            .then((r) => r.bars)
            .catch(() => [] as Bar[]);
          if (b.length) return b;
        }
        return [];
      })().catch(() => []),
    );
  return barsCache.get(key)!;
}
const indexOn = (bars: Bar[], d: string) => {
  let k = -1;
  for (let i = 0; i < bars.length; i++) if (kst(bars[i].time) <= d) k = i;
  return k;
};

/** 전략 문장 → 진입 · 손절 · 정리 */
function splitRule(desc: string) {
  const parts = desc.split(/[.·]\s+|,\s+/).map((s) => s.trim()).filter(Boolean);
  return {
    entry: parts.filter((s) => !/손절|이탈|정리|목표|청산/.test(s)),
    stop: parts.filter((s) => /손절|이탈/.test(s)),
    exit: parts.filter((s) => /정리|목표|청산/.test(s) && !/손절/.test(s)),
  };
}

export async function answerLocally(q: string, intent: Intent, target: Target, records: TradeRecord[]): Promise<Reply> {
  const evidence: StrategyEvidence[] = [];
  const add = (label: string, text: string) => {
    const id = `E${evidence.length + 1}`;
    evidence.push({ id, label, text });
    return id;
  };
  const points: Reply["points"] = [];
  const say = (text: string, ...refs: string[]) => points.push({ text, refs: refs.filter(Boolean) });
  const trades = await myTrades();
  const rounds: MyRound[] = trades ? pairTrades(trades) : [];
  const nameOf = (c: string) => records.find((r) => r.symbol === c)?.symbolName ?? c;

  // ── 내 종목 전략 ──
  if (target.kind === "stock") {
    const g = await gatherStock(target.id, target.name, records);
    g.evidence.forEach((e) => evidence.push(e));
    const ref = (label: string) => evidence.find((e) => e.label === label)?.id ?? "";
    if (intent === "changes") {
      const ch = planChanges(records, [target.id], nameOf);
      const id = ch.length ? add("전략 변경 이력", ch.map((c) => `${c.at.slice(0, 10)} ${c.text}`).join(" / ")) : add("전략 변경 이력", "가격(매수 · 손절 · 목표)을 바꾼 기록이 없어요.");
      if (ch.length) {
        say(`${target.name} 종목 전략은 ${ch.length}번 바뀌었어요. 가장 최근: ${ch[0].at.slice(0, 10)} ${ch[0].text}.`, id);
        const lowered = ch.filter((c) => c.bad);
        if (lowered.length) say(`이 중 ${lowered.length}번은 손절선을 내린 거예요. 손실 중에 기준을 완화한 건 아닌지 돌아보세요.`, id);
      } else say("매수 · 손절 · 목표 가격을 바꾼 기록은 없어요.", id);
    } else if (intent === "adherence" || intent === "fit") {
      const rv = reviewRounds(records, rounds.filter((r) => r.symbol === target.id), nameOf);
      const id = ref("내 매매 기록");
      if (!rv.length) say(`${target.name}을(를) 매매한 기록이 없어요.`, id);
      else {
        const bad = (k: string) => rv.filter((r) => r.flags.some((f) => f.kind === k)).length;
        say(`${target.name} 매매 ${rv.length}번 중 계획 없이 산 게 ${bad("noplan")}번, 손절 늦음 ${bad("lateStop")}번, 목표 전 매도 ${bad("earlyTake")}번이에요.`, id);
        for (const h of habits(rv, planChanges(records, [target.id], nameOf)).slice(0, 2)) say(h.text, id);
      }
    } else if (intent === "about") {
      const id = ref("내 종목 전략");
      say(evidence.find((e) => e.id === id)?.text ?? "종목 전략이 없어요.", id);
    } else localAnswer(q, g).points.forEach((p) => points.push(p));
    return { intent, target, evidence, answer: "", points };
  }

  // ── 산 전략 (트레이더) ──
  const details = (await Promise.all((target.months ?? []).map((m) => fetchStrategyMonth(target.id, m).catch(() => null)))).filter((x): x is SimDetail => !!x);
  const rule = details[0]?.rule;
  const market = details[0]?.market ?? "KR";
  const months = details.flatMap((d) => d.months).sort((a, b) => a.month.localeCompare(b.month));
  const theirs = months.flatMap((m) => m.trades);
  const ruleId = rule ? add("전략 원문", `${rule.name}: ${rule.desc}`) : "";
  const verId = add("적용 버전", months.length ? `연 전략 ${months.length}개 (${months.map((m) => m.month).join(", ")}). 최신 버전 ${months.at(-1)!.month}` : "연 전략이 없어요.");
  const fmt = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: market === "US" ? 2 : 0 });

  if (intent === "about") {
    const s = splitRule(rule?.desc ?? "");
    const exId = theirs.length ? add("매매 예시", theirs.slice(0, 3).map((t) => `${t.entry.d} ${t.name} 매수 근거 "${t.entry.why}" → ${t.exit.why} (${pct(t.ret)})`).join(" / ")) : "";
    if (s.entry.length) say(`매수 조건: ${s.entry.join(", ")}.`, ruleId);
    if (s.stop.length) say(`손절: ${s.stop.join(", ")}.`, ruleId);
    if (s.exit.length) say(`정리: ${s.exit.join(", ")}.`, ruleId);
    say(`지금 적용되는 건 ${months.at(-1)?.month ?? "—"} 버전이에요.`, verId);
    if (exId) say(`실제로는 "${theirs[0].entry.why}" 같은 자리에서 샀어요.`, exId);
  } else if (intent === "changes") {
    const lines = months.map((m) => {
      const t = m.trades[0];
      const lv = t?.lines.find((l) => "a" in l) as { label: string; a: [string, number] } | undefined;
      return `${m.month}: ${m.trades.length ? `${m.trades.map((x) => x.name).filter((v, i, a) => a.indexOf(v) === i).join(" · ")} 매매 ${m.trades.length}건${lv ? `, 기준선 ${lv.label} ${fmt(lv.a[1])}` : ""}` : "매매 없음 (기다림)"}`;
    });
    const id = add("버전별 내용", lines.join(" / "));
    say(`규칙(${rule?.name ?? "—"})은 연 버전 모두 같아요. 달라진 건 버전마다 고른 종목과 기준 가격이에요.`, ruleId, id);
    if (months.length > 1) say(`가장 최근 두 버전: ${lines.at(-2)} → ${lines.at(-1)}.`, id);
  } else if (intent === "check") {
    // 질문에 종목 이름이 있으면 그 종목, 없으면 트레이더가 다룬 종목들
    const named = (details[0]?.symbols ?? []).filter((s) => q.includes(s.name));
    const cands = (named.length ? named : (details[0]?.symbols ?? [])).slice(0, 4);
    const rows: string[] = [];
    let best: { name: string; ok: number; n: number; miss: string[] } | null = null;
    for (const s of cands) {
      const bars = await daily(s.code, market);
      const r = rule ? checkRule(rule.key, bars, fmt) : null;
      if (!r) continue;
      const ok = r.checks.filter((c) => c.ok).length;
      const miss = r.checks.filter((c) => !c.ok).map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ""}`);
      rows.push(`${s.name} ${kst(bars.at(-1)!.time)}: 조건 ${r.checks.length}개 중 ${ok}개 충족${miss.length ? ` · 미충족: ${miss.join(", ")}` : ""}`);
      if (!best || ok / r.checks.length > best.ok / best.n) best = { name: s.name, ok, n: r.checks.length, miss };
    }
    const id = add("오늘 조건 확인", rows.join(" / ") || "확인할 수 있는 종목이 없어요 (일봉 136개 이상 필요).");
    if (best) {
      say(best.ok === best.n ? `${best.name}은(는) 오늘 매수 조건 ${best.n}개를 모두 충족해요. 손절 기준까지 정한 뒤 판단하세요.` : `가장 가까운 ${best.name}도 조건 ${best.n}개 중 ${best.ok}개 충족이에요. 미충족: ${best.miss.join(", ")}.`, ruleId, id);
      if (rows.length > 1) say("다른 종목 결과는 근거에 있어요.", id);
    } else say("오늘 조건을 확인할 수 있는 종목이 없어요.", id);
  } else {
    // adherence · fit: 연 뒤에 한 내 매매
    const from = `${months[0]?.month ?? "9999-12"}-01`;
    const mine = rounds.filter((r) => r.entry.d >= from);
    const buyCount = new Map<string, number>();
    for (const t of trades ?? []) if (t.side === "BUY") buyCount.set(t.symbol, (buyCount.get(t.symbol) ?? 0) + 1);
    let kept = 0;
    let checked = 0;
    const rows: string[] = [];
    for (const r of mine.slice(0, 10)) {
      const bars = await daily(r.symbol, market);
      const res = rule ? checkRule(rule.key, bars, fmt, indexOn(bars, r.entry.d)) : null;
      const ok = res ? res.checks.every((c) => c.ok) : null;
      if (ok !== null) (checked++, ok && kept++);
      rows.push(`${r.entry.d} ${nameOf(r.symbol)} 매수 ${won(Math.round(r.entry.px))}${r.exit ? ` → ${r.exit.d} ${pct(r.ret ?? 0)}` : " · 보유 중"}: ${ok === null ? "조건 확인 불가" : ok ? "진입 조건 맞음" : `진입 조건 안 맞음 (${res!.checks.filter((c) => !c.ok).map((c) => c.label).join(", ")})`}`);
    }
    const myId = add("내 매매 기록 (연 뒤)", rows.join(" / ") || `${from} 뒤 내 매매가 없어요.`);
    const rv = reviewRounds(records, mine, nameOf);
    const late = rv.filter((r) => r.flags.some((f) => f.kind === "lateStop")).length;
    const extra = mine.filter((r) => (buyCount.get(r.symbol) ?? 0) > 1).length;
    const a = statsOf(theirs.map((t) => ({ ret: t.ret, days: Math.round((Date.parse(t.exit.d) - Date.parse(t.entry.d)) / 86_400_000) })));
    const b = statsOf(mine);
    const statId = add("성격 비교", `트레이더: 매매 ${a.n}건 · 이긴 비율 ${a.winRate?.toFixed(0) ?? "—"}% · 평균 보유 ${a.avgDays?.toFixed(1) ?? "—"}일 · 계획대로 ${theirs.filter((t) => t.followed).length}건 / 나: 매매 ${b.n}건 · 끝난 ${b.closed}건 · 이긴 비율 ${b.winRate?.toFixed(0) ?? "—"}% · 평균 보유 ${b.avgDays?.toFixed(1) ?? "—"}일 · 손절 늦음 ${late}건 · 추가 매수 ${extra}건`);
    if (intent === "adherence") {
      if (!mine.length) say(`${from} 뒤로 내 매매가 없어서 이행을 볼 수 없어요.`, myId);
      else {
        say(`최근 ${mine.slice(0, 10).length}회 매매 중 ${checked}회를 확인했고, ${kept}회가 이 전략의 진입 조건을 지켰어요.`, myId, ruleId);
        if (extra) say(`${extra}회는 같은 종목을 여러 번 나눠 산 추가 매수였어요 (전략에 없는 매수인지 확인).`, myId);
        if (late) say(`${late}회는 손절선 아래에서 늦게 팔았어요.`, statId);
      }
    } else {
      if (a.avgDays !== null && b.avgDays !== null) say(b.avgDays < a.avgDays * 0.5 ? `이 전략은 평균 ${a.avgDays.toFixed(1)}일 들고 가는데 나는 평균 ${b.avgDays.toFixed(1)}일이에요. 빨리 파는 습관이면 이 전략의 수익 구간을 놓치기 쉬워요.` : `보유 기간은 비슷해요 (전략 ${a.avgDays.toFixed(1)}일 · 나 ${b.avgDays.toFixed(1)}일).`, statId);
      else say("끝난 매매가 적어서 보유 기간은 아직 비교할 수 없어요.", statId);
      say(late ? `손절이 늦은 매매가 ${late}건 있어요. 이 전략은 손절선을 지키는 게 전제라 그 부분부터 맞춰야 해요.` : "손절을 늦게 한 기록은 없어요.", statId, ruleId);
      if (kept < checked) say(`연 뒤 매매 ${checked}회 중 ${checked - kept}회는 이 전략의 진입 조건과 달랐어요. 조건이 다 맞을 때까지 기다리는 연습이 필요해요.`, myId);
    }
  }
  return { intent, target, evidence, answer: "", points };
}
