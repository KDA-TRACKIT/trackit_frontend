// 알고리즘 규칙을 사람이 읽는 문장으로 (규칙 카드·편집기 미리보기)
import type { AlgoCatalog, AlgoGroup, AlgoOperand, AlgoOperator, AlgoRule } from "./types/algo";

export const OP_LABEL: Record<AlgoOperator, string> = {
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  crossesAbove: "상향 돌파",
  crossesBelow: "하향 돌파",
};

const SOURCE_LABEL: Record<string, string> = { close: "종가", open: "시가", high: "고가", low: "저가", volume: "거래량", hl2: "(고+저)/2", hlc3: "(고+저+종)/3" };

export function describeOperand(o: AlgoOperand, catalog?: AlgoCatalog | null): string {
  if ("value" in o) return String(o.value);
  const def = catalog?.indicators.find((i) => i.name === o.indicator);
  const params = o.params && Object.keys(o.params).length ? `(${Object.values(o.params).join(",")})` : "";
  const field = o.field && def?.fields ? ` ${def.fields.labels[o.field] ?? o.field}` : o.field ? ` ${o.field}` : "";
  const source = o.source && o.source !== "close" ? ` [${SOURCE_LABEL[o.source] ?? o.source}]` : "";
  const offset = o.offset ? ` ${o.offset}봉 전` : "";
  const mult = o.multiplier && o.multiplier !== 1 ? ` ×${o.multiplier}` : "";
  return `${def?.label ?? o.indicator}${params}${field}${source}${offset}${mult}`;
}

export function describeGroup(g: AlgoGroup, catalog?: AlgoCatalog | null): string {
  if ("left" in g) return `${describeOperand(g.left, catalog)} ${OP_LABEL[g.op]} ${describeOperand(g.right, catalog)}`;
  if ("all" in g) return g.all.map((c) => (("left" in c) ? describeGroup(c, catalog) : `(${describeGroup(c, catalog)})`)).join(" 그리고 ");
  if ("any" in g) return g.any.map((c) => (("left" in c) ? describeGroup(c, catalog) : `(${describeGroup(c, catalog)})`)).join(" 또는 ");
  return `아님(${describeGroup(g.not, catalog)})`;
}

export function describeRule(rule: AlgoRule, catalog?: AlgoCatalog | null) {
  const base = `${rule.timeframe}분봉 · ${rule.quantity.toLocaleString("ko-KR")}주 · 하루 최대 ${rule.maxOrdersPerDay ?? 10}회`;
  if (rule.strategy === "RSI") return { entry: `RSI(${rule.period}) < ${rule.buyBelow}`, exit: `RSI(${rule.period}) > ${rule.sellAbove}`, base };
  if (rule.strategy === "SMA_CROSS") return { entry: `이동평균 ${rule.fast}이 ${rule.slow}을 상향 돌파`, exit: `이동평균 ${rule.fast}이 ${rule.slow}을 하향 돌파`, base };
  const exits = [rule.exit ? describeGroup(rule.exit, catalog) : null, rule.stopLossPct ? `손절 -${rule.stopLossPct}%` : null, rule.takeProfitPct ? `익절 +${rule.takeProfitPct}%` : null].filter(Boolean);
  return { entry: describeGroup(rule.entry, catalog), exit: exits.join(" · "), base };
}

export const STRATEGY_LABEL: Record<AlgoRule["strategy"], string> = { RSI: "RSI 프리셋", SMA_CROSS: "이동평균 교차", CUSTOM: "조건 조합" };
