// 종목 전략 (2026-11-19 회의): 종목마다 메모 · 그은 선이 계속 쌓이는 한 장
//   - 기본은 노트로 받고, 매매(체결)를 연결. 쌓인 것은 본인이 지우지 않는 한 남음
//   - 고치면 새 메모로 쌓임 (예전 메모는 고치기 전 그대로 기록에 남음). 같은 선(같은 열쇠)이 다음 메모에 또 오면 새 것으로 바뀜
//   - 매도할 때 그 시점까지 쌓인 전략의 이행률: 쌓인 지지 · 저항선마다 달성 1 / 0 의 평균
//       달성 = 보유 기간(직전 매수 ~ 매도, 선을 그은 뒤부터) 동안 가격이 그 선을 지켰는가 (종가 기준, 0.5% 여유)
//         지지선: 종가가 선 아래로 내려간 날이 없으면 1 · 저항선: 종가가 선 위로 올라간 날이 없으면 1
//       나눌 수 없는데 투자자가 고르지 않은 선(role = null)은 빠짐
import type { Bar } from "./interval";
import { classify, type TradeRecord } from "./records";
import { lineValueAt, type NoteLine } from "../app/workshop/lineLadder";

const TOL = 0.005;
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
  const lines = accumulate(records, sellAt).filter((l) => l.role);
  const from = buy?.at ?? lines.map((l) => l.since).sort()[0] ?? sellAt;
  const sellDay = sellAt.slice(0, 10);
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
export const symbolRecords = (all: TradeRecord[], code: string) => all.filter((r) => r.symbol === code && classify(r) !== "thought");
