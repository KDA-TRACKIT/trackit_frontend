"use client";
// 전략 확정 전 확인: AI 가 빈칸을 임의로 채우지 않고 되묻고, 투자자가 진입 근거 · 매수 조건 · 손절 기준을 직접 고쳐 확정한다
//   - 그은 선을 현재가 기준 위(저항 후보) · 아래(지지 후보) 가격순 사다리로, 가까운 3개씩 먼저 (나머지는 접어 둠)
//     칩 하나로 의미를 고름 (위: 저항 · 목표 · 관심 · 무시 / 아래: 지지 · 매수 · 손절 · 관심 · 무시)
//     첫 칩은 점선 '제안'일 뿐, 고르는 건 투자자. 다시 누르면 취소되고 계획 칸의 문장도 빠짐
//   - 피보나치는 레벨을, 사각형 · 가격 범위는 구간을 한 줄로
//   - 손절 기준이 비어 있으면 "손절 기준이 있나요?" 라고 물음
//   - AI 요약은 '제안'으로만 보여 주고, 넣을지는 투자자가 고름
import { useMemo, useState } from "react";
import type { Drawing } from "../../lib/drawing";
import { buildLadder, nearest, type Rung } from "./lineLadder";

/** 노트 종류 (2026-11-17 회의): 매매 계획 · 보유 관리 · 분석·전망 · 회고 — 종류마다 필수 항목이 다름 (PlanCheck) */
export type NoteKind = "trade" | "hold" | "view" | "review";
/**
 * entry 진입 근거 · condition 진입 조건·가격 범위 · stop 손절 · target 목표·청산 · weight 비중 (매매 계획)
 * decision 현재 판단 · reason 변경 사유 (보유 관리, 손절 · 목표 갱신값은 stop · target)
 * viewDir 방향 · level 기준값 · until 기한 (분석·전망) / diff 계획 대비 차이 · cause 원인 · next 다음에 바꿀 점 (회고)
 */
export type Plan = {
  kind: NoteKind;
  entry: string;
  condition: string;
  stop: string;
  target: string;
  direction: "" | "매수" | "매도";
  until: string;
  weight: string;
  decision: "" | "유지" | "추가" | "축소" | "청산";
  reason: string;
  viewDir: "" | "상승" | "하락" | "횡보";
  level: string;
  diff: string;
  cause: string;
  next: string;
};
export const EMPTY_PLAN: Plan = {
  kind: "trade",
  entry: "",
  condition: "",
  stop: "",
  target: "",
  direction: "",
  until: "",
  weight: "",
  decision: "",
  reason: "",
  viewDir: "",
  level: "",
  diff: "",
  cause: "",
  next: "",
};
export const KIND_LABEL: Record<NoteKind, string> = { trade: "매매 계획", hold: "보유 관리", view: "분석·전망", review: "회고" };

/** 확정할 때 메모 뒤에 붙는 구조화된 계획 (투자자가 확인한 것만) */
export function planText(p: Plan) {
  const rows = [
    ["노트 종류", KIND_LABEL[p.kind]],
    ["방향", p.kind === "view" ? p.viewDir : p.direction],
    ["진입 근거", p.entry],
    ["매수 조건", p.condition],
    ["현재 판단", p.decision],
    ["변경 사유", p.reason],
    ["손절 기준", p.stop],
    ["목표", p.target],
    ["비중", p.weight],
    ["기준값", p.level],
    ["기한", p.until],
    ["계획 대비 차이", p.diff],
    ["원인", p.cause],
    ["다음에 바꿀 점", p.next],
  ].filter(([, v]) => v.trim());
  // 종류만 있고 내용이 없으면 비움
  return rows.length > 1 ? rows.map(([k, v]) => `[${k}] ${v.trim()}`).join("\n") : "";
}

/** 위(저항 후보) · 아래(지지 후보) · 구간에 따라 고를 수 있는 의미. 첫 칸은 점선으로 '제안'만 */
const ABOVE = ["저항", "목표", "관심", "무시"];
const BELOW = ["지지", "매수", "손절", "관심", "무시"];
const ZONE_ABOVE = ["저항 구간", "목표 구간", "관심", "무시"];
const ZONE_BELOW = ["매수 구간", "손절 구간", "관심", "무시"];

/** 의미 → 계획의 어느 칸에 어떤 문장으로 */
function phrase(m: string, p: string): [keyof Plan, string] | null {
  switch (m) {
    case "저항":
      return ["entry", `${p} 저항`];
    case "지지":
      return ["condition", `${p} 지지 확인`];
    case "매수":
    case "매수 예정가":
      return ["condition", `${p} 근처에서 매수`];
    case "손절":
    case "손절선":
      return ["stop", `${p} 이탈 시 손절`];
    case "목표":
    case "목표가":
    case "목표 구간":
      return ["target", p];
    case "관심":
    case "관심 가격대":
      return ["entry", `${p} 가격대를 지켜봄`];
    case "매수 구간":
      return ["condition", `${p} 구간에서 매수`];
    case "손절 구간":
      return ["stop", `${p} 구간 이탈 시 손절`];
    case "저항 구간":
      return ["entry", `${p} 구간 저항`];
    default:
      return null;
  }
}
const addTo = (cur: string, line: string) => (cur.split(" / ").includes(line) ? cur : cur ? `${cur} / ${line}` : line);
const removeFrom = (cur: string, line: string) =>
  cur
    .split(" / ")
    .filter((x) => x !== line)
    .join(" / ");

export default function PlanConfirm({
  drawings,
  plan,
  onPlan,
  answers,
  onAnswer,
  aiSummary,
  aiQuestions,
  money,
  locked,
  current,
  nowTime,
  onHover,
}: {
  drawings: Drawing[];
  plan: Plan;
  onPlan: (p: Plan) => void;
  /** 선(또는 피보 레벨 "id:0.618") → 투자자가 고른 의미 */
  answers: Record<string, string>;
  onAnswer: (id: string, meaning: string) => void;
  aiSummary?: string;
  aiQuestions?: string[];
  money: (n: number) => string;
  locked: boolean;
  /** 현재가 (위 · 아래를 가르는 기준) */
  current?: number;
  /** 마지막 봉 시각 (추세선의 오늘 값) */
  nowTime?: number;
  /** 줄에 마우스를 올리면 차트에서 그 선을 강조 */
  onHover?: (id: string | null) => void;
}) {
  const [all, setAll] = useState(false);
  const [openFib, setOpenFib] = useState<Record<string, boolean>>({});
  const { rungs, groups } = useMemo(() => buildLadder(drawings, nowTime), [drawings, nowTime]);
  const view = all
    ? { above: rungs.filter((r) => !current || r.price >= current), below: rungs.filter((r) => !!current && r.price < current), hidden: 0 }
    : nearest(rungs, current, 3);
  const isAbove = (price: number) => !current || price >= current;

  /** 고르기 · 같은 걸 다시 누르면 취소 (계획 칸의 그 문장도 같이 빠짐) */
  const choose = (key: string, m: string, p: string) => {
    const prev = answers[key];
    let next = plan;
    if (prev) {
      const old = phrase(prev, p);
      if (old) next = { ...next, [old[0]]: removeFrom(next[old[0]], old[1]) };
    }
    if (prev === m) {
      onAnswer(key, "");
      onPlan(next);
      return;
    }
    const add = phrase(m, p);
    if (add) next = { ...next, [add[0]]: addTo(next[add[0]], add[1]) };
    onAnswer(key, m);
    onPlan(next);
  };

  const chips = (key: string, options: string[], p: string) => {
    const picked = answers[key];
    if (picked)
      return (
        <div className="ws-ladder-chips">
          <button type="button" className="on" onClick={() => choose(key, picked, p)} title="다시 누르면 취소">
            {picked} <span aria-hidden>×</span>
          </button>
        </div>
      );
    return (
      <div className="ws-ladder-chips">
        {options.map((m, i) => (
          <button key={m} type="button" className={i === 0 ? "sug" : ""} onClick={() => choose(key, m, p)}>
            {i === 0 ? `${m}?` : m}
          </button>
        ))}
      </div>
    );
  };

  const rung = (r: Rung) => (
    <li key={r.key} onMouseEnter={() => onHover?.(r.ids[0])} onMouseLeave={() => onHover?.(null)}>
      <b>{money(r.price)}</b>
      <div>
        <span className="ws-ladder-kind">{r.label}</span>
        {chips(r.key, isAbove(r.price) ? ABOVE : BELOW, money(r.price))}
      </div>
    </li>
  );

  // 고른 것 한눈에 (무시 빼고)
  const picked: string[] = [];
  for (const r of rungs) if (answers[r.key] && answers[r.key] !== "무시") picked.push(`[${answers[r.key]}] ${money(r.price)}`);
  for (const g of groups) {
    if (g.kind === "zone" && answers[g.key] && answers[g.key] !== "무시") picked.push(`[${answers[g.key]}] ${money(g.low)}~${money(g.high)}`);
    if (g.kind === "fib") for (const l of g.levels) if (answers[l.key] && answers[l.key] !== "무시") picked.push(`[${answers[l.key]}] ${money(l.price)} (피보 ${l.lv})`);
  }

  const lineCount = rungs.reduce((n, r) => n + r.ids.length, 0) + groups.length;
  // 확정 뒤엔 사다리 대신 아무것도 (계획은 메모 뒤 [항목] 줄로 남음)
  if (locked || lineCount === 0) return null;
  return (
    <div className="ws-plan">
      {/* 그은 선: 접어 두고, 펼치면 현재가 기준 위 · 아래 사다리에서 지지/저항을 고름 (AI 는 정하지 않음) */}
      {
        <details className="ws-ladder">
          <summary className="ws-ladder-head">
            <strong>그은 선 {lineCount}개</strong>
            <small>{picked.length ? `고른 것 ${picked.length}개` : "지지 · 저항 고르기"}</small>
          </summary>
          {view.above.length > 0 && (
            <>
              <p className="ws-ladder-sec">위 · 저항 후보</p>
              <ul>{view.above.map(rung)}</ul>
            </>
          )}
          {current ? <div className="ws-ladder-now">현재가 {money(current)}</div> : null}
          {view.below.length > 0 && (
            <>
              <p className="ws-ladder-sec">아래 · 지지 후보</p>
              <ul>{view.below.map(rung)}</ul>
            </>
          )}
          {(view.hidden > 0 || all) && (
            <button type="button" className="ws-ladder-more" onClick={() => setAll((v) => !v)}>
              {all ? "가까운 선만 보기" : `+ 멀리 있는 선 ${view.hidden}개 더 보기`}
            </button>
          )}

          {groups.length > 0 && (
            <ul className="ws-ladder-groups">
              {groups.map((g) =>
                g.kind === "zone" ? (
                  <li key={g.key} onMouseEnter={() => onHover?.(g.id)} onMouseLeave={() => onHover?.(null)}>
                    <span className="ws-ladder-kind">
                      {g.label} · <b>{money(g.low)}~{money(g.high)}</b>
                    </span>
                    {chips(g.key, isAbove(g.low) ? ZONE_ABOVE : ZONE_BELOW, `${money(g.low)}~${money(g.high)}`)}
                  </li>
                ) : (
                  <li key={g.key} onMouseEnter={() => onHover?.(g.id)} onMouseLeave={() => onHover?.(null)}>
                    <span className="ws-ladder-kind">
                      {g.label} · <b>{g.levels.length}개 레벨</b>
                    </span>
                    <div className="ws-ladder-chips">
                      {(openFib[g.key]
                        ? g.levels
                        : [...g.levels]
                            .sort((a, b) => Math.abs(a.price - (current ?? a.price)) - Math.abs(b.price - (current ?? b.price)))
                            .slice(0, 3)
                            .sort((a, b) => a.lv - b.lv)
                      ).map((l) => {
                        const m = answers[l.key] ?? (isAbove(l.price) ? "저항" : "지지");
                        return (
                          <button
                            key={l.key}
                            type="button"
                            className={answers[l.key] ? "on" : ""}
                            onClick={() => choose(l.key, m, `${money(l.price)} (피보 ${l.lv})`)}
                            title={answers[l.key] ? "다시 누르면 취소" : `${m}으로 고르기`}
                          >
                            {l.lv} · {money(l.price)}
                            {answers[l.key] ? ` ${answers[l.key]} ×` : ""}
                          </button>
                        );
                      })}
                      {g.levels.length > 3 && (
                        <button type="button" className="ghost" onClick={() => setOpenFib((o) => ({ ...o, [g.key]: !o[g.key] }))}>
                          {openFib[g.key] ? "접기" : "펼치기"}
                        </button>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}

          {picked.length > 0 && (
            <div className="ws-ladder-picked" aria-label="고른 선">
              {picked.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
        </details>
      }

    </div>
  );
}
