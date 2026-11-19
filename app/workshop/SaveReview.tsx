"use client";
// 차트 노트 '확인하고 저장' → 같은 화면 위에 큰 창으로 저장될 내용을 한 번에 확인 (다른 화면으로 넘어가지 않음)
//   저장될 차트 그림(그은 선에 지지 · 저항 라벨) · AI 분석(눌렀으면) · 종목 전략에 쌓일 내용
//   종목 전략은 눌러서 바로 고칠 수 있음 (확정할 때 같이 저장: 쌓인 메모는 새 메모로 남김, 이번 저장분은 고친 글로)
//   확정하면 DB 에 저장되고 그 버전은 고칠 수 없음 (고치면 새 버전) — 안내와 함께 취소 / 확정
import { useEffect, useState } from "react";
import type { ChartMemoResult } from "../../lib/api/ai";
import { dateLabel, memoText, type TradeRecord } from "../../lib/records";

const DIR: Record<string, string> = { LONG: "상승 관점", SHORT: "하락 관점", WAIT: "관망", UNKNOWN: "판단 보류" };

/**
 * 종목 전략 글의 칸 줄('- 지지: …' · '- 매수: …' …)을 바꾸기 (2026-11-19)
 *   칸은 늘 있음: 정하지 않았으면 '- 손절:' 처럼 빈 칸으로. 같은 칸 줄이 여러 개면 하나로
 *   없으면 순서(지지 · 저항 · 매수 · 매도 · 손절 · 목표)대로, 첫 칸은 현재가 줄 뒤에
 */
const PLAN_ORDER = ["지지", "저항", "매수", "매도", "손절", "목표"];
const LABEL_LINE = /^-\s*(지지|저항|매수|매도|손절|목표)\s*:/;
function withPlanLine(text: string, label: string, value: string) {
  const line = `- ${label}:${value.trim() ? ` ${value.trim()}` : ""}`;
  const lines = text.split("\n");
  const re = new RegExp(`^-\\s*${label}\\s*:`);
  const at = lines.findIndex((l) => re.test(l));
  const rest = lines.filter((l, i) => !re.test(l) || i === at);
  if (at >= 0) {
    rest[rest.findIndex((l) => re.test(l))] = line;
    return rest.join("\n");
  }
  const order = PLAN_ORDER.indexOf(label);
  let pos = -1;
  rest.forEach((l, i) => {
    const m = l.match(LABEL_LINE);
    if (m && PLAN_ORDER.indexOf(m[1]) < order) pos = i;
  });
  if (pos >= 0) {
    rest.splice(pos + 1, 0, line);
    return rest.join("\n");
  }
  const next = rest.findIndex((l) => LABEL_LINE.test(l) || /^-\s*메모\s*:/.test(l));
  if (next >= 0) {
    rest.splice(next, 0, line);
    return rest.join("\n");
  }
  const cur = rest.findIndex((l) => /^\[현재가\]/.test(l));
  if (cur >= 0) {
    rest.splice(cur + 1, 0, "", line);
    return rest.join("\n");
  }
  return [line, "", ...rest].join("\n");
}

export default function SaveReview({
  symbolName,
  image,
  shooting,
  pending,
  ai,
  records,
  consolidating = false,
  unchanged = false,
  planRows = [],
  levels = [],
  current,
  dropped = [],
  linked,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  symbolName: string;
  /** 지지 · 저항 라벨을 얹은 차트 그림 (못 찍었으면 null) */
  image: string | null;
  /** 차트 그림을 찍는 중 */
  shooting: boolean;
  /** 이번에 저장될 메모 (종목 전략에 합쳐서 보여 줌) */
  pending: { date: string; time: string; text: string };
  ai: ChartMemoResult | null;
  /** 이 종목 전략에 지금까지 쌓인 메모 */
  records: TradeRecord[];
  /** 이번 저장이 AI 가 쌓인 전략과 합친 정리본 → 예전 메모는 따로 안 보이고 정리본 하나로 */
  consolidating?: boolean;
  /** 지금까지 종목 전략과 문장 · 선이 그대로 (현재가 · AI 분석만 다름) → 확정 막음. 창에서 고치면 풀림 */
  unchanged?: boolean;
  /** 매매 계획 4칸 (매수 · 매도 · 손절 · 목표). 빈 칸을 그은 선으로 채운 건 '(자동 …)' 표시 */
  planRows?: { label: string; text: string }[];
  /** 그은 선의 지지 · 저항 가격 (종목 전략의 '- 지지:' · '- 저항:' 줄) */
  levels?: { label: string; text: string }[];
  /** 저장할 때의 현재가 (글로) */
  current?: string;
  /** 이번 Memo 로 바뀌어 정리본에서 뺀 예전 전략 문장 */
  dropped?: string[];
  /** 체결과 연결됐는지 (아니면 검증 대기로 저장) */
  linked: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  /** 확정: 고친 이번 저장 글 · 고친 쌓인 메모(id → 글) */
  onConfirm: (edits: { pendingText: string; records: Record<string, string>; plan: { label: string; text: string }[] }) => void;
}) {
  // 종목 전략 고치기: 확정 전까지는 여기에만 (취소하면 버림)
  // 종목 전략 글: 지지 · 저항(그은 선) + 매매 계획 4칸을 칸 줄로 (빈 칸도 줄은 남김)
  const withRows = (t: string) => [...levels, ...planRows].reduce((acc, r) => withPlanLine(acc, r.label, r.text), t);
  const [pendingText, setPendingText] = useState(() => withRows(pending.text));
  const [recEdits, setRecEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const PENDING = "__pending__";
  // 매매 계획 4칸 (자동으로 채운 칸도 눌러서 고침). 고치면 아래 종목 전략의 '- 매수: …' 줄도 같이 바뀜
  const [plan, setPlan] = useState(planRows);
  const [planEditing, setPlanEditing] = useState<string | null>(null);
  // 창에서 종목 전략 · 계획을 고쳤는지 (고쳤으면 '바뀐 게 없음' 이어도 저장 가능)
  const [initialPending] = useState(() => withRows(pending.text));
  const textOf = (id: string, original: string) => (id === PENDING ? pendingText : (recEdits[id] ?? original));
  const setText = (id: string, original: string, t: string) =>
    id === PENDING
      ? setPendingText(t)
      : setRecEdits((m) => {
          const next = { ...m, [id]: t };
          if (t.trim() === original.trim()) delete next[id];
          return next;
        });
  const editable = (id: string, original: string) =>
    editing === id ? (
      <textarea
        autoFocus
        value={textOf(id, original)}
        onChange={(e) => setText(id, original, e.target.value)}
        onBlur={() => setEditing(null)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setEditing(null);
          }
        }}
        rows={Math.min(10, Math.max(2, textOf(id, original).split(/\n/).length + 1))}
        aria-label="종목 전략 고치기"
      />
    ) : (
      <p role="button" tabIndex={0} className="ws-review-editable" title="눌러서 고치기" onClick={() => !busy && setEditing(id)} onKeyDown={(e) => e.key === "Enter" && !busy && setEditing(id)}>
        {textOf(id, original) || <span className="ws-review-empty">비어 있어요. 눌러서 적기</span>}
      </p>
    );
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && !e.defaultPrevented && onCancel();
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [busy, onCancel]);


  return (
    <div className="ws-review-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="ws-review" role="dialog" aria-modal="true" aria-label="저장할 내용 확인">
        <header className="ws-review-head">
          <div>
            <h2>저장할 내용 확인</h2>
            <p>{symbolName} · 확정하면 아래 내용이 그대로 저장돼요</p>
          </div>
          <button type="button" className="ws-review-x" onClick={onCancel} disabled={busy} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="ws-review-body">
          <section className="ws-review-chart">
            <h3>차트</h3>
            {shooting ? (
              <p className="ws-review-empty">차트를 그리는 중…</p>
            ) : image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={`${symbolName} 차트 (그은 선에 지지 · 저항 표시)`} />
            ) : (
              <p className="ws-review-empty">차트 그림을 만들지 못했어요. 그은 선은 그대로 저장돼요.</p>
            )}
          </section>

          {ai && (
            <section>
              <h3>AI 분석</h3>
              {/* 차트 노트 옆 'AI 분석 보기' 를 없애고 여기서 전부 (방향 · 요약 · 구조 · 근거 · 시나리오 · 위험 · 무효화 · 질문) */}
              <div className="ws-review-ai">
                {ai.direction && (
                  <p>
                    <b>방향</b> {DIR[ai.direction] ?? ai.direction}
                    {ai.confidence && ` · 확신 ${({ HIGH: "높음", MEDIUM: "보통", LOW: "낮음" } as const)[ai.confidence]}`}
                  </p>
                )}
                {ai.summary && <p><b>요약</b> {ai.summary}</p>}
                {ai.marketStructure && <p><b>차트 구조</b> {ai.marketStructure}</p>}
                {ai.confluence?.length ? <p><b>겹치는 근거</b> {ai.confluence.join(" · ")}</p> : null}
                {ai.bullishScenario && <p><b>상승 시나리오</b> {ai.bullishScenario}</p>}
                {ai.bearishScenario && <p><b>하락 시나리오</b> {ai.bearishScenario}</p>}
                {ai.risks?.length ? <p><b>위험</b> {ai.risks.join(" · ")}</p> : null}
                {ai.invalidation && (Array.isArray(ai.invalidation) ? ai.invalidation.length > 0 : true) && <p><b>무효화 조건</b> {Array.isArray(ai.invalidation) ? ai.invalidation.join(" · ") : ai.invalidation}</p>}
                {ai.questions?.[0] && <p><b>AI 질문</b> {ai.questions[0]}</p>}
              </div>
            </section>
          )}

          {/* 매매 계획: 정한 칸 + 빈 칸은 정한 가격 기준으로 그은 선에서 자동 (아무것도 안 정했으면 매매 계획 없음) */}
          {planRows.some((r) => r.text) ? (
            <section>
              <h3>
                매매 계획 <span>눌러서 고치기 · {current ? `현재가 ${current} · ` : ""}{linked ? "체결과 연결돼 매매 계획으로 저장" : "체결과 연결되면 매매 계획으로 쳐요"}</span>
              </h3>
              <ul className="ws-review-plan">
                {plan.map((r, i) => (
                  <li key={r.label}>
                    <b>{r.label}</b>
                    {planEditing === r.label ? (
                      <input
                        autoFocus
                        value={r.text}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPlan((cur) => cur.map((x, j) => (j === i ? { ...x, text: v } : x)));
                          setPendingText((t) => withPlanLine(t, r.label, v));
                        }}
                        onBlur={() => setPlanEditing(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            e.stopPropagation();
                            setPlanEditing(null);
                          }
                        }}
                        placeholder={`${r.label} 조건 (비우면 빼요)`}
                        aria-label={`매매 계획 ${r.label} 고치기`}
                      />
                    ) : (
                      <span role="button" tabIndex={0} className="ws-review-editable" title="눌러서 고치기 (종목 전략에도 반영)" onClick={() => !busy && setPlanEditing(r.label)} onKeyDown={(e) => e.key === "Enter" && !busy && setPlanEditing(r.label)}>
                        {r.text || <em>정하지 않음 · 눌러서 적기</em>}
                      </span>
                    )}
                    {/* 이 칸을 아예 안 씀 (손절 · 목표 기준을 안 쓸 수도 있음): 비우고 종목 전략에서도 뺌, 자동으로 다시 안 채움 */}
                    {r.text && planEditing !== r.label ? (
                      <button
                        type="button"
                        className="ws-review-plan-x"
                        onClick={() => {
                          setPlan((cur) => cur.map((x, j) => (j === i ? { ...x, text: "" } : x)));
                          setPendingText((t) => withPlanLine(t, r.label, ""));
                        }}
                        disabled={busy}
                        aria-label={`${r.label} 지우기`}
                        title={`${r.label} 안 쓰기 (종목 전략에서도 빠져요)`}
                      >
                        ✕
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 종목 전략: 지금까지 쌓인 메모 + 이번 저장분(AI 가 쌓인 전략과 합친 정리본)을 합친 모습 */}
          <section>
            <h3>
              종목 전략 <span>이번 저장 · 눌러서 고치기</span>
            </h3>
            {/* AI 가 쌓인 전략과 합치며 뺀 예전 항목 (이번 Memo 로 관점이 바뀐 것) */}
            {dropped.length ? (
              <p className="ws-review-dropped">
                <b>이번에 바뀌어 뺀 예전 전략</b> {dropped.join(" · ")}
              </p>
            ) : null}
            {consolidating && (
              <p className="ws-review-merged">예전 종목 전략 {records.length}개를 이 정리본 하나로 합쳐요. 예전 것은 기록에 그대로 남아요.</p>
            )}
            <div className="ws-review-records">
              <div className="new">
                <time>
                  {dateLabel(pending.date)} {pending.time.slice(0, 5)}
                  <em>이번 저장</em>
                </time>
                {editable(PENDING, pending.text)}
              </div>
            </div>
          </section>
        </div>

        <footer className="ws-review-foot">
          <p>
            <b>확정하면 DB에 저장되고, 이 버전은 수정 · 삭제할 수 없어요.</b> 고칠 땐 새 버전으로 남고 예전 버전도 그대로 기록돼요.
            {!linked && " 연결된 체결이 없어 검증 대기로 저장돼요."}
          </p>
          {unchanged && pendingText === initialPending && !Object.keys(recEdits).length && (
            <p className="ws-review-error">종목 전략이 바뀌지 않았어요 (현재가 · AI 분석만 달라짐). 매수 · 손절 · 목표나 선을 바꿨을 때 저장돼요.</p>
          )}
                    {error && <p className="ws-review-error">{error}</p>}
          <div>
            <button type="button" onClick={onCancel} disabled={busy}>
              취소
            </button>
            <button type="button" className="primary" onClick={() => onConfirm({ pendingText: pendingText.trim(), records: recEdits, plan })} disabled={busy || (unchanged && pendingText === initialPending && !Object.keys(recEdits).length)}>
              {busy ? "저장 중…" : "확정"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
