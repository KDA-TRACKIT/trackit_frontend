// 내 노트 · 복기 (2026-11-20): 내가 쓴 종목 전략(계획)과 실제 체결을 맞대어 보기
//   매매 한 번마다: 산 날까지 쓴 마지막 종목 전략의 매수 · 손절 · 목표 가격 vs 실제 매수가 · 매도가
//     계획 없이 샀나 · 계획가보다 비싸게 샀나 · 손절선 아래로 버텼나(늦은 손절) · 목표 전에 팔았나(이른 익절)
//   종목 전략이 바뀐 흐름: 손절선을 내린 적(손실 중 기준 완화)이 있나
//   전체 습관: 위 항목을 모아 자주 반복되는 것부터 한 줄씩
//   계획 칸은 저장된 글에서 투자자가 쓴 문장만 읽음(ownItems) — AI 문단 · 자동 줄은 계획으로 치지 않음
import type { TradeRecord } from "./records";
import { ownItems, priceIn } from "./strategyText";
import { currentRecords } from "./strategy";
import type { MyRound } from "./strategy-use";

export type Plan = { at: string; recordId: string; buy: number | null; stop: number | null; target: number | null; sell: number | null };
export type Flag = { kind: "noplan" | "chase" | "lateStop" | "earlyTake" | "hitTarget" | "keptStop" | "followed"; text: string; bad: boolean };
/** latest: 보유 중인 매매면 지금까지 쓴 마지막 계획 (산 뒤에 세운 것도) */
export type RoundReview = { round: MyRound; name: string; plan: Plan | null; latest: Plan | null; flags: Flag[] };
export type PlanChange = { symbol: string; name: string; at: string; field: "손절" | "목표" | "매수"; from: number; to: number; text: string; bad: boolean };

const won = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/** 메모 한 장의 계획 칸 (가격이 적힌 문장만) */
export function planOf(r: TradeRecord): Plan {
  const p: Plan = { at: `${r.date} ${r.noteTime}`, recordId: r.id, buy: null, stop: null, target: null, sell: null };
  for (const it of ownItems(r.text ?? "")) {
    const v = priceIn(it.text);
    if (v === null) continue;
    if (it.kind === "buy" && p.buy === null) p.buy = v;
    else if (it.kind === "stop" && p.stop === null) p.stop = v;
    else if (it.kind === "target" && p.target === null) p.target = v;
    else if (it.kind === "sell" && p.sell === null) p.sell = v;
  }
  return p;
}
const hasPlan = (p: Plan) => p.buy !== null || p.stop !== null || p.target !== null || p.sell !== null;

/** 종목의 전략 메모 (오래된 것부터) — 뉴스 · 경제 메모에 적은 그 종목 전략도 */
const strategyNotes = (records: TradeRecord[], code: string) =>
  records.filter((r) => r.symbol === code || (!r.symbol && r.target?.code === code)).sort((a, b) => `${a.date} ${a.noteTime}`.localeCompare(`${b.date} ${b.noteTime}`));

export function reviewRounds(records: TradeRecord[], rounds: MyRound[], nameOf: (code: string) => string): RoundReview[] {
  return rounds.map((round) => {
    // 산 날까지 쓴 메모 중 가격 계획이 있는 마지막 것 (칸마다 가장 최근 값을 이어받음)
    const notes = strategyNotes(records, round.symbol).filter((r) => r.date <= round.entry.d);
    let plan = null as Plan | null;
    for (const r of notes) {
      const p = planOf(r);
      if (!hasPlan(p)) continue;
      plan = { at: p.at, recordId: p.recordId, buy: p.buy ?? plan?.buy ?? null, stop: p.stop ?? plan?.stop ?? null, target: p.target ?? plan?.target ?? p.sell ?? plan?.target ?? null, sell: p.sell ?? plan?.sell ?? null };
    }
    // 보유 중이면 지금 계획: 고치거나 합쳐서 사라진 예전 노트는 빼고 (종목 전략 화면 · 전략 분석과 같은 기준)
    let latest = null as Plan | null;
    if (!round.exit)
      for (const r of currentRecords(strategyNotes(records, round.symbol))) {
        const p = planOf(r);
        if (hasPlan(p)) latest = { at: p.at, recordId: p.recordId, buy: p.buy ?? latest?.buy ?? null, stop: p.stop ?? latest?.stop ?? null, target: p.target ?? latest?.target ?? p.sell ?? null, sell: p.sell ?? latest?.sell ?? null };
      }
    const flags: Flag[] = [];
    const e = round.entry.px;
    if (!plan) flags.push({ kind: "noplan", text: notes.length ? "산 날까지 쓴 노트에 매수 · 손절 · 목표 가격이 없었어요" : "계획 노트 없이 샀어요", bad: true });
    else {
      if (plan.buy !== null && e > plan.buy * 1.02) flags.push({ kind: "chase", text: `계획 매수가 ${won(plan.buy)}보다 ${pct((e / plan.buy - 1) * 100)} 비싸게 샀어요`, bad: true });
      const x = round.exit?.px;
      if (x !== undefined && plan.stop !== null) {
        if (x < plan.stop * 0.99) flags.push({ kind: "lateStop", text: `손절선 ${won(plan.stop)}보다 ${pct((x / plan.stop - 1) * 100)} 아래에서 팔았어요 (늦은 손절)`, bad: true });
        else if (x < e) flags.push({ kind: "keptStop", text: `손절선 ${won(plan.stop)} 근처에서 정리했어요`, bad: false });
      }
      if (x !== undefined && plan.target !== null) {
        if (x >= plan.target * 0.99) flags.push({ kind: "hitTarget", text: `목표 ${won(plan.target)}에서 팔았어요`, bad: false });
        else if (x > e) flags.push({ kind: "earlyTake", text: `목표 ${won(plan.target)}까지 ${pct((plan.target / x - 1) * 100)} 남기고 먼저 팔았어요`, bad: true });
      }
      if (!flags.some((f) => f.bad) && x !== undefined) flags.push({ kind: "followed", text: "계획대로 사고팔았어요", bad: false });
      if (x === undefined && plan.stop !== null) flags.push({ kind: "followed", text: `보유 중 · 손절선 ${won(plan.stop)}`, bad: false });
    }
    if (!plan && latest && latest.at.slice(0, 10) > round.entry.d) flags.push({ kind: "followed", text: `산 뒤 ${latest.at.slice(5, 10).replace("-", ".")}에 계획을 세웠어요 — 손절 ${latest.stop === null ? "없음" : won(latest.stop)} · 목표 ${latest.target === null ? "없음" : won(latest.target)}`, bad: latest.stop === null });
    return { round, name: nameOf(round.symbol), plan, latest, flags };
  });
}

/** 종목 전략이 바뀐 흐름: 칸 값이 바뀐 곳만 (손절선을 내린 건 기준 완화로 표시) */
export function planChanges(records: TradeRecord[], codes: string[], nameOf: (code: string) => string): PlanChange[] {
  const out: PlanChange[] = [];
  for (const code of codes) {
    let prev = null as Plan | null;
    for (const r of strategyNotes(records, code)) {
      const p = planOf(r);
      if (!hasPlan(p)) continue;
      if (prev) {
        const cmp = (field: PlanChange["field"], a: number | null, b: number | null) => {
          if (a === null || b === null || a === b) return;
          const down = b < a;
          const bad = field === "손절" && down;
          const text = field === "손절" ? (down ? `손절선을 ${won(a)} → ${won(b)}로 내렸어요` : `손절선을 ${won(a)} → ${won(b)}로 올렸어요`) : `${field} ${won(a)} → ${won(b)}`;
          out.push({ symbol: code, name: nameOf(code), at: p.at, field, from: a, to: b, text, bad });
        };
        cmp("매수", prev.buy, p.buy);
        cmp("손절", prev.stop, p.stop);
        cmp("목표", prev.target, p.target);
      }
      prev = { ...p, buy: p.buy ?? prev?.buy ?? null, stop: p.stop ?? prev?.stop ?? null, target: p.target ?? prev?.target ?? null };
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export type Habit = { text: string; bad: boolean; count: number };

/** 자주 반복되는 습관 (나쁜 것부터, 2번 이상이거나 비율로 의미 있는 것) */
export function habits(reviews: RoundReview[], changes: PlanChange[]): Habit[] {
  const closed = reviews.filter((r) => r.round.exit);
  const n = reviews.length;
  const count = (k: Flag["kind"]) => reviews.filter((r) => r.flags.some((f) => f.kind === k)).length;
  const out: Habit[] = [];
  const noplan = count("noplan");
  if (noplan) out.push({ text: `매매 ${n}번 중 ${noplan}번은 가격 계획 없이 샀어요`, bad: true, count: noplan });
  const late = count("lateStop");
  if (late) out.push({ text: `손절선 아래로 버티다 판 매매가 ${late}번이에요`, bad: true, count: late });
  const early = count("earlyTake");
  if (early) out.push({ text: `목표 전에 먼저 판 매매가 ${early}번이에요`, bad: true, count: early });
  const chase = count("chase");
  if (chase) out.push({ text: `계획가보다 2% 넘게 비싸게 산 매매가 ${chase}번이에요`, bad: true, count: chase });
  const lowered = changes.filter((c) => c.bad).length;
  if (lowered) out.push({ text: `손절선을 내린 적이 ${lowered}번 있어요`, bad: true, count: lowered });
  const wins = closed.filter((r) => (r.round.ret ?? 0) > 0);
  const losses = closed.filter((r) => (r.round.ret ?? 0) <= 0);
  const avg = (a: RoundReview[]) => a.reduce((s, r) => s + (r.round.ret ?? 0), 0) / (a.length || 1);
  const days = (a: RoundReview[]) => a.reduce((s, r) => s + (r.round.days ?? 0), 0) / (a.length || 1);
  if (wins.length && losses.length && days(losses) > days(wins) * 1.5)
    out.push({ text: `손실 매매를 이익 매매보다 오래 들고 있었어요 (평균 ${days(losses).toFixed(1)}일 vs ${days(wins).toFixed(1)}일)`, bad: true, count: losses.length });
  if (wins.length && losses.length && Math.abs(avg(losses)) > avg(wins) * 1.5)
    out.push({ text: `평균 손실(${pct(avg(losses))})이 평균 이익(${pct(avg(wins))})보다 커요`, bad: true, count: losses.length });
  const kept = closed.filter((r) => r.plan && !r.flags.some((f) => f.bad)).length;
  if (kept) out.push({ text: `계획대로 끝낸 매매가 ${kept}번이에요`, bad: false, count: kept });
  return out.sort((a, b) => Number(b.bad) - Number(a.bad) || b.count - a.count);
}

// ── 계획대로 했다면 (2026-11-21) ──
//   실제로 산 가격에서, 계획한 손절 · 목표를 그대로 지켰다면 어떻게 끝났을지를 일봉으로 따라가 봄 (만들어 낸 가격 없음)
//   · 산 다음 거래일부터 봄 — 일봉으로는 산 날 안의 순서(사기 전 저가인지)를 알 수 없어서
//   · 그날 저가가 손절선 이하면 손절, 고가가 목표 이상이면 익절. 한 봉에 둘 다 닿으면 손절로 봄(불리한 쪽)
//   · 갭으로 넘어서 시작한 날은 시가에 나간 것으로 (손절선보다 아래에서 시작하면 그 시가)
//   · 실제 매수가보다 높은 손절선 · 낮은 목표는 쓰지 않음. 끝까지 안 닿으면 마지막 종가 기준 '아직 진행 중'
export type DayBar = { d: string; open: number; high: number; low: number; close: number };
export type WhatIf = { ret: number; exit: { d: string; px: number } | null; why: "stop" | "target" | "open"; lastD: string };

export function ifFollowed(round: MyRound, plan: Plan | null, bars: DayBar[]): WhatIf | null {
  if (!plan) return null;
  const e = round.entry.px;
  const stop = plan.stop !== null && plan.stop < e ? plan.stop : null;
  const target = plan.target !== null && plan.target > e ? plan.target : null;
  if (stop === null && target === null) return null;
  const after = bars.filter((b) => b.d > round.entry.d);
  if (!after.length || !bars.some((b) => b.d <= round.entry.d)) return null;
  const ret = (px: number) => (px / e - 1) * 100;
  for (const b of after) {
    if (stop !== null && b.low <= stop) {
      const px = Math.min(stop, b.open);
      return { ret: ret(px), exit: { d: b.d, px }, why: "stop", lastD: b.d };
    }
    if (target !== null && b.high >= target) {
      const px = Math.max(target, b.open);
      return { ret: ret(px), exit: { d: b.d, px }, why: "target", lastD: b.d };
    }
  }
  const last = after[after.length - 1];
  return { ret: ret(last.close), exit: null, why: "open", lastD: last.d };
}
