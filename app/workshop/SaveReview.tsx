"use client";
// 저장 확인 창 (2026-11-22): 인스타 게시물처럼 한 장 — 종목 · 날짜 / 차트 그림(보이는 구간 고르기) / Note 에 쓴 본문
//   본문은 Note 에 쓴 그대로 (고치려면 취소하고 Note 에서). '확인하고 저장' 하면 DB 에 저장되고 그 버전은 고칠 수 없음 (고치면 새 버전)
import { useEffect } from "react";
import { dateLabel } from "../../lib/records";

export default function SaveReview({
  symbolName,
  image,
  shooting,
  range,
  dateAt,
  onRange,
  pending,
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
  /** 그림에 보이는 봉 구간 (봉 번호) · 고를 수 있는 끝 번호 */
  range?: { from: number; to: number; max: number };
  /** 봉 번호 → 날짜 글 */
  dateAt?: (i: number) => string;
  /** 보이는 구간 바꾸기 (다시 찍음) */
  onRange?: (from: number, to: number) => void;
  /** 이번에 저장될 글 (Note 에 쓴 것) · 날짜 · 시각 */
  pending: { date: string; time: string; text: string };
  /** 체결과 연결됐는지 (아니면 검증 대기로 저장) */
  linked: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (edits: { pendingText: string; records: Record<string, string> }) => void;
}) {
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

  const text = pending.text.trim();
  return (
    <div className="ws-review-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="ws-review" role="dialog" aria-modal="true" aria-label="저장할 내용 확인">
        <header className="ws-review-head">
          <div>
            <h2>저장할 내용 확인</h2>
          </div>
          <button type="button" className="ws-review-x" onClick={onCancel} disabled={busy} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="ws-review-body">
          <article className="ws-post">
            <header className="ws-post-head">
              <strong>{symbolName}</strong>
              <time>
                {dateLabel(pending.date)} {pending.time.slice(0, 5)}
              </time>
            </header>
            <div className="ws-review-chart">
              {shooting && !image ? (
                <p className="ws-review-empty">차트를 그리는 중…</p>
              ) : image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={`${symbolName} 차트`} className={shooting ? "is-shooting" : undefined} />
              ) : (
                <p className="ws-review-empty">차트 그림을 만들지 못했어요. 그은 선은 그대로 저장돼요.</p>
              )}
              {/* 보이는 구간 고르기: 기본은 드로잉 전체, 손잡이 두 개로 시작 · 끝을 옮기면 다시 찍음 */}
              {range && onRange && range.max > 1 && (
                <div className="ws-review-range">
                  <div className="ws-review-range-track" style={{ ["--lo" as string]: `${(range.from / range.max) * 100}%`, ["--hi" as string]: `${(range.to / range.max) * 100}%` }}>
                    <input type="range" min={0} max={range.max} step={1} value={range.from} disabled={busy} aria-label="차트 시작" onChange={(e) => onRange(Math.min(Number(e.target.value), range.to - 1), range.to)} />
                    <input type="range" min={0} max={range.max} step={1} value={range.to} disabled={busy} aria-label="차트 끝" onChange={(e) => onRange(range.from, Math.max(Number(e.target.value), range.from + 1))} />
                  </div>
                  <small>
                    {dateAt?.(range.from)} ~ {dateAt?.(range.to)}
                  </small>
                </div>
              )}
            </div>
            {text && <p className="ws-post-body">{text}</p>}
          </article>
        </div>

        <footer className="ws-review-foot">
          <p>
            <b>저장하면 이 버전은 수정 · 삭제할 수 없어요.</b> 고칠 땐 새 버전으로 남아요.
            {!linked && " 연결된 체결이 없어 검증 대기로 저장돼요."}
          </p>
          {error && <p className="ws-review-error">{error}</p>}
          <div>
            <button type="button" onClick={onCancel} disabled={busy}>
              취소
            </button>
            <button type="button" className="primary" onClick={() => onConfirm({ pendingText: text, records: {} })} disabled={busy || (!text && !image)}>
              {busy ? "저장 중…" : "확인하고 저장"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
