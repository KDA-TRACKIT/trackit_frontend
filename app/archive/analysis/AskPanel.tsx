"use client";
// 전략 분석 채팅 (2026-11-20, 쓰론 채팅을 참고)
//   왼쪽: 채팅 목록 — 기본 채팅 · 구매 전략(최근 3명, 전체에서 고르기) · 종목 채팅(최근 3개 + 종목 검색, 오늘 등락률). 기록은 로그인했으면 서버에 사람마다(최근 40개), 아니면 이 브라우저
//   채팅을 열면 그날 첫 메시지로 비서가 먼저 브리핑(기본: 내 종목 시세 · 이번 주 일정 / 전략 · 종목: 오늘 매수 조건 체크)
//   질문하면 lib/strategy-chat 이 질문 종류 · 대상을 정하고, 관련 전략 · 버전 · 노트 · 매매 기록 · 시세를 근거로 모음
//   AI 는 그 근거만으로 답하고(서버가 근거 밖 숫자 문장을 버림), AI 가 없으면 같은 근거로 규칙대로 답함
//   답: 결론(조건 체크) 먼저 → 설명 → 출처 칩(누르면 그 근거) · 관련 종목 칩과 차트 · 참고한 데이터
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { initRecordSource, useRecords } from "../../../lib/records";
import { usePasses } from "../../../lib/purchases";
import { askStrategy } from "../../../lib/api/ai";
import { getQuotes } from "../../../lib/api/insights";
import { searchAllSymbols } from "../../../lib/market-data";
import { accessToken } from "../../../lib/api/client";
import { clearChat, loadChat, saveChatMsg, type StoredMsg } from "../../../lib/api/strategy-chat";
import { INTENTS, answerLocally, detectIntent, detectTarget, type Reply, type Target } from "../../../lib/strategy-chat";
import { briefing } from "../../../lib/strategy-briefing";
import StrategyChart from "../../marketplace/StrategyChart";
import { useDark } from "../../marketplace/GuessFirst";
import { traderById } from "../../marketplace/data";
import BeeLoader from "../../BeeLoader";

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
  // 채팅 목록: 기본 채팅 + 전략 · 종목 채팅. 채팅마다 기록은 이 브라우저에
  const [thread, setThread] = useState("basic");
  /** 채팅을 마지막으로 연 시각 (전체 목록에서 고른 트레이더 · 검색으로 연 종목이 '최근'으로 올라가게, 이 브라우저에 기억) */
  const [opened, setOpened] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setOpened(JSON.parse(localStorage.getItem("trackit:strategy-chat-opened") ?? "{}"));
    } catch {
      // 없으면 빈 채로
    }
  }, []);
  function openThread(key: string) {
    setThread(key);
    if (key === "basic") return;
    setOpened((o) => {
      const next = { ...o, [key]: new Date().toISOString() };
      try {
        localStorage.setItem("trackit:strategy-chat-opened", JSON.stringify(next));
      } catch {
        // 기억 못 해도 지금 화면은 그대로
      }
      return next;
    });
  }
  /** 검색으로 새로 연 종목 (아직 노트 · 채팅 기록이 없는 것) */
  const [extra, setExtra] = useState<{ code: string; name: string }[]>([]);
  // 기록: 로그인했으면 서버(사람마다), 아니면 이 브라우저
  const [all, setAll] = useState<Record<string, Msg[]>>({});
  const [loaded, setLoaded] = useState(false);
  const server = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await accessToken().catch(() => null);
      const fromServer = token ? await loadChat().catch(() => null) : null;
      if (!alive) return;
      server.current = !!fromServer;
      setAll(fromServer ? (fromServer.threads as unknown as Record<string, Msg[]>) : readAll());
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);
  const msgs = all[thread] ?? [];

  // 대상: 구매 전략(최근에 산 · 연 순) · 종목(최근 노트 순, 검색으로 연 종목은 채팅 기록에서)
  const targets: Target[] = useMemo(() => {
    const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
    const traders = new Map<string, { months: string[]; at: number }>();
    for (const p of passes) {
      if (!p.used) continue;
      const t = traders.get(p.traderId) ?? { months: [], at: 0 };
      traders.set(p.traderId, { months: [...t.months, p.used.month], at: Math.max(t.at, ms(p.used.at), ms(p.approvedAt)) });
    }
    const stocks = new Map<string, { name: string; at: number }>();
    for (const r of records) {
      const code = r.symbol ?? r.target?.code;
      const name = r.symbolName ?? r.target?.name ?? code;
      if (!code || !name) continue;
      const at = ms(`${r.date}T${r.noteTime}+09:00`);
      if (!stocks.has(code) || stocks.get(code)!.at < at) stocks.set(code, { name, at });
    }
    for (const [key, list] of Object.entries(all)) {
      if (!key.startsWith("s:") || stocks.has(key.slice(2))) continue;
      const bot = list.find((m) => m.role === "bot") as Extract<Msg, { role: "bot" }> | undefined;
      const last = list.at(-1);
      if (bot && last) stocks.set(key.slice(2), { name: bot.reply.target.name, at: ms(last.at) });
    }
    for (const x of extra) if (!stocks.has(x.code)) stocks.set(x.code, { name: x.name, at: Date.now() });
    return [
      ...[...traders]
        .map(([id, v]) => [id, { ...v, at: Math.max(v.at, ms(opened[`t:${id}`])) }] as const)
        .sort((a, b) => b[1].at - a[1].at)
        .map(([id, v]) => ({ key: `t:${id}`, kind: "trader" as const, id, name: `${traderById(id)?.name ?? id} 전략`, months: [...new Set(v.months)].sort() })),
      ...[...stocks]
        .map(([code, v]) => [code, { ...v, at: Math.max(v.at, ms(opened[`s:${code}`])) }] as const)
        .sort((a, b) => b[1].at - a[1].at)
        .map(([code, v]) => ({ key: `s:${code}`, kind: "stock" as const, id: code, name: v.name })),
    ];
  }, [records, passes, all, extra, opened]);
  const stockTargets = targets.filter((t) => t.kind === "stock");
  const traders = targets.filter((t) => t.kind === "trader");
  const threadTarget = targets.find((t) => t.key === thread) ?? null;
  /** 목록에 보이는 것: 최근 3개 + 지금 연 채팅 */
  const top3 = (list: Target[]) => [...list.slice(0, 3), ...list.slice(3).filter((t) => t.key === thread)];
  const [allTraders, setAllTraders] = useState(false);
  // 종목 검색: 내 종목에서 먼저, 없으면 전체 국내 종목에서 찾아 새 종목 채팅으로
  const [stockQ, setStockQ] = useState("");
  const [hits, setHits] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    const term = stockQ.trim();
    if (!term) return setHits([]);
    const t = setTimeout(() => {
      searchAllSymbols(term)
        .then((list) => setHits(list.filter((x) => !x.exchange).slice(0, 6).map((x) => ({ code: x.code, name: x.name }))))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [stockQ]);
  const mineHits = stockQ.trim() ? stockTargets.filter((t) => t.name.includes(stockQ.trim()) || t.id.includes(stockQ.trim())) : [];
  function openStock(code: string, name: string) {
    if (!stockTargets.some((t) => t.id === code)) setExtra((e) => [...e.filter((x) => x.code !== code), { code, name }]);
    openThread(`s:${code}`);
    setStockQ("");
  }
  const update = (key: string, f: (m: Msg[]) => Msg[]) =>
    setAll((prev) => {
      const before = prev[key] ?? [];
      const next = { ...prev, [key]: f(before) };
      if (server.current) {
        // 새로 생기거나 바뀐 메시지만 서버로 (기다리는 메시지는 안 보냄)
        const old = new Map(before.map((m) => [m.id, JSON.stringify(m)]));
        for (const m of next[key]) if (m.role !== "wait" && old.get(m.id) !== JSON.stringify(m)) void saveChatMsg(key, m as unknown as StoredMsg).catch(() => {});
      } else {
        try {
          localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.filter((m) => m.role !== "wait").slice(-MAX)]))));
        } catch {
          // 저장 공간이 모자라면 기록만 안 남김
        }
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
  /** 새 대화: 이 채팅 기록을 지우고 처음 묻는 것처럼 (로그인했으면 서버 기록도, 브리핑은 다시 안 띄움) */
  async function newChat() {
    if (busy || !msgs.length) return;
    if (!window.confirm("이 채팅의 지난 대화를 지울까요? 지운 대화는 되돌릴 수 없어요.")) return;
    const key = thread;
    briefed.current.add(key);
    if (server.current) await clearChat(key).catch(() => {});
    setAll((prev) => {
      const next = { ...prev, [key]: [] };
      if (!server.current) {
        try {
          localStorage.setItem(STORE, JSON.stringify(next));
        } catch {
          // 기록 저장만 못 함
        }
      }
      return next;
    });
  }
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
      const ai = await askStrategy({ question, subject: target.name, evidence: local.evidence, currency: local.currency }).catch(() => null);
      const useAi = !!ai?.answer && ai.points.length > 0;
      // 매매 전 체크는 조건 체크리스트가 기준: AI 는 요약 한 단락만, 조건별 설명은 체크리스트를 그대로 따르는 규칙 문장으로
      //   (AI 가 미충족 조건을 "1%에 해당하는 지역에 있고"처럼 흐리게 옮겨 쓰는 일이 있어서)
      const reply: Reply = useAi ? (local.checks?.length ? { ...local, answer: ai!.answer } : { ...local, answer: ai!.answer, points: ai!.points }) : local;
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
        <button type="button" className={thread === "basic" ? "on" : ""} onClick={() => openThread("basic")}>
          <MessageSquare size={15} aria-hidden /> 기본 채팅
        </button>
        {!!traders.length && <h4>구매 전략</h4>}
        {(allTraders ? traders : top3(traders)).map((t) => (
          <button key={t.key} type="button" className={thread === t.key ? "on" : ""} onClick={() => (openThread(t.key), setAllTraders(false))}>
            <span className="dot t" aria-hidden />
            {t.name.replace(/ 전략$/, "")}
          </button>
        ))}
        {traders.length > 3 && (
          <button type="button" className="ask-side-more" onClick={() => setAllTraders((v) => !v)}>
            {allTraders ? "최근 3명만 보기" : `전체 ${traders.length}명 중 고르기`}
          </button>
        )}
        {<h4>종목 채팅</h4>}
        {top3(stockTargets).map((t) => (
          <button key={t.key} type="button" className={thread === t.key ? "on" : ""} onClick={() => openThread(t.key)}>
            <span className="dot s" aria-hidden />
            {t.name}
            {chg[t.id] !== undefined && <em className={chg[t.id] >= 0 ? "gain" : "loss"}>{`${chg[t.id] >= 0 ? "+" : ""}${chg[t.id].toFixed(2)}%`}</em>}
          </button>
        ))}
        <div className="ask-side-search">
          <input value={stockQ} onChange={(e) => setStockQ(e.target.value)} placeholder={stockTargets.length > 3 ? `종목 검색 (내 종목 ${stockTargets.length}개)` : "종목 검색"} aria-label="종목 채팅 검색" />
          {stockQ.trim() && (
            <div className="ask-side-hits" role="listbox">
              {mineHits.map((t) => (
                <button key={t.key} type="button" role="option" aria-selected={false} onClick={() => openStock(t.id, t.name)}>
                  {t.name} <small>내 종목</small>
                </button>
              ))}
              {hits
                .filter((h) => !mineHits.some((m) => m.id === h.code))
                .map((h) => (
                  <button key={h.code} type="button" role="option" aria-selected={false} onClick={() => openStock(h.code, h.name)}>
                    {h.name} <small>{h.code}</small>
                  </button>
                ))}
              {!mineHits.length && !hits.length && <p>찾는 종목이 없어요</p>}
            </div>
          )}
        </div>
        <Link className="ask-side-new" href="/archive/purchases">
          <Plus size={14} aria-hidden /> 전략 더 열기
        </Link>
      </nav>

      <div className="ask-main">
        {!!msgs.length && (
          <button type="button" className="ask-new" onClick={() => void newChat()} disabled={busy} title="이 채팅의 지난 대화를 지우고 새로 시작">
            <RotateCcw size={13} aria-hidden /> 새 대화
          </button>
        )}
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
                  <div className="ask-msg bot wait">{/중…$/.test(m.text) ? <BeeLoader size="sm" label={m.text.replace(/\s*…$/, "")} /> : m.text}</div>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={threadTarget ? `${threadTarget.name}에 대해 물어보세요` : "예: 삼성전자 지금 사도 돼?"} aria-label="질문" />
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
