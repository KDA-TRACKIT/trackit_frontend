"use client";
// 전략 확정 전 확인: AI 가 빈칸을 임의로 채우지 않고 되묻고, 투자자가 진입 근거 · 매수 조건 · 손절 기준을 직접 고쳐 확정한다
//   - 그은 선은 알고리즘이 지지 · 저항으로 나눔 (선 종류 상관없이 현재가보다 아래 = 지지, 위 = 저항, lineLadder.classify)
//     접지 않고 바로 보임, 선 하나에 한 줄 (피보는 레벨마다 한 줄, 구간은 한 줄)
//     투자자는 그중 '이 선에서 매매하겠다'를 더 고름 (지지: 매수 · 손절 / 저항: 목표 · 매도). 다시 누르면 취소되고 계획 칸의 문장도 빠짐
//     현재가와 겹쳐 나눌 수 없는 선은 투자자가 지지 · 저항을 고름. 안 고르면 이행률 계산에서 빠짐
//   - 피보나치는 레벨을, 사각형 · 가격 범위는 구간을 한 줄로
//   - 손절 기준이 비어 있으면 "손절 기준이 있나요?" 라고 물음
//   - AI 요약은 '제안'으로만 보여 주고, 넣을지는 투자자가 고름
import { useMemo } from "react";
import type { Drawing } from "../../lib/drawing";
import { buildLadder, classify, roleKey, roleOf, type LastBar, type Role } from "./lineLadder";
import { NEAREST_LINES } from "../../lib/strategy";

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

/** 지지 · 저항에 따라 고를 수 있는 매매 (투자자가 더 고르는 것) */
const TRADE: Record<Role, string[]> = { 지지: ["매수", "손절"], 저항: ["목표", "매도"] };
const ZONE_TRADE: Record<Role, string[]> = { 지지: ["매수 구간", "손절 구간"], 저항: ["목표 구간"] };

/** 의미 → 계획의 어느 칸에 어떤 문장으로 */
function phrase(m: string, p: string): [keyof Plan, string] | null {
  switch (m) {
    case "저항":
      return ["entry", `${p} 저항`];
    case "지지":
      return ["condition", `${p} 지지 확인`];
    case "매도":
      return ["condition", `${p} 도달 시 매도`];
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
  lastBar,
  bars,
  onHover,
  onDelete,
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
  /** 마지막 봉 (추세선은 이 봉 몸통 기준으로 지지 · 저항) */
  lastBar?: LastBar;
  /** 차트 봉 (추세선 값을 차트와 같은 봉 순서로) */
  bars?: { time: number }[];
  /** 줄에 마우스를 올리면 차트에서 그 선을 강조 */
  onHover?: (id: string | null) => void;
  /** 그은 선 지우기 (차트에서도 지워짐, 차트의 되돌리기로 살릴 수 있음) */
  onDelete?: (drawingIds: string[]) => void;
}) {
  const { rungs, groups, skipped } = useMemo(() => buildLadder(drawings, nowTime, bars), [drawings, nowTime, bars]);
  // 도구가 미리 정한 매매(롱 · 숏 포지션의 진입 · 목표 · 손절): 투자자가 고르거나 취소하기 전까지는 그 값
  const presets = new Map(rungs.flatMap((r) => (r.preset ? [[r.key, r.preset] as const] : [])));
  const tradeOf = (key: string) => (key in answers ? answers[key] : presets.get(key)) || "";

  /** 고르기 · 같은 걸 다시 누르면 취소 (계획 칸의 그 문장도 같이 빠짐) */
  const choose = (key: string, m: string, p: string) => {
    const prev = tradeOf(key);
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

  /** 나눌 수 없는 선: 투자자가 지지 · 저항을 고름 (바꾸면 그 선에서 고른 매매는 취소) */
  const setRole = (key: string, r: Role | "", p: string) => {
    if (tradeOf(key)) choose(key, tradeOf(key), p);
    onAnswer(roleKey(key), r);
  };

  /** 역할 표시 + 매매 고르기 */
  const lineChips = (key: string, low: number, high: number, p: string, zone = false, slant = false) => {
    const { role, auto } = roleOf(key, low, high, current, answers, slant ? lastBar : undefined);
    const picked = tradeOf(key);
    return (
      <div className="ws-ladder-chips">
        {auto ? (
          <span className={`ws-ladder-role ${role === "지지" ? "sup" : "res"}`} title="알고리즘이 현재가 기준으로 나눔">
            {role}
          </span>
        ) : (
          <>
            {(["지지", "저항"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                className={role === r ? "on" : "sug"}
                onClick={() => setRole(key, role === r ? "" : r, p)}
                title={role === r ? "다시 누르면 취소" : "현재가와 겹쳐 나눌 수 없어요. 직접 골라 주세요 (안 고르면 이행률에서 빠져요)"}
              >
                {role === r ? `${r} ×` : `${r}?`}
              </button>
            ))}
          </>
        )}
        {role &&
          (picked ? (
            <button type="button" className="on" onClick={() => choose(key, picked, p)} title="다시 누르면 취소">
              {picked} <span aria-hidden>×</span>
            </button>
          ) : (
            (zone ? ZONE_TRADE : TRADE)[role].map((m) => (
              <button key={m} type="button" onClick={() => choose(key, m, p)} title="이 선에서 매매하겠다고 고르기">
                {m}
              </button>
            ))
          ))}
      </div>
    );
  };

  /** 한 줄 = 선 하나: 가격 · 선 종류 · 지지/저항 · 매매 (피보는 레벨마다, 구간은 한 줄) */
  type Row = { key: string; hover: string; ids: string[]; label: string; low: number; high: number; text: string; zone: boolean; slant?: boolean };
  // 1,000 이상은 원 단위로 (피보 · 추세선 오늘 값은 소수가 나옴)
  const fmt = (n: number) => money(n >= 1000 ? Math.round(n) : Math.round(n * 100) / 100);
  const rows: Row[] = [
    ...rungs.map((r) => ({ key: r.key, hover: r.ids[0], ids: r.ids, label: r.label.replace(" · 오늘 값", ""), low: r.price, high: r.price, text: fmt(r.price), zone: false, slant: !!r.pts })),
    ...groups.flatMap((g): Row[] =>
      g.kind === "zone"
        ? [{ key: g.key, hover: g.id, ids: [g.id], label: g.label, low: g.low, high: g.high, text: `${fmt(g.low)}~${fmt(g.high)}`, zone: true }]
        : g.levels.map((l) => ({ key: l.key, hover: g.id, ids: [g.id], label: `피보 ${l.lv}`, low: l.price, high: l.price, text: fmt(l.price), zone: false })),
    ),
  ].sort((a, b) => b.high + b.low - (a.high + a.low));
  const mid = (r: Row) => (r.low + r.high) / 2;
  const roleRow = (r: Row) => roleOf(r.key, r.low, r.high, current, answers, r.slant ? lastBar : undefined).role;
  // 위 · 아래는 역할대로 (저항 위 · 지지 아래, 못 나눈 건 가격으로)
  const isUp = (r: Row) => {
    const role = classify(r.low, r.high, current, r.slant ? lastBar : undefined);
    return role ? role === "저항" : !current || mid(r) >= current;
  };
  const above = rows.filter(isUp);
  const below = rows.filter((r) => !isUp(r));
  // 이행률에는 현재가에 가까운 지지선 5개 · 저항선 5개만 들어감 (2026-11-19 회의) → 나머지는 흐리게
  const nearestOf = (role: Role) =>
    rows
      .filter((r) => roleRow(r) === role)
      .sort((a, b) => Math.abs(mid(a) - (current ?? 0)) - Math.abs(mid(b) - (current ?? 0)))
      .slice(0, NEAREST_LINES)
      .map((r) => r.key);
  const counted = new Set([...nearestOf("지지"), ...nearestOf("저항")]);
  const row = (r: Row) => (
    <li
      key={r.key}
      className={roleRow(r) && !counted.has(r.key) ? "far" : undefined}
      title={roleRow(r) && !counted.has(r.key) ? `이행률에는 현재가에 가까운 ${roleRow(r)}선 ${NEAREST_LINES}개만 들어가요` : undefined}
      onMouseEnter={() => onHover?.(r.hover)}
      onMouseLeave={() => onHover?.(null)}
    >
      <b>{r.text}</b>
      <span className="ws-ladder-kind">{r.label}</span>
      {lineChips(r.key, r.low, r.high, r.text, r.zone, r.slant)}
      {onDelete && (
        <button
          type="button"
          className="ws-ladder-del"
          onClick={() => {
            onHover?.(null);
            onDelete(r.ids);
          }}
          aria-label={`${r.text} 선 지우기`}
          title={r.label.startsWith("피보") ? "피보나치 전체 지우기" : r.ids.length > 1 ? `겹친 선 ${r.ids.length}개 지우기` : "선 지우기"}
        >
          ✕
        </button>
      )}
    </li>
  );

  const tradeCount = rows.filter((r) => tradeOf(r.key)).length;
  const unset = rows.filter((r) => !roleRow(r)).length;

  // 확정 뒤엔 사다리 대신 아무것도 (계획은 메모 뒤 [항목] 줄로 남음)
  if (locked || rows.length === 0) return null;
  return (
    <div className="ws-plan">
      {/* 그은 선: 접지 않고 바로, 선 하나에 한 줄 (현재가 기준 위 = 저항 · 아래 = 지지) */}
      <div className="ws-ladder">
        <div className="ws-ladder-head">
          <strong>그은 선 {rows.length}개</strong>
          <small>
            {tradeCount ? `매매 ${tradeCount}개` : "지지 · 저항 자동 분류"}
            {unset ? ` · 미분류 ${unset}개` : ""}
            {skipped.length ? <span title={`지지 · 저항이 아닌 드로잉이라 빠짐: ${[...new Set(skipped.map((x) => x.label))].join(", ")}`}> · 제외 {skipped.length}개</span> : null}
          </small>
        </div>
        {above.length > 0 && <ul>{above.map(row)}</ul>}
        {current ? <div className="ws-ladder-now">현재가 {money(current)}</div> : null}
        {below.length > 0 && <ul>{below.map(row)}</ul>}
      </div>
    </div>
  );
}
