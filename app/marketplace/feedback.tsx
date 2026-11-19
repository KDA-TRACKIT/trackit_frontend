"use client";
// 전략 후기 조각: 전략(달)마다 꿀 버튼 · 트레이더 상세의 "구매자 후기" (익명 댓글, 쓰는 중에 개인정보 · 전략 세부 내용 미리 경고)
import HoneyPot from "../HoneyPot";
import { useState } from "react";
import { errorMessage } from "../../lib/api/client";
import { filterComment } from "../../lib/comment-filter";
import { postComment, removeComment, toggleLike, type TraderFeedback } from "../../lib/feedback";
import { monthLabel, type Trader } from "./data";

/** 전략 하나(달)의 꿀 — 열람권으로 연 사람만 누를 수 있음 */
export function LikeButton({ trader, month, fb, notify }: { trader: Trader; month: string; fb: TraderFeedback | null; notify: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const count = fb?.likesByMonth[month] ?? 0;
  const liked = !!fb?.myLikes.includes(month);
  const canLike = !!fb?.openedMonths.includes(month);
  return (
    <button
      type="button"
      className={`mk-heart${liked ? " on" : ""}`}
      disabled={busy}
      aria-pressed={liked}
      title={canLike ? (liked ? "꿀 취소" : "이 전략에 꿀 주기") : "열람권으로 이 전략을 연 사람만 꿀을 줄 수 있어요"}
      onClick={async () => {
        if (!canLike) return notify("열람권으로 이 전략을 연 사람만 꿀을 줄 수 있어요");
        setBusy(true);
        try {
          await toggleLike(trader.id, month);
        } catch (e) {
          notify(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <HoneyPot count={count} max={100} size={15} />
      {count}
    </button>
  );
}

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  if (m < 1440 * 30) return `${Math.floor(m / 1440)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
};

/** 트레이더 상세 "구매자 후기": 익명 목록 + 연 전략이 있으면 쓰기 */
export function Reviews({ trader, fb, notify }: { trader: Trader; fb: TraderFeedback | null; notify: (m: string) => void }) {
  const opened = fb?.openedMonths ?? [];
  const [month, setMonth] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const target = month && opened.includes(month) ? month : opened[opened.length - 1];
  const check = text.trim() ? filterComment(text) : null;
  const comments = fb?.comments ?? [];

  async function submit() {
    if (!target || !check?.ok || busy) return;
    setBusy(true);
    try {
      await postComment(trader.id, target, text);
      setText("");
      notify("후기를 남겼어요");
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mk-section mk-reviews">
      <div className="mk-section-head">
        <div>
          <h2>
            구매자 후기 <span className="mk-reviews-count">{comments.length}</span>
          </h2>
        </div>
      </div>

      {opened.length > 0 && (
        <div className="mk-card mk-review-form">
          <div className="mk-review-form-top">
            <select value={target} onChange={(e) => setMonth(e.target.value)} aria-label="후기를 남길 전략">
              {opened.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} 전략
                </option>
              ))}
            </select>
            <small>{text.trim().length}/300</small>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={320}
            placeholder="전략을 써 본 느낌을 남겨 주세요. 연락처 · 링크 같은 개인정보나 진입 · 손절 가격 같은 전략 세부 내용은 쓸 수 없어요."
            aria-label="후기"
          />
          <div className="mk-review-form-foot">
            {check && !check.ok ? <small className="mk-review-warn">{check.reason}</small> : <small>익명 구매자로 보여요</small>}
            <button type="button" className="mk-primary" onClick={() => void submit()} disabled={!check?.ok || busy}>
              {busy ? "남기는 중…" : "후기 남기기"}
            </button>
          </div>
        </div>
      )}

      {comments.length ? (
        <ul className="mk-review-list">
          {comments.map((c) => (
            <li key={c.id} className="mk-card mk-review">
              <div className="mk-review-top">
                <b>익명 구매자</b>
                <span className="mk-review-month">{monthLabel(c.month)} 전략</span>
                <time dateTime={c.createdAt}>{ago(c.createdAt)}</time>
                {c.mine && (
                  <button
                    type="button"
                    className="mk-review-del"
                    onClick={async () => {
                      if (!window.confirm("이 후기를 지울까요?")) return;
                      try {
                        await removeComment(trader.id, c.id);
                      } catch (e) {
                        notify(errorMessage(e));
                      }
                    }}
                  >
                    내 후기 · 지우기
                  </button>
                )}
              </div>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mk-card mk-empty mk-review-empty">{opened.length ? "첫 후기를 남겨 보세요." : "아직 후기가 없어요."}</p>
      )}
    </section>
  );
}
