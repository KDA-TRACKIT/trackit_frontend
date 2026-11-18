"use client";
// 노트 완성도 점검 (확인하고 저장 전에) — 2026-11-17 회의 '노트의 완성도'
//   노트 종류마다 필수 항목과 유효성 검사가 다름. 빠진 것은 그 자리에서 칩 · 입력으로 채움
//     매매 계획  진입 근거 · 진입 조건·가격 범위 · 손절 · 목표·청산 조건 · 비중   (롱: 손절 < 진입 < 목표, 범위 하한 < 상한, 비중 ≤ 100%)
//     보유 관리  현재 판단(유지·추가·축소·청산) · 변경 사유 · 손절·목표 갱신값   (손절을 내리면 '위험 확대')
//     분석·전망  대상 · 방향 · 기준값 · 기한                                     (기한은 미래, 기준값은 숫자)
//     회고      계획 대비 실제 차이 · 원인 · 다음에 바꿀 점                        (연결된 매매 사이클이 있어야)
//   필수를 다 채우고 검사를 통과하면 '계획'으로, 아니면 '관찰 메모'로 저장 (이행률의 '계획 있음'에 안 들어감)
import { useMemo, useState } from "react";
import type { Drawing } from "../../lib/drawing";
import { buildLadder } from "./lineLadder";
import { KIND_LABEL, type NoteKind, type Plan } from "./PlanConfirm";

export type PlanStatus = "plan" | "partial" | "none";
export type CheckContext = { symbolName?: string; prevStop?: number | null; hasCycle?: boolean };

/** "72,000~72,200" → [72000, 72200] */
export const nums = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, ""))).filter((n) => n > 0);

/** 메모 · 계획 칸에서 방향 읽기 (직접 고른 게 있으면 그것) */
function directionOf(plan: Plan, text: string): "매수" | "매도" | "" {
  if (plan.direction) return plan.direction;
  const all = `${text} ${plan.entry} ${plan.condition}`;
  if (/매도|팔[아고면기]|판다|청산|정리/.test(all)) return "매도";
  if (/매수|사[요고면기]|산다|진입|들어가/.test(all)) return "매수";
  return "";
}

const kst = () => new Date(Date.now() + 9 * 3_600_000);
/** "11.21까지" → 그 날짜(올해, 지났으면 내년)가 오늘 이후인지 */
function untilInFuture(until: string) {
  const m = until.match(/(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const t = kst();
  const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Date.UTC(t.getUTCFullYear(), +m[1] - 1, +m[2]) >= today;
}

type Item = { key: string; label: string; ok: boolean; value: string };

export function checkPlan(plan: Plan, text: string, ctx: CheckContext = {}) {
  const direction = directionOf(plan, text);
  const t = (s: string) => !!s.trim();
  let items: Item[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (plan.kind === "trade") {
    items = [
      { key: "entry", label: "진입 근거", ok: t(plan.entry) || t(text), value: plan.entry || (t(text) ? "메모에 있음" : "") },
      { key: "condition", label: "진입 조건 · 가격", ok: t(plan.condition), value: plan.condition },
      { key: "stop", label: "손절", ok: t(plan.stop), value: plan.stop },
      { key: "target", label: "목표 · 청산", ok: t(plan.target), value: plan.target },
      { key: "weight", label: "비중", ok: t(plan.weight), value: plan.weight },
    ];
    const range = nums(plan.condition);
    const lo = Math.min(...range);
    const hi = Math.max(...range);
    const stop = nums(plan.stop)[0];
    const target = nums(plan.target)[0];
    if (range.length >= 2 && range[0] >= range[1]) errors.push("가격 범위는 하한 < 상한 순서로 적어 주세요");
    if (range.length && stop && target) {
      const long = direction !== "매도";
      if (long && !(stop < lo && hi < target)) errors.push("매수 계획은 손절 < 진입 < 목표여야 해요");
      if (!long && !(target < lo && hi < stop)) errors.push("매도 계획은 목표 < 진입 < 손절이어야 해요");
    }
    const w = (plan.weight.match(/\d+(?:\.\d+)?(?=\s*%)/g) ?? []).map(Number);
    if (w.reduce((a, b) => a + b, 0) > 100) errors.push("비중 합이 100%를 넘어요");
  } else if (plan.kind === "hold") {
    items = [
      { key: "decision", label: "현재 판단", ok: !!plan.decision, value: plan.decision },
      { key: "reason", label: "변경 사유", ok: t(plan.reason), value: plan.reason },
      { key: "stop", label: "손절 갱신", ok: t(plan.stop), value: plan.stop },
      { key: "target", label: "목표 갱신", ok: t(plan.target), value: plan.target },
    ];
    const stop = nums(plan.stop)[0];
    if (stop && ctx.prevStop && (direction !== "매도" ? stop < ctx.prevStop : stop > ctx.prevStop))
      warnings.push(`위험 확대: 손절을 ${ctx.prevStop.toLocaleString("ko-KR")} → ${stop.toLocaleString("ko-KR")}로 ${direction !== "매도" ? "내렸어요" : "올렸어요"}`);
  } else if (plan.kind === "view") {
    items = [
      { key: "subject", label: "대상", ok: !!ctx.symbolName, value: ctx.symbolName ?? "" },
      { key: "viewDir", label: "방향", ok: !!plan.viewDir, value: plan.viewDir },
      { key: "level", label: "기준값", ok: nums(plan.level).length > 0, value: plan.level },
      { key: "until", label: "기한", ok: t(plan.until), value: plan.until },
    ];
    if (t(plan.level) && !nums(plan.level).length) errors.push("기준값은 숫자로 적어 주세요");
    if (t(plan.until) && untilInFuture(plan.until) === false) errors.push("기한이 이미 지났어요");
  } else {
    items = [
      { key: "diff", label: "계획 대비 차이", ok: t(plan.diff), value: plan.diff },
      { key: "cause", label: "원인", ok: t(plan.cause), value: plan.cause },
      { key: "next", label: "다음에 바꿀 점", ok: t(plan.next), value: plan.next },
    ];
    if (!ctx.hasCycle) errors.push("회고는 연결된 매매(체결)가 있어야 해요");
  }

  const filled = items.filter((i) => i.ok).length;
  const total = items.length;
  const status: PlanStatus = filled === total ? "plan" : filled >= Math.ceil(total / 2) ? "partial" : "none";
  return { direction, items, filled, total, status, errors, warnings, ok: filled === total && errors.length === 0 };
}

/** 이번 주 금요일 · 이번 달 마지막 날 (한국 날짜) */
function deadlines() {
  const t = kst();
  const md = (d: Date) => `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")}`;
  const fri = new Date(t);
  fri.setUTCDate(t.getUTCDate() + ((5 - t.getUTCDay() + 7) % 7));
  const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
  return [
    { label: `이번 주 (${md(fri)})`, value: `${md(fri)}까지` },
    { label: "이번 달", value: `${md(end)}까지` },
  ];
}

export const STATUS_LABEL: Record<PlanStatus, string> = { plan: "완성", partial: "일부", none: "미완성" };
// 회고는 빼 둠 (타입은 예전에 저장한 노트 때문에 남김)
const KINDS: NoteKind[] = ["trade", "hold", "view"];

export default function PlanCheck({
  plan,
  onPlan,
  noteText,
  drawings,
  current,
  nowTime,
  money,
  ctx,
}: {
  plan: Plan;
  onPlan: (p: Plan) => void;
  noteText: string;
  drawings: Drawing[];
  current?: number;
  nowTime?: number;
  money: (n: number) => string;
  ctx: CheckContext;
}) {
  const c = checkPlan(plan, noteText, ctx);
  const [draft, setDraft] = useState("");
  const { rungs } = useMemo(() => buildLadder(drawings, nowTime), [drawings, nowTime]);
  const sell = c.direction === "매도";
  const near = (side: "below" | "above", skip = "") =>
    rungs
      .filter((r) => (!current ? true : side === "below" ? r.price < current : r.price >= current))
      .filter((r) => !skip.includes(money(r.price)))
      .sort((a, b) => Math.abs(a.price - (current ?? a.price)) - Math.abs(b.price - (current ?? b.price)))
      .slice(0, 2);
  const set = (patch: Partial<Plan>) => onPlan({ ...plan, ...patch });

  // 항목별 빠른 채우기: 칩 + 직접 입력
  const chips: Record<string, { label: string; patch: Partial<Plan> }[]> = {
    condition: near(sell ? "above" : "below").map((r) => ({ label: money(r.price), patch: { condition: `${money(r.price)} ${sell ? "도달 시 매도" : "지지 확인 후 매수"}` } })),
    stop: near(sell ? "above" : "below", plan.condition).map((r) => ({ label: money(r.price), patch: { stop: `${money(r.price)} ${sell ? "돌파 시 손절" : "이탈 시 손절"}` } })),
    target: near(sell ? "below" : "above").map((r) => ({ label: money(r.price), patch: { target: money(r.price) } })),
    weight: ["10%", "20%", "30%", "50%"].map((w) => ({ label: w, patch: { weight: w } })),
    decision: (["유지", "추가", "축소", "청산"] as const).map((d) => ({ label: d, patch: { decision: d } })),
    viewDir: (["상승", "하락", "횡보"] as const).map((d) => ({ label: d, patch: { viewDir: d } })),
    level: near("above").concat(near("below")).map((r) => ({ label: money(r.price), patch: { level: money(r.price) } })),
    until: deadlines().map((d) => ({ label: d.label, patch: { until: d.value } })),
  };
  const field: Record<string, keyof Plan> = { entry: "entry", condition: "condition", stop: "stop", target: "target", weight: "weight", reason: "reason", level: "level", until: "until", diff: "diff", cause: "cause", next: "next" };
  const placeholder: Record<string, string> = {
    entry: "왜 이 자리를 보나요?",
    condition: "72,000~72,200 지지 확인",
    stop: "69,500 종가 이탈",
    target: "78,000 도달 시 절반",
    weight: "1차 20% · 2차 20%",
    reason: "실적 발표 뒤 거래량 급증",
    level: "75,000",
    diff: "목표 전에 먼저 팔았어요",
    cause: "장중 급락에 겁먹음",
    next: "손절선 전엔 팔지 않기",
  };
  const [pick, setPick] = useState<string | null>(null);
  const missing = c.items.filter((it) => !it.ok);
  const cur = missing.find((it) => it.key === pick) ?? missing[0];
  const finish = (key: string) => {
    const v = draft.trim();
    if (v && field[key]) set({ [field[key]]: v } as Partial<Plan>);
    setDraft("");
  };

  return (
    <div className="ws-pc" aria-label="노트 완성도 점검">
      {/* 노트 종류: 한 줄 4칸 */}
      <div className="ws-pc-kinds" role="radiogroup" aria-label="노트 종류">
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={plan.kind === k} className={plan.kind === k ? "on" : ""} onClick={() => set({ kind: k })}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {/* 진행 막대 + (매매 · 보유면) 방향 */}
      <div className="ws-pc-head">
        <span className="ws-pc-count" title={STATUS_LABEL[c.status]}>
          필수 <b className={c.filled === c.total ? "done" : ""}>{c.filled}</b>/{c.total}
        </span>
        <i className="ws-pc-bar" aria-hidden>
          <i className={c.filled === c.total ? "done" : ""} style={{ width: `${c.total ? (c.filled / c.total) * 100 : 0}%` }} />
        </i>
        {(plan.kind === "trade" || plan.kind === "hold") && (
          <span className="ws-pc-dir" role="radiogroup" aria-label="방향">
            {(["매수", "매도"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={c.direction === d} className={c.direction === d ? `on ${d === "매수" ? "buy" : "sell"}` : ""} onClick={() => set({ direction: d })}>
                {d}
              </button>
            ))}
          </span>
        )}
      </div>
      {/* 채운 것은 한 줄 태그로 */}
      {c.items.some((it) => it.ok) && (
        <div className="ws-pc-done">
          {c.items
            .filter((it) => it.ok)
            .map((it) => (
              <span key={it.key} title={it.value}>
                ✓ {it.label} <b>{it.value}</b>
              </span>
            ))}
        </div>
      )}
      {/* 빠진 것: 이름 탭 + 고른 항목의 입력 칸(항상 보임) + 그은 선에서 고른 추천 */}
      {missing.length > 0 && cur && (
        <div className="ws-pc-step">
          <div className="ws-pc-miss" role="tablist" aria-label="빠진 항목">
            {missing.map((it) => (
              <button key={it.key} type="button" role="tab" aria-selected={cur.key === it.key} className={cur.key === it.key ? "on" : ""} onClick={() => (setPick(it.key), setDraft(""))}>
                {it.label}
              </button>
            ))}
          </div>
          {field[cur.key] && (
            <div className="ws-pc-field">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && finish(cur.key)} placeholder={placeholder[cur.key] ?? cur.label} aria-label={cur.label} />
              <button type="button" onClick={() => finish(cur.key)} disabled={!draft.trim()}>
                넣기
              </button>
            </div>
          )}
          {(chips[cur.key] ?? []).length > 0 && (
            <div className="ws-pc-ask">
              <small>{field[cur.key] ? "추천" : "고르기"}</small>
              {(chips[cur.key] ?? []).map((ch) => (
                <button key={ch.label} type="button" onClick={() => set(ch.patch)}>
                  {ch.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {c.errors.map((e) => (
        <p key={e} className="ws-pc-warn">
          {e}
        </p>
      ))}
      {c.warnings.length > 0 && (
        <details className="ws-pc-risks">
          <summary>주의 {c.warnings.length}개</summary>
          {c.warnings.map((w) => (
            <p key={w} className="ws-pc-risk">
              {w}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
