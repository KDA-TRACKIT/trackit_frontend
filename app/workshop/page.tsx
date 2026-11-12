"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { isSeconds } from "../../lib/interval";
import { PHASE_LABEL, isRegularPhase, useMarketPhase } from "../../lib/market-session";
import { clientIdOf, useChartAnnotations } from "../../hooks/useChartAnnotations";
import { useJournal } from "../../hooks/useJournal";
import { drawingToAnnotation, fromAnnotations, noteToAnnotation } from "../../lib/drawing/annotation";
import type { Drawing } from "../../lib/drawing";
import { applyTick, fetchBars, openStream, searchSymbols, type SymbolInfo, type Tick } from "../../lib/market-data";
import { DRAFT_NOTE, STOCK, makeBars, type Bar, type ChartNote, type Interval } from "../../lib/mock/workshop";
import TradePanel, { type MockOrder } from "./TradePanel";
import RecordBoard from "./RecordBoard";
import CompanyPanel from "./CompanyPanel";
import { addRecord, kstNow, linkPending } from "../../lib/records";
import { suggestLink, type Execution } from "../../lib/ai-link";
import { useAvgPrice } from "../../hooks/useAvgPrice";
import SiteHeader from "../SiteHeader";
import "./workshop.css";

// 차트는 브라우저 캔버스가 필요하므로 서버 렌더링에서 뺀다
const WorkshopChart = dynamic(() => import("./WorkshopChart"), { ssr: false, loading: () => <section className="ws-chart" /> });

const won = (value: number) => value.toLocaleString("ko-KR");

const nowKst = () => kstNow().time;

/** 화면에는 HH:MM까지만 */
const hhmm = (time: string) => time.slice(0, 5);

const DEFAULT_SYMBOL: SymbolInfo = { code: STOCK.code, name: STOCK.name, market: "KOSPI" };
const symbolLabel = (s: SymbolInfo) => `${s.code}  ${s.name}`;

export default function WorkshopPage() {
  const [interval, setChartInterval] = useState<Interval>("1d");
  const intervalRef = useRef(interval);
  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);
  const [symbol, setSymbol] = useState<SymbolInfo>(DEFAULT_SYMBOL);
  const [bars, setBars] = useState<Bar[]>([]);
  const [daily, setDaily] = useState<Bar[]>([]);
  /** live = 백엔드 시세, mock = 백엔드에 못 붙어서 예시 데이터 */
  const [source, setSource] = useState<"loading" | "live" | "mock">("loading");
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);
  /** 장 단계 (프리마켓 · 장 열림 · 애프터마켓 · 장 마감 …) */
  const phase = useMarketPhase();

  // 종목 검색
  const [query, setQuery] = useState(symbolLabel(DEFAULT_SYMBOL));
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // 봉: 종목·간격이 바뀔 때 받음 (분봉은 백엔드가 종목별로 캐싱)
  useEffect(() => {
    const ac = new AbortController();
    fetchBars(symbol.code, interval, ac.signal)
      .then(({ symbol: info, bars: data }) => {
        setBars(data);
        setSource("live");
        setSymbol((cur) => (cur.code === info.code && (cur.name !== info.name || cur.market !== info.market) ? info : cur));
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setBars(symbol.code === STOCK.code ? makeBars(interval) : []);
        setSource("mock");
      });
    return () => ac.abort();
  }, [symbol.code, interval]);

  // 종목 정보 패널은 일봉 기준
  useEffect(() => {
    const ac = new AbortController();
    fetchBars(symbol.code, "1d", ac.signal, 40)
      .then(({ bars: data }) => setDaily(data))
      .catch(() => {
        if (!ac.signal.aborted) setDaily(symbol.code === STOCK.code ? makeBars("1d") : []);
      });
    return () => ac.abort();
  }, [symbol.code]);

  // 실시간 체결: 화면에 띄운 종목만 구독. 체결이 몰리면 렌더가 밀리므로 0.25초마다 모아서 반영
  useEffect(() => {
    const queue: Tick[] = [];
    const close = openStream(symbol.code, {
      onTick: (t) => queue.push(t),
      onStatus: (st) => setMarketOpen(st.marketOpen),
    });
    const timer = setInterval(() => {
      if (queue.length === 0) return;
      const ticks = queue.splice(0);
      setBars((list) => ticks.reduce((acc, t) => applyTick(acc, t, intervalRef.current), list));
      setDaily((list) => (list.length ? ticks.reduce((acc, t) => applyTick(acc, t, "1d"), list) : list));
    }, 250);
    return () => {
      clearInterval(timer);
      close();
    };
  }, [symbol.code]);

  // 검색어 → 종목 목록 (0.2초 디바운스)
  useEffect(() => {
    if (!searchOpen) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      searchSymbols(query.trim(), ac.signal)
        .then(setResults)
        .catch(() => {
          if (!ac.signal.aborted) setResults([]);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, searchOpen]);

  /** 다시 불러오는 동안 "불러오는 중"을 보이게 상태를 먼저 바꾼다 (이벤트에서 처리) */
  function changeInterval(next: Interval) {
    if (next === interval) return;
    setSource("loading");
    setChartInterval(next);
  }

  /** 검색칸을 벗어날 때 되돌릴 지금 종목 이름 (고른 직후엔 새 종목) */
  const symbolLabelRef = useRef(symbolLabel(symbol));
  useEffect(() => {
    symbolLabelRef.current = symbolLabel(symbol);
  }, [symbol]);

  function pickSymbol(next: SymbolInfo) {
    symbolLabelRef.current = symbolLabel(next);
    setSource("loading");
    setSaveMessage(null);
    setExecutions([]);
    setLinkChoice("auto");
    setNotes([]);
    setSymbol(next);
    setQuery(symbolLabel(next));
    setSearchOpen(false);
    setBars([]);
    setDaily([]);
  }

  const [noteText, setNoteText] = useState(DRAFT_NOTE.text);
  const [noteTime, setNoteTime] = useState(DRAFT_NOTE.time);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [suggestion, setSuggestion] = useState(DRAFT_NOTE.suggestion);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sessionNotes, setNotes] = useState<ChartNote[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // 매매일지 · 차트 주석 (로그인 전이면 이 브라우저에 저장)
  const journal = useJournal(symbol, interval);
  const journalId = journal.journal?.id ?? null;
  const annotations = useChartAnnotations(journalId, journal.mode);
  const restored = useMemo(() => fromAnnotations(annotations.annotations, clientIdOf), [annotations.annotations]);
  // 저장본 노트 + 이번에 새로 단 노트
  const notes = useMemo(() => {
    const ids = new Set(restored.notes.map((n) => n.id));
    return [...restored.notes, ...sessionNotes.filter((n) => !ids.has(n.id))];
  }, [restored.notes, sessionNotes]);
  // 차트에 넣을 저장본 드로잉. key는 일지가 바뀌거나 처음 불러왔을 때만 바뀐다
  // 열 때 찾은 일지 기준. 저장하면서 일지를 새로 만들어도 지금 그린 드로잉을 덮어쓰지 않는다
  const initialId = journal.initialJournalId;
  const loadKey = journal.loading ? null : initialId ? (annotations.loaded && journalId === initialId ? `j:${initialId}` : null) : `none:${symbol.code}`;
  // 차트는 key가 바뀔 때만 이 값을 읽는다 (저장 뒤 목록이 바뀌어도 다시 넣지 않음)
  const loadedDrawings = useMemo(
    () => (loadKey ? { key: loadKey, drawings: loadKey.startsWith("none:") ? [] : restored.drawings } : undefined),
    [loadKey, restored.drawings],
  );

  /** 이 종목에서 오늘 체결된 것들 (지금은 매매하기 모의 주문) */
  const [executions, setExecutions] = useState<Execution[]>([]);
  /** AI 노트 체결 연결: auto = AI 추천 그대로, none = 연결 안 함, 그 밖엔 체결 id */
  const [linkChoice, setLinkChoice] = useState<string>("auto");
  const linkSuggestion = suggestLink(noteTime, executions);
  /** 차트의 평균 단가 선 (계좌 보유 → 없으면 모의 체결) */
  const avgPrice = useAvgPrice(symbol.code, executions);
  const linkedExecution = linkChoice === "auto" ? (linkSuggestion?.execution ?? null) : (executions.find((e) => e.id === linkChoice) ?? null);
  const [autoLinked, setAutoLinked] = useState<string | null>(null);
  /** 오른쪽 영역: 노트(기본) · 매매 */
  const [side, setSide] = useState<"notes" | "trade">("notes");
  const tradeOpen = side === "trade";
  const setTradeOpen = (open: boolean) => setSide(open ? "trade" : "notes");

  async function saveChart() {
    if (journal.loading) return;
    setSaveMessage("저장 중…");
    try {
      const target = await journal.ensure();
      const result = await annotations.sync(target.id, [...drawings.map(drawingToAnnotation), ...notes.map(noteToAnnotation)]);
      if (!result) return setSaveMessage("저장 실패");
      setSaveMessage(result.added || result.removed ? "자동 저장됨" : null);
    } catch {
      setSaveMessage("저장 실패");
    }
  }

  // 드로잉·노트를 바꾸면 잠깐 뒤 자동 저장 (저장 버튼 없음)
  const [editVersion, setEditVersion] = useState(0);
  const saveRef = useRef(saveChart);
  useEffect(() => {
    saveRef.current = saveChart;
  });
  useEffect(() => {
    if (!editVersion) return;
    const timer = setTimeout(() => void saveRef.current(), 800);
    return () => clearTimeout(timer);
  }, [editVersion]);
  /** 차트가 알려 준 드로잉. 저장본을 처음 넣은 것은 저장하지 않는다 */
  function changeDrawings(list: Drawing[]) {
    setDrawings(list);
    if (list !== loadedDrawings?.drawings) setEditVersion((v) => v + 1);
  }

  /** 새 차트 노트가 생기면 검증 창의 메모를 그 노트로 바꾼다 (AI가 불러온 메모 자리) */
  function addNote(note: { time: number; price: number; text: string }) {
    const createdAt = nowKst();
    setNotes((list) => [...list, { ...note, id: crypto.randomUUID(), createdAt }]);
    setEditVersion((v) => v + 1);
    setNoteText(note.text);
    setNoteTime(createdAt);
    setSuggestion(`${won(note.price)}원 부근 판단 근거.\n체결되면 손절 기준도 함께 남김.`);
    setEditing(false);
    setSuggestionApplied(false);
    setConfirming(false);
    setConfirmed(false);
    setLinkChoice("auto");
  }

  /** 모의 주문이 접수되면 체결로 보고 지금 노트와 연결 후보로 둔다 */
  function placeOrder(order: MockOrder) {
    const now = kstNow();
    const execution: Execution = { id: crypto.randomUUID(), time: now.time, side: order.side, quantity: order.quantity, price: order.price };
    setExecutions((list) => [...list, execution]);
    setConfirmed(false);
    // 오늘 이 종목의 검증 대기 메모(체결 전에 쓴 것)는 이 체결로 자동 연결 = 사전 기록
    const linked = linkPending(symbol.code, now.date, execution);
    setAutoLinked(linked ? `검증 대기 메모 ${linked}건을 이 체결에 연결했어요 (사전 기록).` : null);
  }

  function confirmNote() {
    // 같은 노트·체결 조합은 한 번만 (이미 있으면 그대로)
    addRecord({
      date: kstNow().date,
      noteTime,
      executionTime: linkedExecution?.time ?? null,
      side: linkedExecution?.side,
      quantity: linkedExecution?.quantity,
      symbol: symbol.code,
      symbolName: symbol.name,
      text: noteText,
    });
    setConfirming(false);
    setConfirmed(true);
    setEditing(false);
  }

  // 종목 정보는 일봉 기준
  const today: Bar | undefined = daily[daily.length - 1];
  const yesterday: Bar | undefined = daily[daily.length - 2] ?? today;
  const change = today && yesterday ? today.close - yesterday.close : 0;
  const changeRate = yesterday?.close ? (change / yesterday.close) * 100 : 0;
  const recent = daily.slice(-30);
  const avgVolume = recent.length ? recent.reduce((sum, bar) => sum + bar.volume, 0) / recent.length : 0;

  const emptyMessage =
    source === "loading"
      ? "차트를 불러오는 중…"
      : isSeconds(interval)
        ? marketOpen === false
          ? "초봉은 장 운영 시간(09:00~15:30)에 실시간 체결로만 만들어져요."
          : "실시간 체결이 들어오면 1초봉이 쌓여요."
        : "표시할 시세가 없어요.";


  return (
    <main className="workshop">
      <SiteHeader active="workshop" />

      <div className="ws-layout">
        <div className="ws-topbar">
          <div className="ws-search-wrap">
            <label className="ws-search">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                // 누르면 칸을 비우고 검색, 고르지 않고 밖을 누르면 지금 종목으로 되돌린다
                onFocus={() => {
                  setQuery("");
                  setSearchOpen(true);
                }}
                onBlur={() =>
                  setTimeout(() => {
                    setSearchOpen(false);
                    setQuery(symbolLabelRef.current);
                  }, 150)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) pickSymbol(results[0]);
                  if (e.key === "Escape") {
                    e.currentTarget.blur();
                  }
                }}
                aria-label="종목 검색"
                placeholder="종목명 또는 코드"
              />
              <Image src="/icons/search.svg" width={18} height={18} alt="" unoptimized />
            </label>
            {searchOpen && results.length > 0 && (
              <ul className="ws-search-list" role="listbox">
                {results.map((item) => (
                  <li key={item.code}>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => pickSymbol(item)} role="option" aria-selected={item.code === symbol.code}>
                      <span>{item.code}</span>
                      <strong>{item.name}</strong>
                      <small>{item.market}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span
            className={`ws-feed ${source === "mock" ? "mock" : isRegularPhase(phase) ? "open" : phase === "pre" || phase === "after" ? "extra" : "closed"}`}
            title={phase === "pre" || phase === "after" ? "넥스트레이드 거래 시간이에요. 차트·시세는 정규장(09:00~15:30) 기준이라 지금은 바뀌지 않아요." : undefined}
          >
            {source === "mock" ? "예시 데이터 · 백엔드 연결 안 됨" : source === "loading" ? "불러오는 중" : PHASE_LABEL[phase]}
          </span>
          <div className="ws-quote" aria-label="종목 시세 (일봉 기준)">
            <strong>{today ? `${won(today.close)}원` : "—"}</strong>
            <em className={change >= 0 ? "up" : "down"}>
              {change >= 0 ? "+" : ""}
              {won(change)} ({change >= 0 ? "+" : ""}
              {changeRate.toFixed(2)}%)
            </em>
            <small title="30일 평균 거래량">거래량 {today ? `${won(Math.round(today.volume / 10000))}만` : "—"} · 30일 평균 {won(Math.round(avgVolume / 10000))}만</small>
          </div>
          <div className="ws-topbar-right">
            {(saveMessage || annotations.error) && <span className="ws-save-msg">{annotations.error ?? saveMessage}</span>}
            <button className={`ws-trade${tradeOpen ? " open" : ""}`} onClick={() => setTradeOpen(!tradeOpen)} aria-expanded={tradeOpen}>
              {tradeOpen ? "매매 닫기" : "매매하기"}
            </button>
          </div>
        </div>

        <div className={`ws-grid${tradeOpen ? " trade" : ""}`}>
          <WorkshopChart
            bars={bars}
            interval={interval}
            onIntervalChange={changeInterval}
            avgPrice={avgPrice}
            notes={notes}
            onAddNote={addNote}
            onDrawingsChange={changeDrawings}
            loadedDrawings={loadedDrawings}
            dataKey={`${symbol.code}:${interval}:${source}`}
            symbolCode={symbol.code}
            symbolName={symbol.name}
            market={symbol.market}
            emptyMessage={emptyMessage}
          />

          <div className="ws-side">
            {tradeOpen && today && yesterday ? (
              <TradePanel key={symbol.code} code={symbol.code} symbolName={symbol.name} price={today.close} prevClose={yesterday.close} onOrder={placeOrder} holding={avgPrice?.quantity ?? 0} onClose={() => setTradeOpen(false)} />
            ) : (
            <>
            <section className="ws-panel ws-note-panel">
              <h2>
                AI 노트 <span className="ws-tag">저장 전 검증</span>
              </h2>
              <h3>AI가 정리한 차트 메모</h3>
              <div className="ws-memo">
                <div className="ws-memo-head">
                  <small>
                    {symbol.name} · {hhmm(noteTime)}
                    {notes.length > 0 && " · 차트 노트"}
                  </small>
                  {!confirmed &&
                    (editing ? (
                      <button
                        onClick={() => {
                          if (editText.trim()) setNoteText(editText.trim());
                          setEditing(false);
                        }}
                      >
                        완료
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditText(noteText);
                          setEditing(true);
                        }}
                      >
                        수정
                      </button>
                    ))}
                </div>
                {editing ? (
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} autoFocus aria-label="메모 수정" />
                ) : (
                  <p>{noteText}</p>
                )}
              </div>

              <div className="ws-suggest">
                <h4>AI 자동완성 제안</h4>
                <p>{suggestion}</p>
                <button
                  disabled={suggestionApplied || confirmed || editing}
                  onClick={() => {
                    setNoteText(`${noteText} ${suggestion.replace("\n", " ")}`);
                    setSuggestionApplied(true);
                  }}
                >
                  {suggestionApplied ? "적용됨" : "제안 적용"}
                </button>
              </div>

              <h3 className="ws-gap">체결 연결</h3>
              {executions.length === 0 ? (
                <small className="ws-muted">
                  아직 체결이 없어요. 저장하면 검증 대기로 남고, 오늘 이 종목을 체결하면 AI가 자동으로 연결해요.{" "}
                  <button className="ws-link" onClick={() => setTradeOpen(true)}>
                    매매하기
                  </button>
                </small>
              ) : (
                <div className="ws-link-box">
                  {linkSuggestion && (
                    <p className={`ws-link-ai ${linkSuggestion.confidence}`}>
                      <b>AI 추천</b> {hhmm(linkSuggestion.execution.time)} {linkSuggestion.execution.side} {won(linkSuggestion.execution.quantity)}주 ·{" "}
                      {linkSuggestion.kind === "pre" ? "사전" : "사후"} {linkSuggestion.confidence === "high" ? "(확실)" : "(확인 필요)"}
                      <small>{linkSuggestion.reason}</small>
                    </p>
                  )}
                  <select value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)} disabled={confirmed} aria-label="연결할 체결">
                    <option value="auto">AI 추천대로</option>
                    {executions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {hhmm(e.time)} {e.side} {won(e.quantity)}주
                      </option>
                    ))}
                    <option value="none">연결 안 함 (검증 대기)</option>
                  </select>
                </div>
              )}
              {autoLinked && <small className="ws-auto-linked">{autoLinked}</small>}

              {confirming ? (
                <div className="ws-confirm">
                  <p>
                    {linkedExecution ? "" : "연결된 체결이 없어 검증 대기로 저장돼요. "}확정하면 수정·삭제할 수 없습니다. 고칠 땐 새 버전으로 남습니다.
                  </p>
                  <div>
                    <button onClick={() => setConfirming(false)}>취소</button>
                    <button className="primary" onClick={confirmNote}>확정</button>
                  </div>
                </div>
              ) : (
                <button className="ws-save" disabled={confirmed || editing} onClick={() => setConfirming(true)}>
                  {confirmed ? "확정 완료" : "확인하고 저장"}
                </button>
              )}
            </section>

            </>
            )}

          </div>
        </div>

        {/* 매매 중에는 기록 대신 기업 정보 (호가는 오른쪽 매매 창 안) */}
        {tradeOpen ? (
          <CompanyPanel key={symbol.code} code={symbol.code} price={today?.close ?? null} />
        ) : (
          <RecordBoard symbol={symbol} lastExecution={executions[executions.length - 1] ?? null} />
        )}
      </div>
    </main>
  );
}
