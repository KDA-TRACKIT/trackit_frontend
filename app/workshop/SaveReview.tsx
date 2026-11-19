"use client";
// 차트 노트 '확인하고 저장' → 같은 화면 위에 큰 창으로 저장될 내용을 한 번에 확인 (다른 화면으로 넘어가지 않음)
//   저장될 차트 그림(그은 선에 지지 · 저항 라벨) · AI 분석(눌렀으면) · 종목 전략에 쌓일 내용
//   종목 전략은 눌러서 바로 고칠 수 있음 (확정할 때 같이 저장: 쌓인 메모는 새 메모로 남김, 이번 저장분은 고친 글로)
//   확정하면 DB 에 저장되고 그 버전은 고칠 수 없음 (고치면 새 버전) — 안내와 함께 취소 / 확정
import { useEffect, useState } from "react";
import type { ChartMemoResult } from "../../lib/api/ai";
import { dateLabel, memoText, type TradeRecord } from "../../lib/records";

const DIR: Record<string, string> = { LONG: "상승 관점", SHORT: "하락 관점", WAIT: "관망", UNKNOWN: "판단 보류" };

export default function SaveReview({
  symbolName,
  image,
  shooting,
  pending,
  ai,
  records,
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
  /** 체결과 연결됐는지 (아니면 검증 대기로 저장) */
  linked: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  /** 확정: 고친 이번 저장 글 · 고친 쌓인 메모(id → 글) */
  onConfirm: (edits: { pendingText: string; records: Record<string, string> }) => void;
}) {
  // 종목 전략 고치기: 확정 전까지는 여기에만 (취소하면 버림)
  const [pendingText, setPendingText] = useState(pending.text);
  const [recEdits, setRecEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const PENDING = "__pending__";
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
              <div className="ws-review-ai">
                {ai.direction && <p><b>방향</b> {DIR[ai.direction] ?? ai.direction}</p>}
                {ai.summary && <p><b>요약</b> {ai.summary}</p>}
                {ai.marketStructure && <p><b>차트 구조</b> {ai.marketStructure}</p>}
                {ai.risks?.length ? <p><b>위험</b> {ai.risks.join(" · ")}</p> : null}
                {ai.invalidation && <p><b>무효화 조건</b> {Array.isArray(ai.invalidation) ? ai.invalidation.join(" · ") : ai.invalidation}</p>}
              </div>
            </section>
          )}

          {/* 종목 전략: 지금까지 쌓인 메모 + 이번 저장분을 합친 모습 (저장 뒤 아래 종목 전략에 이렇게 쌓임) */}
          <section>
            <h3>
              종목 전략 <span>{records.length + (pendingText.trim() ? 1 : 0)}개 · 저장 후 · 눌러서 고치기</span>
            </h3>
            <div className="ws-review-records">
              {records.map((r) => (
                <div key={r.id} className={recEdits[r.id] !== undefined ? "edited" : undefined}>
                  <time>
                    {dateLabel(r.date)} {r.noteTime.slice(0, 5)}
                    {recEdits[r.id] !== undefined && <em>고침 · 새 메모로</em>}
                  </time>
                  {editable(r.id, memoText(r.text))}
                </div>
              ))}
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
          {error && <p className="ws-review-error">{error}</p>}
          <div>
            <button type="button" onClick={onCancel} disabled={busy}>
              취소
            </button>
            <button type="button" className="primary" onClick={() => onConfirm({ pendingText: pendingText.trim(), records: recEdits })} disabled={busy}>
              {busy ? "저장 중…" : "확정"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
