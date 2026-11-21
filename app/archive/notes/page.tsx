"use client";
// 전략보관함 · 내 노트 (Figma Trackit 2182:6164 리스트형 · 종목형 · 검색 결과 없음, 1876:5541 달력형 · 마우스 올림 · 크게 보기)
//   내가 남긴 노트(트레이딩 로그 · 증시 캘린더 · 빠른 노트)를 한곳에서: 검색 · 참고 자료(종류) · 종목 · 기간으로 거르고
//   - 리스트형: 날짜별 목록. 노트를 누르면 오른쪽에 크게(차트 · 연결된 체결 · 같은 종목 노트 · 이 노트로 AI 전략 만들기)
//   - 달력형: 한 달 달력(칸 색 = 그날 청산한 거래의 실현 수익률, 칸 안 = 그날 노트) + 오른쪽에 고른 날 노트 / 크게 보기
//   - 종목형: 종목(없으면 시장 전반)끼리 묶음
//   제목 줄은 전략보관함 다른 화면(구매한 전략 · 전략 분석)과 같은 자리 · 크기(ar-title-row), 설명 줄은 다른 화면처럼 없음
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChartLine, Check, ChevronDown, ChevronLeft, ChevronRight, History, Link2, List, PenLine, Pin, Search, X } from "lucide-react";
import SiteHeader from "../../SiteHeader";
import { initRecordSource, useRecords } from "../../../lib/records";
import { getPositions, type Position } from "../../../lib/api/performance";
import { workshopLink } from "../../HomeWeeklyRecords";
import MemoChart from "./MemoChart";
import MonthSelect from "./MonthSelect";
import ReviewView from "./ReviewView";
import {
  KINDS,
  addDays,
  addMonths,
  execInfo,
  kindLabel,
  kstToday,
  longDate,
  monthGrid,
  monthLabel,
  pctText,
  realizedReturns,
  retColor,
  retGradient,
  retScale,
  retTicks,
  shortDate,
  toMemo,
  togglePin,
  usePins,
  weekdayOf,
  type Memo,
  type MemoKind,
} from "./model";
import "../../marketplace/marketplace.css";
import "../archive.css";
import "./memos.css";

type View = "list" | "calendar" | "stock" | "review";
type KindFilter = "all" | MemoKind | "pinned";
type Range = "1w" | "1m" | "3m" | "all";
type Sort = "new" | "old";

const VIEWS: { key: View; label: string; icon: typeof List }[] = [
  { key: "list", label: "리스트형", icon: List },
  { key: "calendar", label: "달력형", icon: CalendarDays },
  { key: "stock", label: "종목형", icon: ChartLine },
  { key: "review", label: "복기형", icon: History },
];
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "1w", label: "최근 1주", days: 7 },
  { key: "1m", label: "최근 1개월", days: 30 },
  { key: "3m", label: "최근 3개월", days: 90 },
  { key: "all", label: "전체 기간", days: 0 },
];
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
/** 종목형: 처음엔 이만큼 묶음만, 나머지는 '전체 노트 더 보기' */
const STOCK_GROUPS = 6;

const byNew = (a: Memo, b: Memo) => b.at.localeCompare(a.at);
const byOld = (a: Memo, b: Memo) => a.at.localeCompare(b.at);

export default function MemosPage() {
  const records = useRecords();
  const pins = usePins();
  const [today] = useState(kstToday);
  const [view, setView] = useState<View>("list");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [stock, setStock] = useState("all");
  const [range, setRange] = useState<Range>("1m");
  const [sort, setSort] = useState<Sort>("new");
  const [sel, setSel] = useState<string | null>(null);
  // 리스트형 · 종목형 오른쪽 크게 보기: 처음 열릴 때는 목록이 줄면서 밀려 들어오고, 다른 노트로 바꿀 때는 내용만 빠르게 바뀜
  const [enter, setEnter] = useState<"open" | "switch">("open");
  // 같은 노트를 한 번 더 누르면 크게 보기를 닫음 (목록이 다시 넓어짐). 크게 보기 안 '다른 노트'는 늘 다른 노트라 그대로 바뀜
  const pick = (id: string) => {
    if (id === sel) return setSel(null);
    setEnter(sel ? "switch" : "open");
    setSel(id);
  };
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [day, setDay] = useState(today);
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => void initRecordSource(), []);
  useEffect(() => {
    let live = true;
    // 그날 수익률(달력 칸 색)용 청산 포지션. 로그인 전 · 서버 오류면 색 없이
    getPositions("CLOSED")
      .then((p) => live && setPositions(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const memos = useMemo(() => records.map(toMemo), [records]);
  const returns = useMemo(() => realizedReturns(positions), [positions]);
  const stocks = useMemo(() => {
    const names = [...new Set(memos.map((m) => m.subject))];
    return names.sort((a, b) => (a === "시장 전반" ? 1 : b === "시장 전반" ? -1 : a.localeCompare(b, "ko")));
  }, [memos]);

  // 검색 · 종류 · 종목 (기간은 화면마다: 리스트 · 종목형 = 최근 n, 달력 = 그 달)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return memos.filter(
      (m) =>
        (kind === "all" || (kind === "pinned" ? pins.has(m.id) : m.kind === kind)) &&
        (stock === "all" || m.subject === stock) &&
        (!needle || `${m.subject} ${m.body} ${m.ref ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [memos, q, kind, stock, pins]);
  const from = range === "all" ? "" : addDays(today, -RANGES.find((r) => r.key === range)!.days);
  const listed = useMemo(() => filtered.filter((m) => m.date >= from).sort(sort === "new" ? byNew : byOld), [filtered, from, sort]);
  const filtering = q.trim() !== "" || kind !== "all" || stock !== "all";
  // 고른 노트가 검색 · 종류 · 종목에서 빠지면 크게 보기도 닫음 (검색 결과 없음 화면에 옛 노트가 남지 않게)
  const selected = sel ? (filtered.find((m) => m.id === sel) ?? null) : null;

  const reset = () => {
    setQ("");
    setKind("all");
    setStock("all");
    setRange("1m");
  };
  const pickMonth = (ym: string) => {
    setMonth(ym);
    const days = filtered.filter((m) => m.date.startsWith(ym)).map((m) => m.date).sort();
    setDay(today.startsWith(ym) ? today : (days.at(-1) ?? `${ym}-01`));
    setSel(null);
  };

  return (
    <main className="mk-page ar-page mm-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <div className="ar-title-row">
          <h1 className="mk-title">내 노트</h1>
          <div className="mm-views" role="tablist" aria-label="노트 보기">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                className={view === key ? "on" : ""}
                onClick={() => {
                  setView(key);
                  setSel(null);
                }}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mm-filters">
          <label className="mm-search">
            <Search size={16} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="노트 내용이나 종목명으로 검색" aria-label="노트 검색" />
            {q && (
              <button type="button" aria-label="검색어 지우기" onClick={() => setQ("")}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          <span className="mm-select">
            <select value={stock} onChange={(e) => setStock(e.target.value)} aria-label="종목">
              <option value="all">종목 전체</option>
              {stocks.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown size={12} aria-hidden="true" />
          </span>
          {view === "calendar" ? (
            <MonthSelect months={Array.from({ length: 12 }, (_, i) => addMonths(today.slice(0, 7), -i))} value={month} onChange={pickMonth} />
          ) : (
            <span className="mm-select with-icon">
              <CalendarDays size={14} aria-hidden="true" />
              <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="기간">
                {RANGES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="mm-kinds" role="radiogroup" aria-label="참고 자료">
          {[{ key: "all" as const, label: "전체" }, ...KINDS].map((k) => (
            <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}>
              {k.key !== "all" && <i className={`mm-dot k-${k.key}`} aria-hidden="true" />}
              {k.label}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={kind === "pinned"} className={kind === "pinned" ? "on" : ""} onClick={() => setKind("pinned")}>
            <Pin size={12} aria-hidden="true" /> 고정한 노트
          </button>
        </div>

        {!memos.length ? (
          <div className="mm-card mm-empty">
            <b>아직 남긴 노트가 없어요</b>
            <p>투자작업실 차트나 증시 캘린더에서 노트를 남기면 여기에 모여요.</p>
            <Link href="/workshop" className="mm-btn">
              투자작업실 열기
            </Link>
          </div>
        ) : view === "review" ? (
          <ReviewView
            records={records}
            stock={stock}
            onOpenNote={(id) => {
              // 그때 쓴 노트를 리스트형 오른쪽에 크게
              setView("list");
              setRange("all");
              setQ("");
              setKind("all");
              setSel(id);
            }}
          />
        ) : view === "calendar" ? (
          <CalendarView
            memos={filtered}
            pins={pins}
            returns={returns}
            today={today}
            month={month}
            day={day}
            sort={sort}
            sel={selected && selected.date.startsWith(month) ? selected : null}
            all={memos}
            onMonth={pickMonth}
            onDay={(d) => {
              setDay(d);
              setSel(null);
            }}
            onSelect={(m) => {
              setDay(m.date);
              setSel(m.id);
            }}
            onBack={() => setSel(null)}
            onSort={setSort}
          />
        ) : (
          <div className={`mm-split${selected ? " has-detail" : ""}`}>
            <section className="mm-card mm-list" aria-label="노트 목록">
              <header className="mm-list-head">
                <b>
                  {filtering ? "검색 결과" : "전체 노트"} {listed.length}개
                </b>
                <SortSelect sort={sort} onSort={setSort} />
              </header>
              {!listed.length ? (
                <Empty onReset={reset} />
              ) : view === "stock" ? (
                <StockGroups memos={listed} pins={pins} sel={sel} onSelect={pick} />
              ) : (
                byDay(listed).map((g) => (
                  <div key={g.date} className="mm-group">
                    <div className="mm-day mm-band">
                      {shortDate(g.date)} <small>{weekdayOf(g.date)}요일 · 노트 {g.items.length}개</small>
                    </div>
                    {g.items.map((m) => (
                      <MemoRow key={m.id} m={m} pinned={pins.has(m.id)} on={m.id === sel} onSelect={pick} />
                    ))}
                  </div>
                ))
              )}
            </section>
            {selected && <MemoDetail key={selected.id} enter={enter} m={selected} all={memos} pinned={pins.has(selected.id)} onSelect={pick} onClose={() => setSel(null)} />}
          </div>
        )}
      </div>
    </main>
  );
}

/** 날짜별 묶음 (목록 순서 그대로) */
function byDay(list: Memo[]) {
  const map = new Map<string, Memo[]>();
  for (const m of list) map.set(m.date, [...(map.get(m.date) ?? []), m]);
  return [...map].map(([date, items]) => ({ date, items }));
}

function SortSelect({ sort, onSort }: { sort: Sort; onSort: (s: Sort) => void }) {
  return (
    <span className="mm-sort">
      <select value={sort} onChange={(e) => onSort(e.target.value as Sort)} aria-label="정렬">
        <option value="new">최신순</option>
        <option value="old">과거순</option>
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </span>
  );
}

function KindBadge({ kind }: { kind: MemoKind }) {
  return <span className={`mm-badge k-${kind}`}>{kindLabel(kind)}</span>;
}

function PinButton({ id, pinned }: { id: string; pinned: boolean }) {
  return (
    <button type="button" className={`mm-pin${pinned ? " on" : ""}`} aria-pressed={pinned} aria-label={pinned ? "노트 고정 풀기" : "노트 고정"} title={pinned ? "고정 풀기" : "고정"} onClick={() => togglePin(id)}>
      <Pin size={16} aria-hidden="true" />
    </button>
  );
}

/** 목록 한 줄. 줄 전체가 '상세 보기' 버튼(뒤에 깔림)이고, 고정 압정만 따로 눌림 */
function MemoRow({ m, pinned, on, onSelect, mode = "time" }: { m: Memo; pinned: boolean; on: boolean; onSelect: (id: string) => void; mode?: "time" | "date" }) {
  const ex = execInfo(m);
  return (
    <article className={`mm-row${on ? " on" : ""}`}>
      <button type="button" className="mm-row-hit" aria-label={`${m.subject} ${mode === "date" ? shortDate(m.date) : m.time} 노트 ${on ? "크게 보기 닫기" : "크게 보기"}`} aria-current={on || undefined} onClick={() => onSelect(m.id)} />
      <div className="mm-row-top">
        <span className="mm-row-who">
          <KindBadge kind={m.kind} />
          {mode === "time" && <b>{m.subject}</b>}
          {ex && <em className="mm-linked">{ex.side} 체결 연결</em>}
        </span>
        <span className="mm-row-meta">
          <PinButton id={m.id} pinned={pinned} />
          {ex && <Link2 size={16} aria-hidden="true" className="mm-link-ic" />}
          <time>{mode === "date" ? shortDate(m.date) : m.time}</time>
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </div>
      <p className="mm-row-text">{m.body || "(내용 없음)"}</p>
      {m.ref && <p className="mm-row-ref">{m.ref}</p>}
    </article>
  );
}

function StockGroups({ memos, pins, sel, onSelect }: { memos: Memo[]; pins: ReadonlySet<string>; sel: string | null; onSelect: (id: string) => void }) {
  const [more, setMore] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<string, Memo[]>();
    for (const m of memos) map.set(m.subject, [...(map.get(m.subject) ?? []), m]);
    return [...map].map(([subject, items]) => ({ subject, items }));
  }, [memos]);
  const shown = more ? groups : groups.slice(0, STOCK_GROUPS);
  return (
    <>
      {shown.map((g) => (
        <div key={g.subject} className="mm-group">
          <div className="mm-day mm-band">
            {g.subject} <small>노트 {g.items.length}개</small>
          </div>
          {g.items.map((m) => (
            <MemoRow key={m.id} m={m} pinned={pins.has(m.id)} on={m.id === sel} onSelect={onSelect} mode="date" />
          ))}
        </div>
      ))}
      {groups.length > shown.length && (
        <button type="button" className="mm-more" onClick={() => setMore(true)}>
          전체 노트 더 보기 <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    </>
  );
}

function Empty({ onReset }: { onReset: () => void }) {
  return (
    <div className="mm-empty">
      <b>일치하는 노트가 없습니다</b>
      <p>검색어를 바꾸거나 필터를 초기화해 보세요.</p>
      <button type="button" className="mm-btn ghost" onClick={onReset}>
        필터 초기화
      </button>
    </div>
  );
}

/** 노트 크게 보기 (리스트형 · 종목형은 목록 오른쪽, 달력형은 오른쪽 1/3) */
function MemoDetail({
  m,
  all,
  pinned,
  onSelect,
  onClose,
  nav,
  enter,
}: {
  m: Memo;
  all: Memo[];
  pinned: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** 달력형: 목록으로 돌아가기 + 그날 노트 사이 이동 */
  nav?: { index: number; total: number; prev: (() => void) | null; next: (() => void) | null };
  /** 리스트형 · 종목형: 나타나는 방식 (memos.css .mm-detail.enter-open · enter-switch) */
  enter?: "open" | "switch";
}) {
  const ex = execInfo(m);
  const others = all.filter((o) => o.subject === m.subject && o.id !== m.id).sort(byNew).slice(0, 3);
  return (
    <section className={`mm-card mm-detail${nav ? " in-side" : ""}${enter ? ` enter-${enter}` : ""}`} aria-label={`${m.subject} 노트`}>
      {nav && (
        <div className="mm-detail-nav">
          <button type="button" className="mm-back" onClick={onClose}>
            <ChevronLeft size={14} aria-hidden="true" /> 목록
          </button>
          <span>
            {nav.index} / {nav.total}
          </span>
          <button type="button" className="mm-tool s" aria-label="이전 노트" disabled={!nav.prev} onClick={() => nav.prev?.()}>
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <button type="button" className="mm-tool s" aria-label="다음 노트" disabled={!nav.next} onClick={() => nav.next?.()}>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <header className="mm-detail-head">
        <div>
          <div className="mm-detail-meta">
            <KindBadge kind={m.kind} />
            <span>
              {longDate(m.date)} · {m.time} 작성
            </span>
          </div>
          <h2>
            {m.subject}
            {m.code && <small>{m.code}</small>}
          </h2>
        </div>
        <div className="mm-tools">
          <PinButton id={m.id} pinned={pinned} />
          <Link className="mm-tool" href={workshopLink(m.code, m.code ? m.subject : null, m.date)} aria-label="투자작업실에서 이어 쓰기" title="투자작업실에서 이어 쓰기">
            <PenLine size={16} aria-hidden="true" />
          </Link>
          {!nav && (
            <button type="button" className="mm-tool" aria-label="크게 보기 닫기" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {m.code && <MemoChart code={m.code} date={m.date} lines={m.rec.lines} side={ex ? ex.side : null} color={KIND_DOT[m.kind]} />}

      <p className="mm-detail-text">{m.body || "(내용 없음)"}</p>

      {ex ? (
        <div className="mm-box">
          <div className="mm-box-head">
            <b>
              <Link2 size={14} aria-hidden="true" /> 연결된 체결
            </b>
            <em>
              <Check size={12} aria-hidden="true" /> {ex.pre ? "사전 기록" : "사후 기록"}
            </em>
          </div>
          <div className="mm-flow">
            <span>
              <small>노트 작성</small> <b>{ex.memoTime}</b>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
            <span>
              <small>{ex.side} 체결</small> <b className="exec">{ex.execTime}</b>
            </span>
            <p>{ex.text}</p>
          </div>
        </div>
      ) : (
        m.ref && (
          <div className="mm-box">
            <div className="mm-box-head">
              <b>연결된 참고자료</b>
            </div>
            <p className="mm-ref-line">
              <span>{m.ref}</span>
              <small>{kindLabel(m.kind)}</small>
            </p>
          </div>
        )
      )}

      {others.length > 0 && (
        <div className="mm-others">
          <h3>{m.subject}의 다른 노트</h3>
          {others.map((o) => (
            <button key={o.id} type="button" className="mm-other" onClick={() => onSelect(o.id)}>
              <small>
                {shortDate(o.date)} {o.time}
              </small>
              <KindBadge kind={o.kind} />
              <span>{o.body}</span>
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

    </section>
  );
}

/** 종류별 점 색 (Figma 범례) — 차트에 노트 점 찍을 때 */
const KIND_DOT: Record<MemoKind, string> = { chart: "#6e56cf", market: "#66768c", news: "#1f8fd6", economy: "#c08a00", disclosure: "#8c5a2e" };

function CalendarView({
  memos,
  all,
  pins,
  returns,
  today,
  month,
  day,
  sort,
  sel,
  onMonth,
  onDay,
  onSelect,
  onBack,
  onSort,
}: {
  memos: Memo[];
  all: Memo[];
  pins: ReadonlySet<string>;
  returns: Map<string, number>;
  today: string;
  month: string;
  day: string;
  sort: Sort;
  sel: Memo | null;
  onMonth: (ym: string) => void;
  onDay: (d: string) => void;
  onSelect: (m: Memo) => void;
  onBack: () => void;
  onSort: (s: Sort) => void;
}) {
  const inMonth = memos.filter((m) => m.date.startsWith(month));
  const byDate = new Map<string, Memo[]>();
  for (const m of [...inMonth].sort(byOld)) byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]);
  const monthRet = returns.get(month);
  // 수익률 눈금: 이 달 칸에 칠하는 날(평일)의 가장 큰 |수익률| 기준 — 칸 색과 범례가 같은 눈금
  const scale = retScale([...returns].filter(([k]) => k.length === 10 && k.startsWith(month) && !["토", "일"].includes(weekdayOf(k))).map(([, v]) => v));
  const ticks = retTicks(scale);
  const dayItems = [...(byDate.get(day) ?? [])].sort(sort === "new" ? byNew : byOld);
  // 오른쪽 목록: 고른 날 다음에 그 달의 앞선 날들 (최근 날부터). 고른 날이 없으면(같은 날을 한 번 더 누름) 그 달 전체를 날짜별로
  const earlier = day ? [...byDate.keys()].filter((d) => d < day).sort().reverse() : [];
  const monthDays = [...byDate.keys()].sort();
  if (sort === "new") monthDays.reverse();
  // 날 칸 누르기: 고른 날을 한 번 더 누르면 고르기 풀림 → 달 전체 노트
  const toggleDay = (d: string) => onDay(d === day ? "" : d);
  const navList = sel ? [...(byDate.get(sel.date) ?? [])].sort(sort === "new" ? byNew : byOld) : [];
  const navAt = sel ? navList.findIndex((m) => m.id === sel.id) : -1;

  return (
    <div className="mm-cal-layout">
      <section className="mm-card mm-cal" aria-label={`${monthLabel(month)} 노트 달력`}>
        <header className="mm-cal-nav">
          <div>
            <h2>{monthLabel(month)}</h2>
            {monthRet !== undefined && (
              <span className={`mm-ret-pill ${monthRet >= 0 ? "up" : "down"}`} title="그 달 청산한 거래의 실현 수익률">
                {Number(month.slice(5))}월 <b>{pctText(monthRet)}</b>
              </span>
            )}
            <small>노트 {inMonth.length}개</small>
          </div>
          <div>
            <button type="button" className="mm-today" onClick={() => (month === today.slice(0, 7) ? onDay(today) : onMonth(today.slice(0, 7)))}>
              오늘
            </button>
            <button type="button" className="mm-tool s" aria-label="이전 달" onClick={() => onMonth(addMonths(month, -1))}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className="mm-tool s" aria-label="다음 달" disabled={month >= today.slice(0, 7)} onClick={() => onMonth(addMonths(month, 1))}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="mm-week" aria-hidden="true">
          {WEEK.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="mm-grid" role="grid">
          {monthGrid(month).map((week, wi) => (
            <div key={wi} className="mm-grid-row" role="row">
              {week.map((d, di) => {
                if (!d) return <div key={di} className="mm-cell is-blank" role="gridcell" />;
                const items = byDate.get(d) ?? [];
                const ret = returns.get(d);
                const weekend = di === 0 || di === 6;
                const isSel = d === day;
                return (
                  <div
                    key={d}
                    role="gridcell"
                    aria-selected={isSel}
                    className={`mm-cell${weekend ? " is-weekend" : ""}${isSel ? " is-sel" : ""}${d === today ? " is-today" : ""}${d > today ? " is-future" : ""}`}
                    style={ret !== undefined && !weekend ? { background: retColor(ret, scale) } : undefined}
                    onClick={() => toggleDay(d)}
                  >
                    <button
                      type="button"
                      className="mm-cell-day"
                      aria-pressed={isSel}
                      aria-label={`${longDate(d)}${items.length ? ` 노트 ${items.length}개` : ""}`}
                      title={isSel ? "한 번 더 누르면 이 달 전체 노트" : undefined}
                      onClick={(e) => (e.stopPropagation(), toggleDay(d))}
                    >
                      <b>{Number(d.slice(8))}</b>
                      {d === today && <em>오늘</em>}
                      {ret !== undefined && <span className={ret >= 0 ? "up" : "down"}>{pctText(ret)}</span>}
                    </button>
                    <div className="mm-chips">
                      {items.slice(0, 3).map((m) => (
                        <span key={m.id} className={`mm-chip-wrap${di >= 4 ? " to-left" : ""}`}>
                          <button
                            type="button"
                            className={`mm-chip k-${m.kind}${sel?.id === m.id ? " on" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(m);
                            }}
                          >
                            <i className={`mm-dot k-${m.kind}`} aria-hidden="true" />
                            {m.time} {m.subject}
                          </button>
                          <Preview m={m} />
                        </span>
                      ))}
                      {items.length > 3 && <small className="mm-chip-more">+{items.length - 3}</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <footer className="mm-legend">
          <div className="mm-legend-kinds">
            {KINDS.map((k) => (
              <span key={k.key}>
                <i className={`mm-dot k-${k.key}`} aria-hidden="true" /> {k.label}
              </span>
            ))}
          </div>
          <div className="mm-legend-ret" title={`칸 색: 그날 청산한 거래의 실현 수익률 · 눈금은 이 달 가장 큰 수익률에 맞춰 ±${scale}%`}>
            <b>수익률</b>
            <div>
              <i className="mm-grad" aria-hidden="true" style={{ background: retGradient(scale) }} />
              <span>
                {ticks.map((t) => (
                  <small key={t}>{t}</small>
                ))}
              </span>
            </div>
          </div>
        </footer>
      </section>

      {sel ? (
        <MemoDetail
          m={sel}
          all={all}
          pinned={pins.has(sel.id)}
          onSelect={(id) => {
            const m = all.find((x) => x.id === id);
            if (m) onSelect(m);
          }}
          onClose={onBack}
          nav={{
            index: navAt + 1,
            total: navList.length,
            prev: navAt > 0 ? () => onSelect(navList[navAt - 1]) : null,
            next: navAt >= 0 && navAt < navList.length - 1 ? () => onSelect(navList[navAt + 1]) : null,
          }}
        />
      ) : !day ? (
        // 고른 날 없음: 이 달 전체 노트를 날짜별로 (정렬 = 최신순이면 최근 날부터)
        <section className="mm-card mm-side" aria-label={`${monthLabel(month)} 전체 노트`}>
          <header className="mm-list-head">
            <b>
              {monthLabel(month)} 전체 <span className="mm-count">노트 {inMonth.length}</span>
            </b>
            <SortSelect sort={sort} onSort={onSort} />
          </header>
          {!monthDays.length && <p className="mm-side-none">이 달에 남긴 노트가 없어요.</p>}
          {monthDays.map((d) => (
            <SideDayGroup key={d} d={d} items={[...(byDate.get(d) ?? [])].sort(sort === "new" ? byNew : byOld)} ret={returns.get(d)} pins={pins} onSelect={onSelect} />
          ))}
        </section>
      ) : (
        <section className="mm-card mm-side" aria-label={`${longDate(day)} 노트`}>
          <header className="mm-list-head">
            <b>
              {longDate(day)} <span className="mm-count">노트 {dayItems.length}</span>
            </b>
            <SortSelect sort={sort} onSort={onSort} />
          </header>
          {dayItems.length ? (
            dayItems.map((m) => <SideRow key={m.id} m={m} pinned={pins.has(m.id)} onSelect={onSelect} />)
          ) : (
            <p className="mm-side-none">이 날 남긴 노트가 없어요.</p>
          )}
          {earlier.map((d) => (
            <SideDayGroup key={d} d={d} items={[...(byDate.get(d) ?? [])].sort(sort === "new" ? byNew : byOld)} ret={returns.get(d)} pins={pins} onSelect={onSelect} />
          ))}
        </section>
      )}
    </div>
  );
}

/** 오른쪽 목록의 하루 묶음: 날짜 · 노트 수 · 그날 수익률 + 노트들 */
function SideDayGroup({ d, items, ret, pins, onSelect }: { d: string; items: Memo[]; ret: number | undefined; pins: ReadonlySet<string>; onSelect: (m: Memo) => void }) {
  return (
    <div className="mm-group">
      <div className="mm-side-day">
        <b>
          {longDate(d)} <small>노트 {items.length}</small>
        </b>
        {ret !== undefined && <span className={ret >= 0 ? "up" : "down"}>{pctText(ret)}</span>}
      </div>
      {items.map((m) => (
        <SideRow key={m.id} m={m} pinned={pins.has(m.id)} onSelect={onSelect} />
      ))}
    </div>
  );
}

/** 달력 칩에 마우스를 올리면 보이는 미리보기 (종류별 연한 색) */
function Preview({ m }: { m: Memo }) {
  const ex = execInfo(m);
  const drawings = m.rec.drawings ?? 0;
  return (
    <span className={`mm-preview k-${m.kind}`} role="tooltip">
      <span className="mm-preview-meta">
        <span className={`mm-kind-chip k-${m.kind}`}>
          <i className={`mm-dot k-${m.kind}`} aria-hidden="true" /> {kindLabel(m.kind)}
        </span>
        {longDate(m.date)} · {m.time}
      </span>
      <b>{m.subject}</b>
      <span className="mm-preview-text">{m.body}</span>
      {(drawings > 0 || ex) && (
        <span className="mm-tags">
          {drawings > 0 && (
            <span className="mm-tag">
              <PenLine size={12} aria-hidden="true" /> 작도 {drawings}
            </span>
          )}
          {ex && (
            <span className="mm-tag">
              <Link2 size={12} aria-hidden="true" /> {ex.side} 체결 연결
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** 달력형 오른쪽 목록 한 줄 */
function SideRow({ m, pinned, onSelect }: { m: Memo; pinned: boolean; onSelect: (m: Memo) => void }) {
  const ex = execInfo(m);
  const drawings = m.rec.drawings ?? 0;
  return (
    <button type="button" className="mm-side-row" onClick={() => onSelect(m)}>
      <span className="mm-side-top">
        <span>
          <i className={`mm-dot k-${m.kind}`} aria-hidden="true" />
          <b>{m.subject}</b>
          <small>{kindLabel(m.kind)}</small>
        </span>
        <span className="mm-side-meta">
          {pinned && <Pin size={14} aria-label="고정한 노트" />}
          <time>{m.time}</time>
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </span>
      <span className="mm-side-text">{m.body}</span>
      <span className="mm-tags">
        {ex && (
          <span className="mm-tag">
            <Link2 size={12} aria-hidden="true" /> {ex.side} 체결 연결
          </span>
        )}
        {drawings > 0 && (
          <span className="mm-tag">
            <PenLine size={12} aria-hidden="true" /> 작도 {drawings}
          </span>
        )}
        {m.ref && <span className="mm-side-ref">{m.ref}</span>}
      </span>
    </button>
  );
}
