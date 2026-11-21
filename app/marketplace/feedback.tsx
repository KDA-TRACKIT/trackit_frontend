"use client";
// 전략 후기 · Q&A 조각 (모두 공개, 비밀글 없음): 전략마다 꿀 버튼 · 트레이더 상세의 "구매자 후기" (익명 댓글, 쓰는 중에 개인정보 · 전략 세부 내용 미리 경고)
import HoneyPot from "../HoneyPot";
import { useState } from "react";
import { errorMessage } from "../../lib/api/client";
import { filterAdvice, filterComment } from "../../lib/comment-filter";
import { postAnswer, postComment, postQuestion, removeComment, toggleLike, type Question, type TraderFeedback } from "../../lib/feedback";
import { strategiesOf, strategyOf, type Strategy, type Trader } from "./data";

/** 전략 하나의 꿀 — 구독한 사람만 누를 수 있음. 예전에 달 단위로 받은 꿀은 그 달이 들어 있는 전략에 합쳐 보여 줌 */
export function LikeButton({ trader, strategy, fb, notify }: { trader: Trader; strategy: Strategy; fb: TraderFeedback | null; notify: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const refs = [strategy.key, ...strategy.months];
  const count = refs.reduce((a, r) => a + (fb?.likesByMonth[r] ?? 0), 0);
  const liked = !!fb?.myLikes.includes(strategy.key);
  const canLike = !!fb?.subscribed || refs.some((r) => fb?.openedMonths.includes(r));
  return (
    <button
      type="button"
      className={`mk-heart${liked ? " on" : ""}`}
      disabled={busy}
      aria-pressed={liked}
      title={canLike ? (liked ? "꿀 취소" : "이 전략에 꿀 주기") : "구독한 사람만 꿀을 줄 수 있어요"}
      onClick={async () => {
        if (!canLike) return notify("구독한 사람만 꿀을 줄 수 있어요");
        setBusy(true);
        try {
          await toggleLike(trader.id, strategy.key);
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
  // 후기를 남길 수 있는 전략 (오래된 것부터): 구독 중이면 전부, 아니면 예전에 연 것
  const all = strategiesOf(trader).reverse();
  // 본인 전략에는 후기를 남길 수 없음
  const opened = fb?.owner ? [] : (fb?.subscribed ? all : all.filter((s) => [s.key, ...s.months].some((r) => fb?.openedMonths.includes(r)))).map((s) => s.key);
  const titleOf = (ref: string) => strategyOf(trader, ref)?.title ?? "전략";
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
                  {titleOf(m)}
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
                <span className="mk-review-month">{titleOf(c.month)}</span>
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

/**
 * 트레이더 상세 "Q&A" (2026-11-21): 전략별 공개 질문 · 답. 1:1 상담이 아니라 구독자 모두가 같이 봄 — 비밀글 없음
 *   질문 = 구독 중인 사람 (이미 공개된 기록에 대한 설명만), 답 = 전략을 올린 본인만
 *   쓰는 중에 개인정보 · 투자 조언(사도 되나요 · 추천 · 사세요)을 미리 알려 주고, 서버가 한 번 더 거름
 */
export function Qna({ trader, fb, notify }: { trader: Trader; fb: TraderFeedback | null; notify: (m: string) => void }) {
  const all = strategiesOf(trader).reverse();
  const canSee = !!fb?.subscribed || !!fb?.owner;
  const canAsk = !!fb?.subscribed && !fb?.owner;
  const questions = fb?.questions ?? [];
  const count = fb?.questionCount ?? questions.length;
  const titleOf = (ref: string) => strategyOf(trader, ref)?.title ?? "전략";
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const target = pick && all.some((s) => s.key === pick) ? pick : all[all.length - 1]?.key;
  const check = (value: string, role: "ask" | "answer") => {
    if (!value.trim()) return null;
    const base = filterComment(value, { qna: true });
    return base.ok ? filterAdvice(value, role) : base;
  };
  const asked = check(text, "ask");

  async function ask() {
    if (!target || !asked?.ok || busy) return;
    setBusy(true);
    try {
      await postQuestion(trader.id, target, text);
      setText("");
      notify("질문을 남겼어요");
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
            Q&amp;A <span className="mk-reviews-count">{count}</span>
          </h2>
          <p>구독자 모두가 함께 보는 공개 질문 · 답이에요. 비밀글은 없고, 이미 공개된 기록에 대한 질문만 받아요. 투자 상담 · 종목 추천은 올릴 수 없어요.</p>
        </div>
      </div>

      {canAsk && (
        <div className="mk-card mk-review-form">
          <div className="mk-review-form-top">
            <select value={target} onChange={(e) => setPick(e.target.value)} aria-label="질문할 전략">
              {all.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </select>
            <small>{text.trim().length}/600</small>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={640} placeholder="공개된 매매 · 메모에 대해 궁금한 점을 물어보세요. 예: 이때 손절을 왜 이 가격으로 잡았나요?" aria-label="질문" />
          <div className="mk-review-form-foot">
            {asked && !asked.ok ? <small className="mk-review-warn">{asked.reason}</small> : <small>익명으로, 구독자 모두에게 보여요</small>}
            <button type="button" className="mk-primary" onClick={() => void ask()} disabled={!asked?.ok || busy}>
              {busy ? "남기는 중…" : "질문 남기기"}
            </button>
          </div>
        </div>
      )}

      {!canSee ? (
        <p className="mk-card mk-empty mk-review-empty">{count ? `구독하면 질문 · 답 ${count}개를 볼 수 있어요.` : "구독하면 공개된 기록에 대해 질문할 수 있어요."}</p>
      ) : questions.length ? (
        <ul className="mk-review-list">
          {questions.map((q) => (
            <QnaItem key={q.id} trader={trader} q={q} title={titleOf(q.month)} owner={!!fb?.owner} check={check} notify={notify} />
          ))}
        </ul>
      ) : (
        <p className="mk-card mk-empty mk-review-empty">{canAsk ? "첫 질문을 남겨 보세요." : "아직 질문이 없어요."}</p>
      )}
    </section>
  );
}

function QnaItem({ trader, q, title, owner, check, notify }: { trader: Trader; q: Question; title: string; owner: boolean; check: (v: string, role: "ask" | "answer") => ReturnType<typeof filterComment> | null; notify: (m: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const answered = check(text, "answer");
  const remove = async (id: string, what: string) => {
    if (!window.confirm(`이 ${what}을 지울까요?`)) return;
    try {
      await removeComment(trader.id, id);
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  async function answer() {
    if (!answered?.ok || busy) return;
    setBusy(true);
    try {
      await postAnswer(trader.id, q.id, text);
      setText("");
      notify("답을 남겼어요");
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="mk-card mk-review mk-qna">
      <div className="mk-review-top">
        <b>Q · 익명 구독자</b>
        <span className="mk-review-month">{title}</span>
        <time dateTime={q.createdAt}>{ago(q.createdAt)}</time>
        {q.mine && (
          <button type="button" className="mk-review-del" onClick={() => void remove(q.id, "질문")}>
            내 질문 · 지우기
          </button>
        )}
      </div>
      <p>{q.body}</p>
      {q.answers.map((a) => (
        <div key={a.id} className="mk-qna-answer">
          <div className="mk-review-top">
            <b>A · {trader.name}</b>
            <time dateTime={a.createdAt}>{ago(a.createdAt)}</time>
            {a.mine && (
              <button type="button" className="mk-review-del" onClick={() => void remove(a.id, "답")}>
                내 답 · 지우기
              </button>
            )}
          </div>
          <p>{a.body}</p>
        </div>
      ))}
      {owner && (
        <div className="mk-qna-reply">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={640} placeholder="공개한 기록에 대한 설명만 써 주세요. 사라 · 팔라 같은 권유나 종목 추천은 쓸 수 없어요." aria-label="답" />
          <div className="mk-review-form-foot">
            {answered && !answered.ok ? <small className="mk-review-warn">{answered.reason}</small> : <small>구독자 모두에게 보여요</small>}
            <button type="button" className="mk-primary" onClick={() => void answer()} disabled={!answered?.ok || busy}>
              {busy ? "남기는 중…" : "답 남기기"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
