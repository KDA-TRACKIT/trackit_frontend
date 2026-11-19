// 종목 전략 (2026-11-19 회의): 종목마다 메모 · 그은 선이 계속 쌓이는 한 장
//   - 기본은 노트로 받고, 매매(체결)를 연결. 쌓인 것은 본인이 지우지 않는 한 남음
//   - 고치면 새 메모로 쌓임 (예전 메모는 고치기 전 그대로 기록에 남음). 같은 선(같은 열쇠)이 다음 메모에 또 오면 새 것으로 바뀜
//   - 매도할 때 그 시점까지 쌓인 전략의 이행률: 쌓인 지지 · 저항선마다 달성 1 / 0 의 평균
//       달성 = 보유 기간(직전 매수 ~ 매도, 선을 그은 뒤부터) 동안 가격이 그 선을 지켰는가 (종가 기준, 0.5% 여유)
//         지지선: 종가가 선 아래로 내려간 날이 없으면 1 · 저항선: 종가가 선 위로 올라간 날이 없으면 1
//       나눌 수 없는데 투자자가 고르지 않은 선(role = null)은 빠짐
//       매도 때 시장가와 가장 가까운 지지선 5개 · 저항선 5개만 셈 (2026-11-19 회의: 선을 많이 그어 이행률을 올리는 것 방지)
//   - 일관성 지표: 월 안은 바꾼 횟수만큼 메모끼리, 월 사이는 그 달 전략 대비 직전 달 전략이 이어진 비율 (consistency)
import type { Bar } from "./interval";
import { classify, type TradeRecord } from "./records";
import { lineValueAt, type NoteLine } from "../app/workshop/lineLadder";

const TOL = 0.005;
/** 이행률에 세는 선 수: 지지 · 저항 각각 (시장가에 가까운 순) */
export const NEAREST_LINES = 5;
const at = (r: Pick<TradeRecord, "date" | "noteTime">) => `${r.date} ${r.noteTime}`;
/** 체결 시각 (메모 날짜 기준) */
const execAt = (r: TradeRecord) => `${r.date} ${r.executionTime}`;
export const isSell = (side?: string) => /매도|SELL/i.test(side ?? "");
export const isBuy = (side?: string) => /매수|BUY/i.test(side ?? "");

export type StrategyLine = NoteLine & { since: string; noteId: string };

/** until(“YYYY-MM-DD HH:MM:SS”) 시점까지 쌓인 선 (같은 열쇠는 나중 것) */
export function accumulate(records: TradeRecord[], until?: string): StrategyLine[] {
  const map = new Map<string, StrategyLine>();
  for (const r of [...records].sort((a, b) => at(a).localeCompare(at(b)))) {
    if (until && at(r) > until) break;
    for (const l of r.lines ?? []) map.set(l.key, { ...l, since: at(r), noteId: r.id });
  }
  return [...map.values()];
}

/** 연결된 체결 (시각순) */
export function trades(records: TradeRecord[]) {
  return records
    .filter((r) => r.executionTime && (isBuy(r.side) || isSell(r.side)))
    .map((r) => ({ id: r.id, at: execAt(r), side: isSell(r.side) ? ("매도" as const) : ("매수" as const), quantity: r.quantity ?? 0 }))
    .filter((t, i, all) => all.findIndex((x) => x.at === t.at && x.side === t.side) === i)
    .sort((a, b) => a.at.localeCompare(b.at));
}

const kstDate = (sec: number) => new Date(sec * 1000 + 9 * 3_600_000).toISOString().slice(0, 10);

export type LineCheck = { line: StrategyLine; held: boolean | null };
export type SellCheck = { sellAt: string; from: string; checks: LineCheck[]; met: number; total: number; rate: number | null };

/** 매도 한 번의 이행률. bars 는 일봉 */
export function checkSell(records: TradeRecord[], sellAt: string, bars: Bar[]): SellCheck {
  const list = trades(records);
  const buy = [...list].reverse().find((t) => t.side === "매수" && t.at < sellAt);
  const sellDay = sellAt.slice(0, 10);
  // 매도한 날 종가(없으면 그 전 마지막 봉)에 가까운 지지 5개 · 저항 5개만
  const sellBar = [...bars].reverse().find((b) => kstDate(b.time) <= sellDay);
  const near = (l: StrategyLine) => (sellBar ? Math.abs(lineValueAt(l, sellBar.time, bars) - sellBar.close) : 0);
  const all = accumulate(records, sellAt);
  const nearest = (role: StrategyLine["role"]) => all.filter((l) => l.role === role).sort((a, b) => near(a) - near(b)).slice(0, NEAREST_LINES);
  const lines = [...nearest("SUPPORT"), ...nearest("RESISTANCE")];
  const from = buy?.at ?? lines.map((l) => l.since).sort()[0] ?? sellAt;
  const checks = lines.map((line) => {
    const start = (line.since > from ? line.since : from).slice(0, 10);
    const days = bars.filter((b) => {
      const d = kstDate(b.time);
      return d >= start && d <= sellDay;
    });
    if (!days.length) return { line, held: null };
    const broken = days.some((b) => {
      const v = lineValueAt(line, b.time, bars);
      return line.role === "SUPPORT" ? b.close < v * (1 - TOL) : b.close > v * (1 + TOL);
    });
    return { line, held: !broken };
  });
  const judged = checks.filter((c) => c.held !== null);
  const met = judged.filter((c) => c.held).length;
  return { sellAt, from, checks, met, total: judged.length, rate: judged.length ? met / judged.length : null };
}

/** 종목 기록만 (시장 전반 생각 제외) */
/** 종목 기록 + 그 종목으로 정량 전략을 적은 뉴스 · 경제 지표 메모 */
export const symbolRecords = (all: TradeRecord[], code: string) => all.filter((r) => (r.symbol === code && classify(r) !== "thought") || (!r.symbol && r.target?.code === code));

/**
 * 일관성 지표 (2026-11-19 회의): 전략이 얼마나 유지되는가
 *   전략 = 메모 하나에 담긴 선 열쇠 묶음 (차트 노트 저장은 그때 차트의 선을 모두 담음, 지지 · 저항으로 나뉜 것만). 위치만 고친 선(같은 열쇠)은 유지
 *   유지율(이번, 직전) = |이번 ∩ 직전| ÷ |이번|
 *   - 월 안: 그 달에 바꾼 횟수만큼 메모끼리 유지율을 내고 평균 (메모가 1개뿐이면 null)
 *       예) A → A,B → A,B,D → B,C : 50% · 66% · 50%
 *   - 월 사이: 그 달의 전략(달 마지막 메모) 대비 직전 달 전략에서 반영된 비율
 *       예) 1월 A,B → 2월 B,C : B 만 이어짐 → 50%
 *   rate = 월 사이 유지율의 평균 (2개월 이상일 때)
 */
type Step = { at: string; kept: number; total: number };
const keysOf = (r: TradeRecord) => new Set((r.lines ?? []).filter((l) => l.role).map((l) => l.key));
const keep = (cur: Set<string>, prev: Set<string>) => ({ kept: [...cur].filter((k) => prev.has(k)).length, total: cur.size });

export function consistency(records: TradeRecord[]) {
  const points = [...records].filter((r) => keysOf(r).size).sort((a, b) => at(a).localeCompare(at(b)));
  const byMonth = new Map<string, TradeRecord[]>();
  for (const r of points) byMonth.set(r.date.slice(0, 7), [...(byMonth.get(r.date.slice(0, 7)) ?? []), r]);
  let prevMonth: Set<string> | null = null;
  const months = [...byMonth.entries()].map(([month, list]) => {
    const steps: Step[] = list.slice(1).map((r, i) => ({ at: at(r), ...keep(keysOf(r), keysOf(list[i])) }));
    const within = steps.length ? steps.reduce((a, s) => a + s.kept / s.total, 0) / steps.length : null;
    const end = keysOf(list[list.length - 1]);
    const vs = prevMonth ? keep(end, prevMonth) : null;
    prevMonth = end;
    return { month, memos: list.length, changes: steps.length, steps, within, vsPrev: vs ? vs.kept / vs.total : null, kept: vs?.kept ?? null, total: vs?.total ?? null };
  });
  const across = months.filter((m) => m.vsPrev !== null);
  return { months, rate: across.length ? across.reduce((a, m) => a + m.vsPrev!, 0) / across.length : null };
}

/** 지금 보이는 메모: 고쳐서 새 메모로 바뀐 예전 메모는 뺌 (예전 메모는 기록에 그대로 남아 있음) */
export const currentRecords = (list: TradeRecord[]) => {
  const replaced = new Set(list.flatMap((r) => (r.replaces ? [r.replaces] : [])));
  return list.filter((r) => !replaced.has(r.id));
};
