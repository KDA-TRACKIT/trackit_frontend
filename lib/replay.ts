// 내 노트 · 복기형 재생 (2026-11-20): 한 종목에 대해 노트(그때의 뷰)와 실제 매매를 시간 순서로
//   노트 단계: 그때까지 쌓인 선(지지 · 저항) · 그때 쓴 매수 · 손절 · 목표 · 바뀐 점(가격 칸 · 선 추가 · 없어짐 · 지지↔저항)
//   매매 단계: 실제 체결(매수 · 매도) + 그 순간 계획과 비교(계획가보다 비싸게? 손절선 아래? 목표 전?)
import type { TradeRecord } from "./records";
import type { Trade } from "./api/performance";
import type { NoteLine } from "../app/workshop/lineLadder";
import { ownItems, priceIn } from "./strategyText";

export type ReplayPlan = { buy: number | null; stop: number | null; target: number | null };
export type ReplayStep =
  | { kind: "note"; at: number; date: string; time: string; text: string[]; plan: ReplayPlan; lines: NoteLine[]; changes: string[]; recordId: string }
  | { kind: "trade"; at: number; date: string; time: string; side: "매수" | "매도"; price: number; qty: number; plan: ReplayPlan; lines: NoteLine[]; checks: { text: string; ok: boolean }[] };

const won = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const priceOf = (l: NoteLine) => l.price ?? (l.low !== undefined && l.high !== undefined ? (l.low + l.high) / 2 : (l.pts?.at(-1)?.[1] ?? null));
const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString();
const roleTo = (r: NoteLine["role"]) => (r === "SUPPORT" ? "지지로" : r === "RESISTANCE" ? "저항으로" : "");
const roleName = (r: NoteLine["role"]) => (r === "SUPPORT" ? "지지" : r === "RESISTANCE" ? "저항" : "");
/** 내가 쓴 문장만: 전략 분석 채팅에서 남긴 글 · AI 요약 줄(○○ 183,100원 기준 · ~ 사이에서 판단 · 현재가 대비)은 뺌 */
const AI_LINE = /^[·•]|^\S.{0,30}\s[\d,.]+원\s*기준|사이에서 판단|현재가 대비|^\[전략 분석/;

export function buildReplay(records: TradeRecord[], trades: Trade[], code: string): ReplayStep[] {
  const notes = records
    .filter((r) => (r.symbol === code || (!r.symbol && r.target?.code === code)) && !/^\s*\[전략 분석/.test(r.text ?? ""))
    .map((r) => ({ r, at: Date.parse(`${r.date}T${r.noteTime}+09:00`) || 0 }))
    .sort((a, b) => a.at - b.at);
  const mine = trades
    .filter((t) => t.symbol === code)
    .map((t) => ({ t, at: Date.parse(t.executedAt) || 0 }))
    .sort((a, b) => a.at - b.at);

  const events = [...notes.map((n) => ({ type: "note" as const, ...n })), ...mine.map((m) => ({ type: "trade" as const, ...m }))].sort((a, b) => a.at - b.at);
  const out: ReplayStep[] = [];
  const lines = new Map<string, NoteLine>();
  let plan: ReplayPlan = { buy: null, stop: null, target: null };

  for (const e of events) {
    const iso = kst(e.at);
    const date = iso.slice(0, 10);
    const time = iso.slice(11, 16);
    if (e.type === "note") {
      const r = e.r;
      const items = ownItems(r.text ?? "").filter((it) => !AI_LINE.test(it.text.trim()));
      const next: ReplayPlan = { ...plan };
      for (const it of items) {
        const v = priceIn(it.text);
        if (v === null) continue;
        if (it.kind === "buy") next.buy = v;
        else if (it.kind === "stop") next.stop = v;
        else if (it.kind === "target" || it.kind === "sell") next.target = v;
      }
      const changes: string[] = [];
      const field = (k: keyof ReplayPlan, label: string) => {
        if (next[k] === plan[k]) return;
        if (plan[k] === null) changes.push(`${label} ${won(next[k]!)} 새로 정함`);
        else if (next[k] !== null) changes.push(`${label} ${won(plan[k]!)} → ${won(next[k]!)}${k === "stop" && next[k]! < plan[k]! ? " (손절선을 내림)" : ""}`);
      };
      field("buy", "매수");
      field("stop", "손절");
      field("target", "목표");
      // 선: 같은 열쇠면 바뀐 것, 처음 보는 열쇠면 새 선
      for (const l of r.lines ?? []) {
        const old = lines.get(l.key);
        const p = priceOf(l);
        if (!old) changes.push(`${roleName(l.role)}선 ${p ? won(Math.round(p)) : l.label} 새로 그음`.trim());
        else {
          const op = priceOf(old);
          if (op && p && Math.abs(op - p) / op > 0.003) changes.push(`${l.label} ${won(Math.round(op))} → ${won(Math.round(p))}으로 옮김`);
          if (old.role !== l.role && l.role) changes.push(`${won(Math.round(p ?? 0))} 선이 ${roleName(old.role)}에서 ${roleTo(l.role)} 바뀜`);
        }
        lines.set(l.key, l);
      }
      plan = next;
      out.push({ kind: "note", at: e.at, date, time, text: items.map((i) => i.text), plan: { ...plan }, lines: [...lines.values()], changes, recordId: r.id });
    } else {
      const t = e.t;
      const side = t.side === "BUY" ? "매수" : "매도";
      const price = Number(t.price);
      const checks: { text: string; ok: boolean }[] = [];
      if (side === "매수") {
        if (plan.buy === null && plan.stop === null) checks.push({ text: "가격 계획 없이 샀어요", ok: false });
        if (plan.buy !== null) checks.push({ text: price <= plan.buy * 1.02 ? `계획 매수가 ${won(plan.buy)} 근처에서 샀어요` : `계획 매수가 ${won(plan.buy)}보다 ${pct((price / plan.buy - 1) * 100)} 비싸게 샀어요`, ok: price <= plan.buy * 1.02 });
        if (plan.stop !== null) checks.push({ text: `손절선 ${won(plan.stop)}를 정해 두고 샀어요`, ok: true });
      } else {
        if (plan.stop !== null && price < plan.stop * 0.99) checks.push({ text: `손절선 ${won(plan.stop)}보다 ${pct((price / plan.stop - 1) * 100)} 아래에서 팔았어요 (늦은 손절)`, ok: false });
        else if (plan.stop !== null && price <= plan.stop * 1.02) checks.push({ text: `손절선 ${won(plan.stop)} 근처에서 정리했어요`, ok: true });
        if (plan.target !== null) checks.push(price >= plan.target * 0.99 ? { text: `목표 ${won(plan.target)}에서 팔았어요`, ok: true } : { text: `목표 ${won(plan.target)}까지 ${pct((plan.target / price - 1) * 100)} 남기고 팔았어요`, ok: false });
        if (plan.stop === null && plan.target === null) checks.push({ text: "손절 · 목표 없이 팔았어요", ok: false });
      }
      out.push({ kind: "trade", at: e.at, date, time, side, price, qty: Number(t.quantity), plan: { ...plan }, lines: [...lines.values()], checks });
    }
  }
  return out;
}
