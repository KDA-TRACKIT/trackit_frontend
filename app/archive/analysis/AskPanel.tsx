"use client";
// 전략 분석 채팅 (2026-11-20, 쓰론 채팅을 참고)
//   왼쪽: 채팅 목록 — 기본 채팅 · 산 전략 채팅 · 종목 채팅(오늘 등락률). 채팅마다 기록은 이 브라우저에 남음
//   채팅을 열면 그날 첫 메시지로 비서가 먼저 브리핑(기본: 내 종목 시세 · 이번 주 일정 / 전략 · 종목: 오늘 매수 조건 체크)
//   질문하면 lib/strategy-chat 이 질문 종류 · 대상을 정하고, 관련 전략 · 버전 · 노트 · 매매 기록 · 시세를 근거로 모음
//   AI 는 그 근거만으로 답하고(서버가 근거 밖 숫자 문장을 버림), AI 가 없으면 같은 근거로 규칙대로 답함
//   답: 결론(조건 체크) 먼저 → 설명 → 출처 칩(누르면 그 근거) · 관련 종목 칩과 차트 · 참고한 데이터
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Send } from "lucide-react";
import Link from "next/link";
import { initRecordSource, useRecords } from "../../../lib/records";
import { usePasses } from "../../../lib/purchases";
import { askStrategy } from "../../../lib/api/ai";
import { getQuotes } from "../../../lib/api/insights";
import { INTENTS, answerLocally, detectIntent, detectTarget, type Reply, type Target } from "../../../lib/strategy-chat";
import { briefing } from "../../../lib/strategy-briefing";
import StrategyChart from "../../marketplace/StrategyChart";
import { useDark } from "../../marketplace/GuessFirst";
import { traderById } from "../../marketplace/data";

type Msg =
  | { id: number; at: string; role: "user"; text: string }
  | { id: number; at: string; role: "bot"; reply: Reply; ai: boolean; cautions: string[]; brief?: boolean }
  | { id: number; at: string; role: "wait"; text: string }
  | { id: number; at: string; role: "pick"; question: string };
const INTENT_LABEL = Object.fromEntries(INTENTS.map((i) => [i.key, i.label]));
const STORE = "trackit:strategy-chat";
const MAX = 40;
const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
/** 11월 20일 (목) 오후 4:42 */
const stamp = (iso: string) => {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  const h = d.getUTCHours();
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${"일월화수목금토"[d.getUTCDay()]}) ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const readAll = (): Record<string, Msg[]> => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
};

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
  const stockTargets = targets.filter((t) => t.kind === "stock");
  const traders = targets.filter((t) => t.kind === "trader");

  // 채팅 목록: 기본 채팅 + 전략 · 종목 채팅. 채팅마다 기록은 이 브라우저에
  const [thread, setThread] = useState("basic");
  const threadTarget = targets.find((t) => t.key === thread) ?? null;
  const [all, setAll] = useState<Record<string, Msg[]>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setAll(readAll());
    setLoaded(true);
  }, []);
  const msgs = all[thread] ?? [];
  const update = (key: string, f: (m: Msg[]) => Msg[]) =>
    setAll((prev) => {
      const next = { ...prev, [key]: f(prev[key] ?? []) };
      try {
        // 기다리는 메시지는 저장하지 않음
        localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.filter((m) => m.role !== "wait").slice(-MAX)]))));
      } catch {
        // 저장 공간이 모자라면 기록만 안 남김
      }
      return next;
    });

  // 종목 채팅 옆 오늘 등락률
  const [chg, setChg] = useState<Record<string, number>>({});
  const codes = stockTargets
    .map((t) => t.id)
    .filter((c) => /^\d{6}$/.test(c))
    .join(",");
  useEffect(() => {
    if (!codes) return;
    let alive = true;
    getQuotes(codes.split(","))
      .then((r) => alive && setChg(Object.fromEntries(r.quotes.map((x) => [x.code, x.changeRate]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [codes]);

  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const nextId = () => Date.now() * 100 + (++seq.current % 100);
  const endRef = useRef<HTMLDivElement>(null);
  // 채팅창 높이: 아래 여백을 위 메뉴 ~ 채팅창 사이 간격과 같게 (화면 크기 · 페이지 배율(html zoom)이 달라도 맞게 재서)
  const boxRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const box = boxRef.current;
      if (!box) return;
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const menu = document.querySelector(".gnb")?.getBoundingClientRect().bottom ?? 0;
      // 아래 여백 = 메뉴 아래 ~ 채팅창 위 간격 ('전략 분석' 제목이 든 위쪽 간격과 같게)
      const gap = Math.max(16, box.getBoundingClientRect().top - menu);
      const top = box.getBoundingClientRect().top + window.scrollY;
      box.style.height = `${Math.max(520, (window.innerHeight - top - gap) / zoom)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.length, thread]);

  // 채팅을 열면 그날 첫 브리핑 (오늘 브리핑이 이미 있으면 안 함)
  const briefed = useRef(new Set<string>());
  useEffect(() => {
    if (!loaded || (!records.length && !passes.length)) return;
    const today = kstDay(new Date().toISOString());
    const has = (all[thread] ?? []).some((m) => m.role === "bot" && m.brief && kstDay(m.at) === today);
    if (has || briefed.current.has(thread)) return;
    briefed.current.add(thread);
    const key = thread;
    const waitId = nextId();
    update(key, (m) => [...m, { id: waitId, at: new Date().toISOString(), role: "wait", text: "오늘 브리핑을 준비하는 중…" }]);
    briefing(threadTarget, records, stockTargets)
      .then((reply) => update(key, (m) => m.map((x) => (x.id === waitId ? { id: waitId, at: x.at, role: "bot", reply, ai: false, cautions: [], brief: true } : x))))
      .catch(() => update(key, (m) => m.filter((x) => x.id !== waitId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, records.length, passes.length, loaded]);

  async function send(text: string, forced?: Target) {
    const question = text.trim();
    if (!question || busy) return;
    const key = thread;
    const target = forced ?? detectTarget(question, targets) ?? threadTarget;
    const now = new Date().toISOString();
    setQ("");
    // 기본 채팅에서 대상이 없으면 먼저 고르게
    if (!target) {
      update(key, (m) => [...m, { id: nextId(), at: now, role: "user", text: question }, { id: nextId(), at: now, role: "pick", question }]);
      return;
    }
    const intent = detectIntent(question);
    const waitId = nextId();
    setBusy(true);
    update(key, (m) => [
      ...m.filter((x) => !(forced && x.role === "pick" && x.question === question)),
      ...(forced ? [] : [{ id: nextId(), at: now, role: "user" as const, text: question }]),
      { id: waitId, at: now, role: "wait", text: `${target.name} · ${INTENT_LABEL[intent]}: 전략 · 노트 · 매매 기록 · 시세를 찾는 중…` },
    ]);
    try {
      const local = await answerLocally(question, intent, target, records);
      const ai = await askStrategy({ question, subject: target.name, evidence: local.evidence }).catch(() => null);
      const useAi = !!ai?.answer && ai.points.length > 0;
      const reply: Reply = useAi ? { ...local, answer: ai!.answer, points: ai!.points } : local;
      update(key, (m) => m.map((x) => (x.id === waitId ? { id: waitId, at: x.at, role: "bot", reply, ai: useAi, cautions: useAi ? ai!.cautions : [] } : x)));
    } catch {
      update(key, (m) => m.map((x) => (x.id === waitId ? { id: waitId, at: x.at, role: "wait", text: "데이터를 불러오지 못했어요. 잠시 뒤 다시 물어봐 주세요." } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={boxRef} className="mk-card ask-wrap ask-chat" aria-label="전략 분석 채팅">
      <nav className="ask-side" aria-label="채팅 목록">
        <button type="button" className={thread === "basic" ? "on" : ""} onClick={() => setThread("basic")}>
          <MessageSquare size={15} aria-hidden /> 기본 채팅
        </button>
        {!!traders.length && <h4>산 전략</h4>}
        {traders.map((t) => (
          <button key={t.key} type="button" className={thread === t.key ? "on" : ""} onClick={() => setThread(t.key)}>
            <span className="dot t" aria-hidden />
            {t.name.replace(/ 전략$/, "")}
          </button>
        ))}
        {!!stockTargets.length && <h4>종목 채팅</h4>}
        {stockTargets.map((t) => (
          <button key={t.key} type="button" className={thread === t.key ? "on" : ""} onClick={() => setThread(t.key)}>
            <span className="dot s" aria-hidden />
            {t.name}
            {chg[t.id] !== undefined && <em className={chg[t.id] >= 0 ? "gain" : "loss"}>{`${chg[t.id] >= 0 ? "+" : ""}${chg[t.id].toFixed(2)}%`}</em>}
          </button>
        ))}
        <Link className="ask-side-new" href="/marketplace">
          <Plus size={14} aria-hidden /> 전략 더 열기
        </Link>
      </nav>

      <div className="ask-main">
        <div className="ask-log" aria-live="polite">
          {!msgs.length && (
            <div className="ask-hello">
              <b>{threadTarget ? `${threadTarget.name}에 대해 물어보세요` : "내 전략과 매매 기록으로 답해요"}</b>
            </div>
          )}
          {msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const showStamp = !prev || kstDay(prev.at) !== kstDay(m.at) || Date.parse(m.at) - Date.parse(prev.at) > 30 * 60_000;
            return (
              <div key={m.id} className="ask-row">
                {showStamp && <time className="ask-stamp">{stamp(m.at)}</time>}
                {m.role === "user" ? (
                  <div className="ask-msg user">{m.text}</div>
                ) : m.role === "wait" ? (
                  <div className="ask-msg bot wait">{m.text}</div>
                ) : m.role === "pick" ? (
                  <div className="ask-msg bot">
                    <p>어떤 전략이나 종목에 대해 물어볼까요?</p>
                    <div className="ask-stocks">
                      {targets.map((t) => (
                        <button key={t.key} type="button" disabled={busy} onClick={() => send(m.question, t)}>
                          <b>{t.name}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <BotMsg m={m} />
                )}
              </div>
            );
          })}
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={threadTarget ? `${threadTarget.name}에 대해 물어보세요` : "예: 피보볼륨 전략 매수 조건이 뭐였지? · 삼성전자 지금 사도 돼?"} aria-label="질문" />
          <button type="submit" disabled={busy || !q.trim()} aria-label="보내기">
            <Send size={16} />
          </button>
        </form>
        <small className="ask-disclaimer">AI 답변은 내 전략 · 매매 기록 · 시세를 근거로 한 참고용이며, 투자 권유가 아닙니다.</small>
      </div>
    </section>
  );
}

/** 비서 답: 결론(조건 체크) → 설명 → 출처 칩 → 종목 · 차트 → 참고한 데이터 */
function BotMsg({ m }: { m: Extract<Msg, { role: "bot" }> }) {
  const [open, setOpen] = useState<string | null>(null);
  const label = (id: string) => m.reply.evidence.find((e) => e.id === id)?.label ?? id;
  return (
    <div className="ask-msg bot">
      <small className="ask-tag">{m.brief ? `${m.reply.target.name} · 오늘 브리핑` : `${m.reply.target.name} · ${INTENT_LABEL[m.reply.intent]}`}</small>
      {m.reply.checks && (
        <div className="ask-checks">
          <b className={m.reply.checks.every((c) => c.ok !== false) && m.reply.checks.some((c) => c.ok) ? "ok" : "no"}>{m.reply.verdict}</b>
          <ul>
            {m.reply.checks.map((c) => (
              <li key={c.label} className={c.ok === null ? "na" : c.ok ? "ok" : "no"}>
                <span aria-hidden>{c.ok === null ? "?" : c.ok ? "✓" : "✕"}</span>
                {c.label}
                {c.detail && <small> — {c.detail}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.reply.answer && <p className="ask-lead">{m.reply.answer}</p>}
      <ul>
        {m.reply.points.map((p) => (
          <li key={p.text}>
            {p.text}
            {p.refs.map((r) => (
              <button key={r} type="button" className="ask-cite" onClick={() => setOpen(open === r ? null : r)} title="이 근거 보기">
                {label(r)} ↗
              </button>
            ))}
          </li>
        ))}
      </ul>
      {open && <p className="ask-cite-box">{m.reply.evidence.find((e) => e.id === open)?.text}</p>}
      {m.cautions.map((c) => (
        <small key={c} className="ask-caution">
          {c}
        </small>
      ))}
      <Visual reply={m.reply} />
      <details>
        <summary>참고한 데이터 {m.reply.evidence.length}개</summary>
        <ol>
          {m.reply.evidence.map((e) => (
            <li key={e.id}>
              <b>{e.label}</b> {e.text}
            </li>
          ))}
        </ol>
      </details>
      <small className="ask-src">{m.ai ? "AI 답변 · 근거 밖 숫자는 뺐어요" : "근거 데이터로 정리한 답이에요"}</small>
    </div>
  );
}

/** 답에 붙는 종목 칩 + 차트 (칩을 누르면 그 종목 차트로) */
function Visual({ reply }: { reply: Reply }) {
  const dark = useDark();
  const charts = reply.charts ?? [];
  const [code, setCode] = useState<string | null>(null);
  const cur = charts.find((c) => c.code === code) ?? charts.find((c) => c.code === reply.stocks?.[0]?.code) ?? charts[0];
  if (!reply.stocks?.length && !cur) return null;
  const pctText = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  return (
    <div className="ask-visual">
      {!!reply.stocks?.length && (
        <div className="ask-stocks">
          {reply.stocks.map((st) => (
            <button key={st.code} type="button" className={cur?.code === st.code ? "on" : ""} onClick={() => setCode(st.code)} disabled={!charts.some((c) => c.code === st.code)}>
              <b>{st.name}</b>
              {st.date && <small>{st.date.slice(5).replace("-", ".")} 매수</small>}
              {st.ret !== undefined && <em className={st.ret > 0 ? "gain" : "loss"}>{pctText(st.ret)}</em>}
            </button>
          ))}
        </div>
      )}
      {cur && (
        <div className="ask-chart">
          <StrategyChart candles={cur.candles} trades={cur.trades} notes={cur.notes} ind={cur.ind} code={cur.code} dark={dark} currency={reply.currency ?? "KRW"} />
          <Link href={`/workshop?symbol=${encodeURIComponent(cur.code)}&name=${encodeURIComponent(reply.stocks?.find((x) => x.code === cur.code)?.name ?? cur.code)}`}>투자작업실에서 열기 ›</Link>
        </div>
      )}
    </div>
  );
}
