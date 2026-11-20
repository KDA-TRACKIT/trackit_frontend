"use client";
// 전략 분석 채팅 (2026-11-20): 채팅창 하나 + 빠른 질문(전략 내용 · 이행 분석 · 변경점 · 매매 전 체크 · 나와 맞나)
//   질문하면 lib/strategy-chat 이 질문 종류 · 대상을 정하고, 관련 전략 · 버전 · 노트 · 매매 기록 · 시세를 근거로 모음
//   AI 는 그 근거만으로 답하고(서버가 근거 밖 숫자 문장을 버림), AI 가 없으면 같은 근거로 규칙대로 답함
//   답마다 '참고한 데이터'를 펼쳐 볼 수 있고, 노트로 남길 수 있음
import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { addRecord, initRecordSource, kstNow, useRecords } from "../../../lib/records";
import { usePasses } from "../../../lib/purchases";
import { askStrategy } from "../../../lib/api/ai";
import { INTENTS, answerLocally, detectIntent, detectTarget, type Reply, type Target } from "../../../lib/strategy-chat";
import { monthLabel, traderById } from "../../marketplace/data";

type Msg = { id: number; role: "user"; text: string } | { id: number; role: "bot"; reply: Reply; ai: boolean; cautions: string[]; saved?: string } | { id: number; role: "wait"; text: string };
const INTENT_LABEL = Object.fromEntries(INTENTS.map((i) => [i.key, i.label]));

export default function AskPanel() {
  const records = useRecords();
  const passes = usePasses();
  useEffect(() => {
    void initRecordSource();
  }, []);
  const targets: Target[] = useMemo(() => {
    const traders = new Map<string, string[]>();
    for (const p of passes) if (p.used) traders.set(p.traderId, [...(traders.get(p.traderId) ?? []), p.used.month]);
    const stocks = new Map<string, string>();
    for (const r of records) {
      if (r.symbol) stocks.set(r.symbol, r.symbolName ?? r.symbol);
      else if (r.target) stocks.set(r.target.code, r.target.name);
    }
    return [
      ...[...traders].map(([id, months]) => ({ key: `t:${id}`, kind: "trader" as const, id, name: `${traderById(id)?.name ?? id} 전략`, months: [...new Set(months)].sort() })),
      ...[...stocks].map(([code, name]) => ({ key: `s:${code}`, kind: "stock" as const, id: code, name })),
    ];
  }, [records, passes]);
  const [pick, setPick] = useState("");
  const current = targets.find((t) => t.key === pick) ?? targets[0];
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !current) return;
    const target = detectTarget(question, targets) ?? current;
    const intent = detectIntent(question);
    const waitId = ++seq.current;
    setQ("");
    setBusy(true);
    setMsgs((m) => [...m, { id: ++seq.current, role: "user", text: question }, { id: waitId, role: "wait", text: `${target.name} · ${INTENT_LABEL[intent]}: 전략 · 노트 · 매매 기록 · 시세를 찾는 중…` }]);
    try {
      const local = await answerLocally(question, intent, target, records);
      const ai = await askStrategy({ question, subject: target.name, evidence: local.evidence }).catch(() => null);
      const useAi = !!ai?.answer && ai.points.length > 0;
      const reply: Reply = useAi ? { ...local, answer: ai!.answer, points: ai!.points } : local;
      const cautions = useAi ? ai!.cautions : [];
      setMsgs((m) => m.map((x) => (x.id === waitId ? { id: waitId, role: "bot", reply, ai: useAi, cautions } : x)));
    } catch {
      setMsgs((m) => m.map((x) => (x.id === waitId ? { id: waitId, role: "wait", text: "데이터를 불러오지 못했어요. 잠시 뒤 다시 물어봐 주세요." } : x)));
    } finally {
      setBusy(false);
    }
  }

  async function save(id: number) {
    const m = msgs.find((x) => x.id === id);
    if (!m || m.role !== "bot") return;
    const { date, time } = kstNow();
    const body = [`[전략 분석 · ${m.reply.target.name} · ${INTENT_LABEL[m.reply.intent]}]`, m.reply.answer, ...m.reply.points.map((p) => `- ${p.text}`)].filter(Boolean).join("\n");
    const r = await addRecord({ date, noteTime: time, executionTime: null, symbol: null, symbolName: null, topic: "기타", text: body });
    setMsgs((list) => list.map((x) => (x.id === id && x.role === "bot" ? { ...x, saved: r.ok ? "노트에 남겼어요" : (r.error ?? "남기지 못했어요") } : x)));
  }

  if (!targets.length)
    return (
      <section className="mk-card ask-wrap">
        <p className="ask-muted">전략을 열거나 종목 노트를 남기면, 그 전략과 내 매매 기록을 근거로 물어볼 수 있어요.</p>
      </section>
    );
  return (
    <section className="mk-card ask-wrap ask-chat" aria-label="전략 분석 채팅">
      <div className="ask-log" aria-live="polite">
        {!msgs.length && (
          <div className="ask-hello">
            <b>내 전략과 매매 기록으로 답해요</b>
            <p>산 전략 · 전략 버전 · 내 노트 · 실제 매매를 찾아 근거로 쓰고, 어떤 데이터를 봤는지 같이 보여 줘요.</p>
          </div>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ask-msg user">
              {m.text}
            </div>
          ) : m.role === "wait" ? (
            <div key={m.id} className="ask-msg bot wait">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="ask-msg bot">
              <small className="ask-tag">
                {m.reply.target.name} · {INTENT_LABEL[m.reply.intent]}
              </small>
              {m.reply.answer && <p>{m.reply.answer}</p>}
              <ul>
                {m.reply.points.map((p) => (
                  <li key={p.text}>
                    {p.text}
                    {p.refs.map((r) => (
                      <sup key={r}>{r}</sup>
                    ))}
                  </li>
                ))}
              </ul>
              {m.cautions.map((c) => (
                <small key={c} className="ask-caution">
                  {c}
                </small>
              ))}
              <details>
                <summary>참고한 데이터 {m.reply.evidence.length}개</summary>
                <ol>
                  {m.reply.evidence.map((e) => (
                    <li key={e.id}>
                      <b>
                        {e.id} {e.label}
                      </b>{" "}
                      {e.text}
                    </li>
                  ))}
                </ol>
              </details>
              <div className="ask-foot">
                <small>{m.ai ? "AI 답변 · 근거 밖 숫자는 뺐어요" : "근거 데이터로 정리한 답이에요"}</small>
                <button type="button" onClick={() => save(m.id)} disabled={!!m.saved}>
                  {m.saved ?? "노트로 남기기"}
                </button>
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="ask-quick">
        {INTENTS.map((i) => (
          <button key={i.key} type="button" disabled={busy} onClick={() => send(i.ask)}>
            {i.label}
          </button>
        ))}
      </div>
      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(q);
        }}
      >
        <select value={current?.key ?? ""} onChange={(e) => setPick(e.target.value)} aria-label="무엇에 대해 물을지">
          {targets.some((t) => t.kind === "trader") && (
            <optgroup label="산 전략">
              {targets
                .filter((t) => t.kind === "trader")
                .map((t) => (
                  <option key={t.key} value={t.key} title={(t.months ?? []).map(monthLabel).join(", ")}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          )}
          <optgroup label="내 종목 전략">
            {targets
              .filter((t) => t.kind === "stock")
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
          </optgroup>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 이 전략 매수 조건이 뭐였지? · 내가 잘 지키고 있어?" aria-label="질문" />
        <button type="submit" disabled={busy || !q.trim()} aria-label="보내기">
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
