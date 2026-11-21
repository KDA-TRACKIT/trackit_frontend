"use client";
// 전략 마켓의 꿀 버튼 · 익명 구매자 후기 · 구독자와 판매자가 보는 보충 노트
import HoneyPot from "../HoneyPot";
import BeeLoader from "../BeeLoader";
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
  const all = strategiesOf(trader);
  const openedKeys = new Set(fb?.openedMonths.map((ref) =>
    (all.find((s) => s.key === ref) ?? all.find((s) => s.months.includes(ref)))?.key,
  ));
  const opened = fb?.owner ? [] : all.filter((s) => openedKeys.has(s.key)).reverse().map((s) => s.key);
  // 월 구독은 전략 키를 저장하지 않으므로 열람 기록이 없으면 최신 전략 한 건에 후기를 남긴다.
  const latest = all[0];
  if (!opened.length && fb?.subscribed && !fb.owner && latest) opened.push(latest.key);
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
            {opened.length > 1 && (
              <select value={target} onChange={(e) => setMonth(e.target.value)} aria-label="후기를 남길 전략">
                {opened.map((m) => (
                  <option key={m} value={m}>
                    {titleOf(m)}
                  </option>
                ))}
              </select>
            )}
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
      ) : !fb ? (
        // 후기를 받아 오기 전에는 '아직 후기가 없어요' 대신 로딩
        <div className="mk-card mk-empty mk-review-empty">
          <BeeLoader size="sm" />
        </div>
      ) : (
        <p className="mk-card mk-empty mk-review-empty">{opened.length ? "첫 후기를 남겨 보세요." : "아직 후기가 없어요."}</p>
      )}
    </section>
  );
}

/**
 * 트레이더 상세의 보충 노트: 구독자 전원과 판매자가 요청과 답변을 열람할 수 있음
 *   설명 요청 = 구독 중인 사람 (전략 노트에 대한 보충 설명), 답변 = 전략을 올린 판매자
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
            보충 노트 <span className="mk-reviews-count">{count}</span>
          </h2>
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

      {!fb ? (
        <div className="mk-card mk-empty mk-review-empty">
          <BeeLoader size="sm" />
        </div>
      ) : !canSee ? (
        <p className="mk-card mk-empty mk-review-empty">
          구독하면 다른 구독자들이 전략 노트의 어떤 부분에 대해 설명을 요청했고, 판매자가 어떻게 답했는지 볼 수 있어요.
        </p>
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
