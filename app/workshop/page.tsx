"use client";

import { useWatchlist } from "../insights/useWatchlist";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { isDailyLike, isSeconds } from "../../lib/interval";
import { PHASE_LABEL, isRegularPhase, useMarketPhase } from "../../lib/market-session";
import { clientIdOf, useChartAnnotations } from "../../hooks/useChartAnnotations";
import { useJournal } from "../../hooks/useJournal";
import { drawingToAnnotation, fromAnnotations, noteToAnnotation } from "../../lib/drawing/annotation";
import { getTool, type Drawing } from "../../lib/drawing";
import { requestChartMemo, type ChartMemoResult } from "../../lib/api/ai";
import { errorMessage } from "../../lib/api/client";
import { applyTicks, fetchBars, isUsSymbol, openStream, searchAllSymbols, usDailyTickTime, type SymbolInfo, type Tick, type UsExchange, type UsSession } from "../../lib/market-data";
import { STOCK, makeBars, type Bar, type ChartNote, type Interval } from "../../lib/mock/workshop";
import TradePanel, { type MockOrder } from "./TradePanel";
import UsTradePanel from "./UsTradePanel";
import RecordBoard from "./RecordBoard";
import QuickMemo from "../QuickMemo";
import CompanyPanel from "./CompanyPanel";
import OrderHistory from "./OrderHistory";
import { addRecord, kstNow, linkPending, useRecords } from "../../lib/records";
import PlanConfirm, { EMPTY_PLAN, planText, type Plan } from "./PlanConfirm";
import { noteLines, type NoteLine } from "./lineLadder";
import SaveReview from "./SaveReview";
import { currentRecords, symbolRecords as recordsOfSymbol } from "../../lib/strategy";
import { autoPlan } from "./PlanCheck";
import { suggestLink, type Execution } from "../../lib/ai-link";
import { useAvgPrice } from "../../hooks/useAvgPrice";
import SiteHeader from "../SiteHeader";
import "./workshop.css";
import { uuid } from "../../lib/uuid";

// 차트는 브라우저 캔버스가 필요하므로 서버 렌더링에서 뺀다
const WorkshopChart = dynamic(() => import("./WorkshopChart"), { ssr: false, loading: () => <section className="ws-chart" /> });

const won = (value: number) => value.toLocaleString("ko-KR");
/** 가격 표시: 국내 12,300원 · 미국 $123.45 */
const moneyOf = (usd: boolean) => (value: number) =>
  usd ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${won(value)}원`;
/** 전일 대비 금액 (부호 없이) */
const diffOf = (usd: boolean) => (value: number) => (usd ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : won(value));
const US_SESSION_LABEL: Record<UsSession, string> = { pre: "프리마켓", regular: "정규장", after: "애프터마켓", overnight: "주간거래", closed: "장 마감" };
/** 미국 체결 → 일봉에 넣을 체결 (정규장 것만, 시각은 그날 일봉 자리로) */
const usDailyTicks = (ticks: Tick[]) => ticks.filter((t) => t.regular).map((t) => ({ ...t, time: usDailyTickTime(t.time) }));

const nowKst = () => kstNow().time;

/** 화면에는 HH:MM까지만 */
const hhmm = (time: string) => time.slice(0, 5);

const DEFAULT_SYMBOL: SymbolInfo = { code: STOCK.code, name: STOCK.name, market: "KOSPI" };
/** 목록에서 처음·끝을 포함해 고르게 max 개만 */
function evenly<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.round((i * (list.length - 1)) / (max - 1))]);
}

/** 저장본이 없을 때 차트에 넣는 빈 드로잉 목록 (항상 같은 배열이어야 자동 저장이 헛돌지 않음) */
const NO_DRAWINGS: Drawing[] = [];
const symbolLabel = (s: SymbolInfo) => `${s.code}  ${s.name}`;

export default function WorkshopPage() {
  const [interval, setChartInterval] = useState<Interval>("1d");
  const intervalRef = useRef(interval);
  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);
  const [symbol, setSymbol] = useState<SymbolInfo>(DEFAULT_SYMBOL);
  const us = isUsSymbol(symbol);
  const money = moneyOf(us);
  const diff = diffOf(us);
  const [bars, setBars] = useState<Bar[]>([]);
  /** 지금 종목·간격 봉을 받았는지. 받기 전 실시간 체결을 빈 차트에 붙이면 체결 몇 건짜리 봉(초봉처럼 보임)이 먼저 그려진다 */
  const barsReadyRef = useRef(false);
  const [daily, setDaily] = useState<Bar[]>([]);
  /** live = 백엔드 시세, mock = 백엔드에 못 붙어서 예시 데이터 */
  const [source, setSource] = useState<"loading" | "live" | "mock">("loading");
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);
  /** 미국 종목의 지금 거래 구간 (스트림이 알려 줌) */
  const [usSession, setUsSession] = useState<UsSession | null>(null);
  /** 장 단계 (프리마켓 · 장 열림 · 애프터마켓 · 장 마감 …) */
  const phase = useMarketPhase();

  // 종목 검색
  const [query, setQuery] = useState(symbolLabel(DEFAULT_SYMBOL));
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  // 관심 종목 (증시 캘린더 관심 종목과 같은 목록: 로그인하면 계정, 아니면 이 브라우저)
  const watch = useWatchlist();
  const typed = query.trim() !== "";
  /** 검색칸이 비었으면 관심 종목, 아니면 검색 결과 (관심 종목이 없으면 검색 결과 그대로) */
  // 검색어가 없으면 관심 종목만 (없으면 아무것도 안 보임), 입력하면 검색 결과
  const shownResults: SymbolInfo[] = !typed ? watch.items.map((w) => ({ code: w.code, name: w.name, market: w.market, exchange: w.exchange })) : results;
  const toggleWatch = (item: SymbolInfo) =>
    void (watch.has(item.code) ? watch.remove(item.code) : watch.add({ code: item.code, name: item.name, market: item.market, ...(item.exchange ? { exchange: item.exchange } : {}) }));

  // 봉: 종목·간격이 바뀔 때 받음 (분봉은 백엔드가 종목별로 캐싱)
  useEffect(() => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    barsReadyRef.current = false;
    // 초봉은 서버가 오늘 장 시작(09:00)까지 뒤에서 채우는 동안 complete=false → 몇 초마다 다시 받아 앞쪽을 늘린다
    const load = (first: boolean) =>
      fetchBars(symbol.code, interval, ac.signal, undefined, symbol.exchange)
        .then(({ symbol: info, bars: data, complete }) => {
          barsReadyRef.current = true;
          setBars(data);
          setSource("live");
          if (first) setSymbol((cur) => (cur.code === info.code && (cur.name !== info.name || cur.market !== info.market) ? { ...info, exchange: cur.exchange } : cur));
          if (!complete && !ac.signal.aborted) timer = setTimeout(() => void load(false), 4000);
        })
        .catch(() => {
          if (ac.signal.aborted || !first) return;
          barsReadyRef.current = true;
          setBars(symbol.code === STOCK.code ? makeBars(interval) : []);
          setSource("mock");
        });
    void load(true);
    return () => {
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [symbol.code, symbol.exchange, interval]);

  // 종목 정보 패널은 일봉 기준
  useEffect(() => {
    const ac = new AbortController();
    fetchBars(symbol.code, "1d", ac.signal, 40, symbol.exchange)
      .then(({ bars: data }) => setDaily(data))
      .catch(() => {
        if (!ac.signal.aborted) setDaily(symbol.code === STOCK.code ? makeBars("1d") : []);
      });
    return () => ac.abort();
  }, [symbol.code, symbol.exchange]);

  // 실시간 체결: 화면에 띄운 종목만 구독. 체결이 몰리면 렌더가 밀리므로 0.25초마다 모아서 반영
  useEffect(() => {
    const queue: Tick[] = [];
    const exchange = symbol.exchange;
    const close = openStream(
      symbol.code,
      {
        onTick: (t) => queue.push(t),
        onStatus: (st) => {
          setMarketOpen(st.marketOpen);
          if (st.session) setUsSession(st.session);
        },
      },
      exchange,
    );
    const timer = setInterval(() => {
      if (queue.length === 0) return;
      const ticks = queue.splice(0);
      // 봉을 받기 전 체결은 버린다 (받은 봉에 이미 들어 있음)
      if (!barsReadyRef.current) return;
      // 미국: 분·시간·초봉은 프리·애프터·주간거래 체결까지, 일·주·연봉은 정규장 체결만 (저장된 일봉이 정규장 기준)
      const daily = exchange ? usDailyTicks(ticks) : ticks;
      setBars((list) => applyTicks(list, exchange && isDailyLike(intervalRef.current) ? daily : ticks, intervalRef.current));
      setDaily((list) => (list.length && daily.length ? applyTicks(list, daily, "1d") : list));
    }, 250);
    return () => {
      clearInterval(timer);
      close();
    };
  }, [symbol.code, symbol.exchange]);

  // 검색어 → 종목 목록 (0.2초 디바운스)
  useEffect(() => {
    if (!searchOpen) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      searchAllSymbols(query.trim(), ac.signal)
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
    barsReadyRef.current = false;
    // 새 간격 봉이 올 때까지 이전 간격 봉을 지운다 (안 지우면 1분 버튼인데 1초봉이 그대로 보이고, 실시간 체결이 엉뚱하게 붙음)
    setBars([]);
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
    setUsSession(null);
    setSaveMessage(null);
    setAiMemoResult(null);
    setExecutions([]);
    setLinkChoice("auto");
    setNotes([]);
    setSymbol(next);
    setQuery(symbolLabel(next));
    setSearchOpen(false);
    setBars([]);
    setDaily([]);
  }

  // AI 노트는 빈 칸으로 시작 (예시 문구 없음). 시각은 메모가 생길 때 붙는다
  const [noteText, setNoteText] = useState("");
  const [noteTime, setNoteTime] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [aiMemoResult, setAiMemoResult] = useState<ChartMemoResult | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  /** 투자자가 확인 · 수정하는 계획 (진입 근거 · 매수 조건 · 손절 기준 · 목표). AI 는 채우지 않고 되묻기만 */
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  /** 확정할 때 계획으로 남길지(필수 4가지 다 있음), 관찰 메모로 남길지 */
  /** 그은 선마다 투자자가 고른 의미 */
  const [lineMeaning, setLineMeaning] = useState<Record<string, string>>({});
  /** AI 노트 선 목록에서 마우스를 올린 드로잉 (차트에서 강조) */
  const [hoverLine, setHoverLine] = useState<string | null>(null);
  /** 확정한 시각 (최초 확정본) · 그 뒤 남긴 사후 해설 */
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [afterText, setAfterText] = useState("");
  const [afterNotes, setAfterNotes] = useState<{ at: string; text: string }[]>([]);
  const [sessionNotes, setNotes] = useState<ChartNote[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  /** 저장 상태 칸에 마우스를 올리면 보이는 자세한 내용 (오류 문장 등) */
  const [saveDetail, setSaveDetail] = useState<string | null>(null);

  // 매매일지 · 차트 주석 (로그인 전이면 이 브라우저에 저장)
  const journal = useJournal(symbol, interval);
  const journalId = journal.journal?.id ?? null;
  const annotations = useChartAnnotations(journalId, journal.mode);
  const restored = useMemo(() => fromAnnotations(annotations.annotations, clientIdOf), [annotations.annotations]);
  // 저장본 노트 + 이번에 새로 단 노트
  /** 지운 차트 노트 (저장본에 있던 것도 다음 저장 때 일지에서 빠진다) */
  const [removedNoteIds, setRemovedNoteIds] = useState<ReadonlySet<string>>(new Set());
  const notes = useMemo(() => {
    const ids = new Set(restored.notes.map((n) => n.id));
    return [...restored.notes, ...sessionNotes.filter((n) => !ids.has(n.id))].filter((n) => !removedNoteIds.has(n.id));
  }, [restored.notes, sessionNotes, removedNoteIds]);
  // 차트에 넣을 저장본 드로잉. key는 일지가 바뀌거나 처음 불러왔을 때만 바뀐다
  // 열 때 찾은 일지 기준. 저장하면서 일지를 새로 만들어도 지금 그린 드로잉을 덮어쓰지 않는다
  const initialId = journal.initialJournalId;
  const loadKey = journal.loading ? null : initialId ? (annotations.loaded && journalId === initialId ? `j:${initialId}` : null) : `none:${symbol.code}`;
  // 차트는 key가 바뀔 때만 이 값을 읽는다 (저장 뒤 목록이 바뀌어도 다시 넣지 않음)
  const loadedDrawings = useMemo(
    // 일지가 없을 때도 같은 빈 배열을 쓴다. 렌더마다 새 [] 를 만들면 "드로잉이 바뀌었다"로 보여
    // 빈 목록으로 자동 저장이 돌고(빈 일지 생성, 저장본 삭제) 만다
    () => (loadKey ? { key: loadKey, drawings: loadKey.startsWith("none:") ? NO_DRAWINGS : restored.drawings } : undefined),
    [loadKey, restored.drawings],
  );

  /** 차트가 넘겨 준 선 지우기 (차트 노트 선 목록의 ✕) */
  const removeLinesRef = useRef<((ids: string[]) => void) | null>(null);
  /** 차트가 넘겨 준 그림 찍기 (저장 확인 창) */
  const snapshotRef = useRef<((marks: { price: number; text: string; color: string }[]) => Promise<string | null>) | null>(null);
  /** 저장 확인 창에 보여 줄 차트 그림 · 그은 선 (확인하고 저장을 누른 그 순간 기준) */
  const [review, setReview] = useState<{ image: string | null; shooting: boolean; lines: NoteLine[] } | null>(null);
  /** 이 종목에서 오늘 체결된 것들 (지금은 매매하기 모의 주문) */
  const [executions, setExecutions] = useState<Execution[]>([]);
  /** AI 노트 체결 연결: auto = AI 추천 그대로, none = 연결 안 함, 그 밖엔 체결 id */
  const [linkChoice, setLinkChoice] = useState<string>("auto");
  const linkSuggestion = suggestLink(noteTime || nowKst(), executions);
  /** 차트의 평균 단가 선 (계좌 보유 → 없으면 모의 체결) */
  /** 주문이 접수되면 계좌 보유(평단)를 다시 읽는다 */
  const [avgRefresh, setAvgRefresh] = useState(0);
  const avgPrice = useAvgPrice(symbol.code, executions, avgRefresh);
  const linkedExecution = linkChoice === "auto" ? (linkSuggestion?.execution ?? null) : (executions.find((e) => e.id === linkChoice) ?? null);
  // 노트 완성도 점검에 쓰는 것: 이 종목 지난 기록의 손절(보유 관리 '위험 확대') · 연결된 매매가 있는지(회고)
  const allRecords = useRecords();
  const symbolRecords = allRecords.filter((r) => r.symbol === symbol.code);
  const [autoLinked, setAutoLinked] = useState<string | null>(null);
  /** 오른쪽 영역: 노트(기본) · 매매 */
  const [side, setSide] = useState<"notes" | "trade">("notes");
  const tradeOpen = side === "trade";
  const setTradeOpen = (open: boolean) => setSide(open ? "trade" : "notes");

  async function saveChart(): Promise<boolean> {
    if (journal.loading) return false;
    setSaveMessage("저장 중…");
    setSaveDetail(null);
    try {
      const target = await journal.ensure();
      const result = await annotations.sync(target.id, [...drawings.map(drawingToAnnotation), ...notes.map(noteToAnnotation)]);
      if (!result) {
        setSaveMessage("저장 실패");
        return false;
      }
      setSaveMessage(result.added || result.removed ? "자동 저장됨" : null);
      return true;
    } catch {
      setSaveMessage("저장 실패");
      return false;
    }
  }

  // 다른 화면(홈 거래 기록 등)에서 ?symbol=005930&name=삼성전자&market=KOSPI 로 들어오면 그 종목을 연다 (처음 한 번)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("symbol")?.trim().toUpperCase();
    const exchange = q.get("exchange")?.trim().toUpperCase() as UsExchange | undefined;
    const usCode = !!exchange && ["ND", "NY", "NA"].includes(exchange) && !!code && /^[A-Z][A-Z0-9.]{0,9}$/.test(code);
    if (!code || (!usCode && !/^[0-9A-Z]{6}$/.test(code)) || code === DEFAULT_SYMBOL.code) return;
    const next: SymbolInfo = usCode
      ? { code, name: q.get("name")?.trim() || code, market: q.get("market")?.trim() || "", exchange }
      : { code, name: q.get("name")?.trim() || code, market: q.get("market")?.trim() || "KOSPI" };
    const timer = setTimeout(() => pickSymbol(next), 0);
    return () => clearTimeout(timer);
  }, []);

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

  /** 기록으로 저장: 드로잉·노트를 일지에 저장하고, AI 정리 결과를 AI 노트 메모 칸에 넣는다 (확정은 사용자가 따로) */
  const [memoBusy, setMemoBusy] = useState(false);
  async function saveToRecord() {
    if (memoBusy) return;
    setMemoBusy(true);
    setSaveMessage("저장 중…");
    try {
      // 일지·작도 저장이 성공한 경우에만 저장된 최신 내용을 AI에 보낸다.
      if (!(await saveChart())) return;
      const result = await requestChartMemo({
        symbol: { code: symbol.code, name: symbol.name },
        interval,
        price: daily[daily.length - 1]?.close ?? bars[bars.length - 1]?.close ?? 1,
        drawings: drawings.map((d) => ({
          toolId: d.toolId,
          label: getTool(d.toolId)?.label ?? d.toolId,
          // AI 정리는 드로잉당 50점까지 → 긴 붓질은 고르게 골라 보낸다 (처음·끝 포함)
          points: evenly(
            d.points.map((p) => ({ time: p.time, price: Number(p.price) })).filter((p) => p.price > 0),
            50,
          ),
          ...(d.text ? { text: d.text } : {}),
        })),
        // 투자자가 판단 근거 칸에 더 적은 내용도 같이 보내 AI 분석에 반영
        notes: [
          ...notes.map((n) => ({ time: n.time, price: n.price, text: n.text })),
          ...(noteText.trim() && bars.length
            ? [{ time: bars[bars.length - 1].time, price: daily[daily.length - 1]?.close ?? bars[bars.length - 1].close, text: `[투자자 판단 근거] ${noteText.trim()}` }]
            : []),
        ],
        mode: "ai",
        provider: "openai",
        currency: us ? "USD" : "KRW",
      });
      setAiMemoResult(result);
      // 필수 항목을 따로 채우지 않아도 되게: AI 방향 + 그은 선으로 진입 조건 · 손절 · 목표를 미리 채움
      setPlan(autoPlan(EMPTY_PLAN, drawings, bars[bars.length - 1]?.time, daily[daily.length - 1]?.close ?? bars[bars.length - 1]?.close, money, result.direction, bars));
      setLineMeaning({});
      setConfirmedAt(null);
      setAfterNotes([]);
      setSuggestion(result.suggestion ?? result.summary ?? "");
      setNoteTime(nowKst());
      setSuggestionApplied(false);
      setConfirming(false);
      setConfirmed(false);
      setLinkChoice("auto");
      setSaveMessage("자동 저장됨");
      setSaveDetail("AI가 차트 노트를 정리했어요");
    } catch (error) {
      setSaveMessage("저장 실패");
      setSaveDetail(`AI 정리 실패: ${errorMessage(error)}`);
    } finally {
      setMemoBusy(false);
    }
  }

  /** 차트 노트 지우기 → 차트 표시에서 빠지고 자동 저장으로 일지에서도 지워짐 */
  function removeNote(id: string) {
    setNotes((list) => list.filter((n) => n.id !== id));
    setRemovedNoteIds((prev) => new Set(prev).add(id));
    setEditVersion((v) => v + 1);
  }

  /** 새 차트 노트가 생기면 검증 창의 메모를 그 노트로 바꾼다 (AI가 불러온 메모 자리) */
  function addNote(note: { time: number; price: number; text: string }) {
    const createdAt = nowKst();
    setNotes((list) => [...list, { ...note, id: uuid(), createdAt }]);
    setEditVersion((v) => v + 1);
    setNoteText(note.text);
    setNoteTime(createdAt);
    setPlan(EMPTY_PLAN);
    setLineMeaning({});
    setConfirmedAt(null);
    setAfterNotes([]);
    setSuggestion(`${money(note.price)} 부근 판단 근거.\n체결되면 손절 기준도 함께 남김.`);
    setSuggestionApplied(false);
    setConfirming(false);
    setConfirmed(false);
    setLinkChoice("auto");
  }

  /** 모의 주문이 접수되면 체결로 보고 지금 노트와 연결 후보로 둔다 */
  function placeOrder(order: MockOrder) {
    const now = kstNow();
    const execution: Execution = { id: uuid(), time: now.time, side: order.side, quantity: order.quantity, price: order.price };
    setExecutions((list) => [...list, execution]);
    setConfirmed(false);
    // 증권사 체결이 잔고에 반영될 시간을 조금 두고 평단을 다시 읽는다
    setTimeout(() => setAvgRefresh((v) => v + 1), 3000);
    // 오늘 이 종목의 검증 대기 메모(체결 전에 쓴 것)는 이 체결로 자동 연결 = 사전 기록
    const linked = linkPending(symbol.code, now.date, execution);
    setAutoLinked(linked ? `검증 대기 노트 ${linked}건을 이 체결에 연결했어요 (사전 기록).` : null);
  }

  /** 확인하고 저장 → 기록 (로그인했으면 서버 확정 노트로, 지금 차트 드로잉도 같이) */
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  async function confirmNote(edits?: { pendingText: string; records: Record<string, string> }) {
    if (confirmBusy) return;
    setConfirmBusy(true);
    setConfirmError(null);
    // 같은 노트·체결 조합은 한 번만 (이미 있으면 그대로)
    const result = await addRecord({
      date: kstNow().date,
      noteTime: noteTime || nowKst(),
      executionTime: linkedExecution?.time ?? null,
      side: linkedExecution?.side,
      quantity: linkedExecution?.quantity,
      symbol: symbol.code,
      symbolName: symbol.name,
      // 메모 + 투자자가 확인한 계획 (최초 확정본). 관찰 메모는 앞에 표시 → 기록 보드 · 이행률에서 계획으로 안 침
      // 확인 창에서 고쳤으면 고친 글
      text: edits ? edits.pendingText : savedText(),
      drawings: drawings.map(drawingToAnnotation),
      // 그은 선: 알고리즘 지지 · 저항 분류 + 투자자가 고른 매매 · 미분류 선의 역할 (종목 전략에 누적, 미분류는 이행률에서 빠짐)
      lines: noteLines(drawings, bars[bars.length - 1]?.time, today?.close, lineMeaning, bars[bars.length - 1], bars),
      // 노트 종류 · 종류별 항목 (빈 값은 저장할 때 빠짐). entry 는 서버 판정에서 '진입 가격'으로 쓰던 자리라 진입 조건을 넣고, 진입 근거는 basis 로
      plan: {
        status: "plan",
        kind: plan.kind,
        direction: plan.direction,
        entry: plan.condition,
        stop: plan.stop,
        target: plan.target,
        until: plan.until,
        weight: plan.weight,
        decision: plan.decision,
        reason: plan.reason || plan.entry,
        viewDir: plan.viewDir,
        level: plan.level,
        diff: plan.diff,
        cause: plan.cause,
        next: plan.next,
      },
    });
    if (!result.ok) {
      setConfirmBusy(false);
      setConfirmError(result.error ?? "저장하지 못했어요.");
      return;
    }
    // 확인 창에서 고친 종목 전략 메모: 확정 메모는 못 고쳐서 새 메모로 남기고 예전 메모를 가리킴 (아래 종목 전략에서 고치는 것과 같음)
    const failed: string[] = [];
    for (const [id, text] of Object.entries(edits?.records ?? {})) {
      const r = allRecords.find((x) => x.id === id);
      if (!r || !text.trim()) continue;
      const now = kstNow();
      const { id: _id, drawings: _drawings, ...rest } = r;
      void _id;
      void _drawings;
      const res = await addRecord({ ...rest, date: now.date, noteTime: now.time, text: text.trim(), replaces: id });
      if (!res.ok) failed.push(res.error ?? "고친 노트를 저장하지 못했어요.");
    }
    setConfirmBusy(false);
    if (failed.length) {
      // 이번 노트는 이미 저장됨 → 창은 닫고 고친 메모만 못 남겼다고 알림
      setConfirming(false);
      setConfirmed(true);
      setConfirmedAt(nowKst());
      setConfirmError(null);
      window.alert(`노트는 저장됐지만 고친 종목 전략 ${failed.length}개를 저장하지 못했어요. 아래 종목 전략에서 다시 고쳐 주세요.`);
      return;
    }
    setConfirming(false);
    setConfirmed(true);
    setConfirmedAt(nowKst());
  }

  /** 확정할 때 종목 전략에 쌓일 글: Memo + AI 정리(눌렀으면) + 고른 매매 */
  const savedText = () => [noteText.trim(), aiMemoResult?.memo ? `[AI 정리] ${aiMemoResult.memo.trim()}` : "", planText(plan)].filter(Boolean).join("\n\n");

  /** 확인하고 저장 → 저장될 내용을 큰 창으로 (그 순간 그은 선의 지지 · 저항 + 라벨 얹은 차트 그림) */
  function openReview() {
    const last = bars[bars.length - 1];
    const lines = noteLines(drawings, last?.time, today?.close, lineMeaning, last, bars);
    const marks = lines.flatMap((l) => {
      const p = l.price ?? (l.role === "RESISTANCE" ? l.high : l.low);
      if (!p || !l.role) return [];
      const support = l.role === "SUPPORT";
      return [{ price: p, text: `${support ? "지지" : "저항"}${l.trade ? ` · ${l.trade}` : ""}`, color: support ? "#1f8a4c" : "#d64545" }];
    });
    // 창은 바로 열고, 차트 그림(드로잉이 다 들어가게 잠깐 넓혀 찍음)은 찍히는 대로 넣음
    setReview({ image: null, shooting: true, lines });
    setConfirmError(null);
    setConfirming(true);
    void (snapshotRef.current?.(marks) ?? Promise.resolve(null)).then((image) => setReview((r) => (r ? { ...r, image, shooting: false } : r)));
  }

  /** 사후 해설: 최초 확정본은 그대로 두고, 날짜 · 시각과 함께 따로 남김 */
  const [afterBusy, setAfterBusy] = useState(false);
  async function saveAfterNote() {
    const text = afterText.trim();
    if (!text || afterBusy) return;
    setAfterBusy(true);
    const at = nowKst();
    const r = await addRecord({
      date: kstNow().date,
      noteTime: at,
      executionTime: null,
      symbol: symbol.code,
      symbolName: symbol.name,
      text: `[사후 해설 · 최초 확정 ${confirmedAt ? hhmm(confirmedAt) : ""}] ${text}`,
    });
    setAfterBusy(false);
    if (!r.ok) return setConfirmError(r.error ?? "사후 해설을 저장하지 못했어요.");
    setAfterNotes((l) => [...l, { at, text }]);
    setAfterText("");
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
        ? us
          ? "미국 초봉은 지금부터 들어오는 체결로 만들어요. 체결이 들어오면 1초봉이 쌓여요."
          : marketOpen === false
          ? "초봉은 오늘 장(09:00~15:30) 체결로 만들어요. 오늘 체결이 아직 없어요."
          : "오늘 체결을 불러오는 중이에요. 체결이 들어오면 1초봉이 이어서 쌓여요."
        : "표시할 시세가 없어요.";


  return (
    <main className="workshop">
      <SiteHeader active="fortrade" />

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
                  if (e.key === "Enter" && shownResults[0]) pickSymbol(shownResults[0]);
                  if (e.key === "Escape") {
                    e.currentTarget.blur();
                  }
                }}
                aria-label="종목 검색"
                placeholder="종목명 · 코드 · 티커"
              />
              <Image src="/icons/search.svg" width={18} height={18} alt="" unoptimized />
            </label>
            {searchOpen && shownResults.length > 0 && (
              <ul className="ws-search-list" role="listbox">
                {!typed && watch.items.length > 0 && <li className="ws-search-head">관심 종목</li>}
                {shownResults.map((item) => (
                  <li key={`${item.exchange ?? "KR"}:${item.code}`} className="ws-search-item">
                    <button
                      type="button"
                      className={`ws-search-star${watch.has(item.code) ? " on" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleWatch(item)}
                      aria-label={watch.has(item.code) ? `${item.name} 관심 종목에서 빼기` : `${item.name} 관심 종목에 넣기`}
                      aria-pressed={watch.has(item.code)}
                    >
                      {watch.has(item.code) ? "★" : "☆"}
                    </button>
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
          {us ? (
            <span
              className={`ws-feed ${source === "loading" ? "closed" : usSession === "regular" ? "open" : usSession && usSession !== "closed" ? "extra" : "closed"}`}
              title="미국 정규장 09:30~16:00 (뉴욕) · 프리마켓·애프터마켓·주간거래 체결은 분봉에만 들어가요. 시각은 한국 시각"
            >
              {source === "loading" ? "불러오는 중" : `미국 ${usSession ? US_SESSION_LABEL[usSession] : "장 정보 확인 중"}`}
            </span>
          ) : (
          <span
            className={`ws-feed ${source === "mock" ? "mock" : isRegularPhase(phase) ? "open" : phase === "pre" || phase === "after" ? "extra" : "closed"}`}
            title={phase === "pre" || phase === "after" ? "넥스트레이드 거래 시간이에요. 차트·시세는 정규장(09:00~15:30) 기준이라 지금은 바뀌지 않아요." : undefined}
          >
            {source === "mock" ? "예시 데이터 · 백엔드 연결 안 됨" : source === "loading" ? "불러오는 중" : PHASE_LABEL[phase]}
          </span>
          )}
          <div className="ws-quote" aria-label="종목 시세 (일봉 기준)">
            <strong>{today ? money(today.close) : "—"}</strong>
            <em className={change >= 0 ? "up" : "down"}>
              {change >= 0 ? "+" : "-"}
              {diff(Math.abs(change))} ({change >= 0 ? "+" : ""}
              {changeRate.toFixed(2)}%)
            </em>
            <small title="30일 평균 거래량">거래량 {today ? `${won(Math.round(today.volume / 10000))}만` : "—"} · 30일 평균 {won(Math.round(avgVolume / 10000))}만</small>
          </div>
          <div className="ws-topbar-right">
            {/* 저장 메시지 자리는 늘 같은 폭 — 글이 바뀌어도 옆 가격·글자가 움직이지 않게 */}
            <span className="ws-save-msg" title={annotations.error ?? saveDetail ?? saveMessage ?? undefined} aria-live="polite">
              {/* 저장 상태만 (저장 중… · 자동 저장됨 · 저장 실패). 서버 오류 문장은 마우스를 올리면 */}
              {saveMessage ?? ""}
            </span>
            <button
              className={`ws-trade${tradeOpen ? " open" : ""}`}
              onClick={() => setTradeOpen(!tradeOpen)}
              aria-expanded={tradeOpen}
              title={us ? "미국 주식 주문 (키움 계좌 · 주간거래 · 프리 · 정규 · 애프터)" : undefined}
            >
              {tradeOpen ? "매매 닫기" : "매매하기"}
            </button>
          </div>
        </div>

        <div className={`ws-grid${tradeOpen ? " trade" : ""}`}>
          <WorkshopChart
            bars={bars}
            interval={interval}
            onIntervalChange={changeInterval}
            onSave={saveToRecord}
            saving={memoBusy}
            avgPrice={avgPrice}
            notes={notes}
            onAddNote={addNote}
            onDrawingsChange={changeDrawings}
            loadedDrawings={loadedDrawings}
            registerRemove={(fn) => (removeLinesRef.current = fn)}
            registerSnapshot={(fn) => (snapshotRef.current = fn)}
            dataKey={`${symbol.code}:${interval}:${source}`}
            symbolCode={symbol.code}
            symbolName={symbol.name}
            market={symbol.market}
            currency={us ? "USD" : "KRW"}
            emptyMessage={emptyMessage}
            highlightId={hoverLine}
            onQuoteNews={(t) => setNoteText((v) => (v.includes(t) ? v : v.trim() ? `${v.trim()}
${t}` : t))}
          />

          <div className="ws-side">
            {tradeOpen && today && yesterday && us && symbol.exchange ? (
              <UsTradePanel key={symbol.code} code={symbol.code} symbolName={symbol.name} exchange={symbol.exchange} price={today.close} prevClose={yesterday.close} onClose={() => setTradeOpen(false)} />
            ) : tradeOpen && today && yesterday && !us ? (
              <TradePanel key={symbol.code} code={symbol.code} symbolName={symbol.name} price={today.close} prevClose={yesterday.close} onOrder={placeOrder} holding={avgPrice?.quantity ?? 0} onClose={() => setTradeOpen(false)} />
            ) : (
            <>
            <section className="ws-panel ws-note-panel">
              <h2>
                차트 노트 <span className="ws-tag">저장 전 검증</span>
              </h2>
              {/* 그은 선: 알고리즘 지지 · 저항이 맨 위 (선만 그어도 판단) */}
              <PlanConfirm
                drawings={drawings}
                plan={plan}
                onPlan={setPlan}
                answers={lineMeaning}
                onAnswer={(id, m) => setLineMeaning((a) => ({ ...a, [id]: m }))}
                aiSummary={aiMemoResult?.summary}
                aiQuestions={aiMemoResult?.questions}
                money={money}
                locked={confirmed}
                current={today?.close}
                nowTime={bars[bars.length - 1]?.time}
                lastBar={bars[bars.length - 1]}
                bars={bars}
                onHover={setHoverLine}
                onDelete={(ids) => removeLinesRef.current?.(ids)}
              />

              {aiMemoResult?.aiFallback && <p className="ws-ai-fallback">{aiMemoResult.aiFallback}</p>}
              {aiMemoResult?.summary && (
                <details className="ws-ai-breakdown" aria-label="AI 차트 분석 상세">
                  <summary>AI 분석 보기</summary>
                  {aiMemoResult.memo && (
                    <div>
                      <strong>AI 정리</strong>
                      <p className="ws-ai-memo">{aiMemoResult.memo}</p>
                    </div>
                  )}
                  <div>
                    <strong>요약</strong>
                    <p>{aiMemoResult.summary}</p>
                  </div>
                  {aiMemoResult.questions?.[0] && (
                    <div>
                      <strong>AI 질문</strong>
                      <p>{aiMemoResult.questions[0]}</p>
                    </div>
                  )}
                  <div>
                    <strong>방향</strong>
                    <p>
                      {({ LONG: "상승 관점", SHORT: "하락 관점", WAIT: "관망", UNKNOWN: "판단 보류" } as Record<string, string>)[aiMemoResult.direction ?? "UNKNOWN"] ?? aiMemoResult.direction}
                      {aiMemoResult.confidence && ` · 확신 ${({ HIGH: "높음", MEDIUM: "보통", LOW: "낮음" } as const)[aiMemoResult.confidence]}`}
                    </p>
                  </div>
                  {aiMemoResult.marketStructure && (
                    <div>
                      <strong>차트 구조</strong>
                      <p>{aiMemoResult.marketStructure}</p>
                    </div>
                  )}
                  {!!aiMemoResult.confluence?.length && (
                    <div>
                      <strong>겹치는 근거</strong>
                      <p>{aiMemoResult.confluence.join(" · ")}</p>
                    </div>
                  )}
                  {(aiMemoResult.bullishScenario || aiMemoResult.bearishScenario) && (
                    <div>
                      <strong>시나리오</strong>
                      {aiMemoResult.bullishScenario && <p>▲ {aiMemoResult.bullishScenario}</p>}
                      {aiMemoResult.bearishScenario && <p>▼ {aiMemoResult.bearishScenario}</p>}
                    </div>
                  )}
                  <div>
                    <strong>사용한 작도</strong>
                    <p>{aiMemoResult.tools?.length ? aiMemoResult.tools.join(" · ") : "없음"}</p>
                  </div>
                  <div>
                    <strong>위험</strong>
                    <p>{aiMemoResult.risks?.length ? aiMemoResult.risks.join(" · ") : "특이사항 없음"}</p>
                  </div>
                  <div>
                    <strong>무효화 조건</strong>
                    <p>{Array.isArray(aiMemoResult.invalidation) ? aiMemoResult.invalidation.join(" · ") || "없음" : aiMemoResult.invalidation || "없음"}</p>
                  </div>
                  {aiMemoResult.model && <small>{aiMemoResult.provider ? `${aiMemoResult.provider} · ` : ""}{aiMemoResult.model}</small>}
                </details>
              )}

              {/* 자동완성 제안·체결 연결 칸은 뺌 (체결 연결은 확정할 때 AI 추천대로 뒤에서 처리) */}
              {notes.length > 0 && (
                <div className="ws-note-list">
                  <h4>차트 노트 {notes.length}개</h4>
                  <ul>
                    {notes.map((n) => (
                      <li key={n.id}>
                        <span title={n.text}>
                          <b>{money(n.price)}</b> {n.text}
                        </span>
                        <button onClick={() => removeNote(n.id)} aria-label={`${money(n.price)} 노트 지우기`} title="노트 지우기">
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 판단 근거: 아래로 (투자자가 더 적은 건 AI 가 분석해 반영) */}
              <div className="ws-memo">
                <div className="ws-memo-head">
                  {/* 판단 근거 칸 = Memo (적은 내용을 AI 가 같이 분석) */}
                  <strong className="ws-memo-title">Memo</strong>
                  <small>
                    {symbol.name}
                    {noteTime && ` · ${hhmm(noteTime)}`}
                  </small>
                </div>
                {/* 메모 칸을 누르면 바로 고칠 수 있다 (수정 버튼 없음). 확정 뒤엔 읽기 전용 */}
                <textarea
                  className="ws-memo-text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  readOnly={confirmed}
                  placeholder="선만 그어도 AI가 판단해요. 판단 근거를 더 적으면 AI 분석 때 같이 분석해요."
                  aria-label="차트 노트"
                />
              </div>
              {confirmed ? (
                <button className="ws-save" disabled>
                  확정 완료
                </button>
              ) : (
                // 매매 계획 필수 없음: 선을 긋거나 근거를 적으면 저장. 누르면 큰 확인 창 (저장될 차트 · 선 · 종목 전략 · AI 분석 · Memo)
                <button className="ws-save" disabled={!noteText.trim() && !drawings.length} onClick={openReview}>
                  확인하고 저장
                </button>
              )}
              {confirming && review && (
                <SaveReview
                  symbolName={symbol.name}
                  image={review.image}
                  shooting={review.shooting}
                  pending={{ date: kstNow().date, time: noteTime || nowKst(), text: savedText() }}
                  ai={aiMemoResult}
                  records={currentRecords(recordsOfSymbol(allRecords, symbol.code)).sort((a, b) => `${a.date} ${a.noteTime}`.localeCompare(`${b.date} ${b.noteTime}`))}
                  linked={!!linkedExecution}
                  busy={confirmBusy}
                  error={confirmError}
                  onCancel={() => {
                    setConfirming(false);
                    setConfirmError(null);
                  }}
                  onConfirm={(edits) => void confirmNote(edits)}
                />
              )}
              {confirmed && (
                <div className="ws-after">
                  <p className="ws-after-origin">✓ 최초 확정본{confirmedAt ? ` · ${hhmm(confirmedAt)}` : ""} — 구매자에겐 이 원본이 그대로 보여요</p>
                  {afterNotes.map((n) => (
                    <p key={n.at} className="ws-after-note">
                      <b>사후 해설 · {hhmm(n.at)}</b> {n.text}
                    </p>
                  ))}
                  <textarea value={afterText} onChange={(e) => setAfterText(e.target.value)} placeholder="결과를 보고 덧붙일 해설 (원본과 따로 날짜 · 시각과 함께 남아요)" rows={2} />
                  <button type="button" onClick={() => void saveAfterNote()} disabled={!afterText.trim() || afterBusy}>
                    {afterBusy ? "저장 중…" : "사후 해설 남기기"}
                  </button>
                </div>
              )}
            </section>

            </>
            )}

          </div>
        </div>

        {/* 매매 중에는 기록 대신 기업 정보 (호가는 오른쪽 매매 창 안) */}
        {tradeOpen ? (
          <>
            {/* 주문 내역: 오늘 주문 · 미체결 정정/취소 (기업 정보 위) */}
            <OrderHistory symbol={symbol.code} refreshKey={avgRefresh} />
            <CompanyPanel key={symbol.code} code={symbol.code} price={today?.close ?? null} />
          </>
        ) : (
          <RecordBoard symbol={symbol} lastExecution={executions[executions.length - 1] ?? null} />
        )}
      </div>
      <QuickMemo base={{ kind: "stock", code: symbol.code, name: symbol.name }} />
    </main>
  );
}
