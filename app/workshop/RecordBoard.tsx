"use client";
// 기록: 종목·기간을 골라 조회하고, 결과는 날짜별로 쌓인다.
// + 로 바로 남기기: 종목을 검색해서 그 종목에 관한 메모, 또는 종목 없이 뉴스·거시경제·시장에 관한 내 생각
// 종목 메모의 사전/사후/검증 대기는 메모·체결 시각으로 자동 분류
import { useEffect, useState } from "react";
import type { Execution } from "../../lib/ai-link";
import { searchSymbols, type SymbolInfo } from "../../lib/market-data";
import { addRecord, classify, initRecordSource, dateLabel, daysAgo, groupByDate, kstNow, queryRecords, useRecords, type RecordKind, type RecordQuery, type TradeRecord, removeRecord } from "../../lib/records";

const KIND_LABEL: Record<RecordKind, string> = { pre: "사전 기록", post: "사후 기록", pending: "검증 대기", thought: "생각" };
const hhmm = (time: string) => time.slice(0, 5);

type Period = "today" | "week" | "month" | "custom";
const PERIODS: { key: Period; label: string; days?: number }[] = [
  { key: "today", label: "오늘", days: 0 },
  { key: "week", label: "1주일", days: 6 },
  { key: "month", label: "1개월", days: 29 },
  { key: "custom", label: "직접입력" },
];

function flow(r: TradeRecord) {
  const kind = classify(r);
  if (kind === "thought") return `시장 전반 · ${hhmm(r.noteTime)}`;
  const trade = r.side ? ` · ${r.side} ${(r.quantity ?? 0).toLocaleString("ko-KR")}주` : "";
  if (kind === "pending") return `메모 ${hhmm(r.noteTime)} · 연결된 체결 없음`;
  return kind === "pre" ? `메모 ${hhmm(r.noteTime)} → 체결 ${hhmm(r.executionTime ?? "")}${trade}` : `체결 ${hhmm(r.executionTime ?? "")}${trade} → 메모 ${hhmm(r.noteTime)}`;
}

export default function RecordBoard({ symbol, lastExecution }: { symbol: SymbolInfo; lastExecution: Execution | null }) {
  const records = useRecords();
  // 로그인했으면 서버(Supabase) 기록을 읽는다
  useEffect(() => {
    void initRecordSource();
  }, []);

  // 조회 조건 (폼) → 조회를 눌러야 결과가 바뀐다
  const [period, setPeriod] = useState<Period>("week");
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => kstNow().date);
  const [query, setQuery] = useState<RecordQuery & { label: string }>(() => ({ symbol: null, from: daysAgo(6), to: kstNow().date, label: "전체" }));

  const [composing, setComposing] = useState(false);
  /** 지우기 확인 중인 기록 */
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function remove(id: string) {
    setBusy(true);
    setDeleteError(null);
    const result = await removeRecord(id);
    setBusy(false);
    if (result.ok) setDeleting(null);
    else setDeleteError(result.error ?? "기록을 지우지 못했어요.");
  }

  function pickPeriod(next: Period) {
    setPeriod(next);
    const days = PERIODS.find((p) => p.key === next)?.days;
    if (days === undefined) return; // 직접입력은 날짜 칸을 그대로
    setFrom(daysAgo(days));
    setTo(kstNow().date);
  }

  function search() {
    const [a, b] = from <= to ? [from, to] : [to, from];
    setQuery({ symbol: null, from: a, to: b, label: "전체" });
  }

  const shown = queryRecords(records, query);
  const groups = groupByDate(shown);

  return (
    <section className="ws-records" aria-label="기록">
      <header className="ws-records-head">
        <h2>기록</h2>
        <button className={`ws-rec-add${composing ? " open" : ""}`} onClick={() => setComposing(!composing)} aria-expanded={composing} aria-label="기록 추가" title="기록 추가">
          +
        </button>
        <small>종목 메모는 체결 전이면 사전, 체결 후면 사후로 자동 분류돼요. 뉴스·거시경제 같은 생각도 남길 수 있어요.</small>
      </header>

      <form
        className="ws-rec-query"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <span className="ws-rec-scope">전체</span>
        <div className="ws-seg-group" role="group" aria-label="기간">
          {PERIODS.map((p) => (
            <button type="button" key={p.key} className={period === p.key ? "active" : ""} onClick={() => pickPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="ws-rec-dates">
          <input type="date" value={from} max={to} disabled={period !== "custom"} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" />
          <span>~</span>
          <input type="date" value={to} min={from} disabled={period !== "custom"} onChange={(e) => setTo(e.target.value)} aria-label="종료일" />
        </div>
        <button type="submit" className="ws-rec-search">
          조회
        </button>
      </form>

      {composing && <Composer current={symbol} lastExecution={lastExecution} onDone={() => setComposing(false)} />}

      {deleteError && <p className="ws-rec-error">{deleteError}</p>}
      <p className="ws-rec-summary">
        {query.label} · {dateLabel(query.from)} ~ {dateLabel(query.to)} · <strong>{shown.length}건</strong>
      </p>

      {groups.length === 0 ? (
        <p className="ws-rec-empty">조회한 기간에 기록이 없어요. + 를 누르거나 AI 노트에서 “확인하고 저장”하면 여기에 날짜별로 쌓여요.</p>
      ) : (
        groups.map((g) => (
          <div key={g.date} className="ws-rec-day">
            <h3>
              {dateLabel(g.date)} <span>{g.items.length}건</span>
            </h3>
            <div className="ws-rec-grid">
              {g.items.map((r) => {
                const kind = classify(r);
                return (
                  <article key={r.id} className={`ws-rec-card${kind === "thought" ? " thought" : ""}`}>
                    <button className="ws-rec-del" onClick={() => setDeleting(r.id)} aria-label="기록 지우기" title="기록 지우기">
                      ✕
                    </button>
                    <span className={`ws-badge ${kind}`}>{kind === "thought" ? "시장 전반" : KIND_LABEL[kind]}</span>
                    <p>{r.text}</p>
                    <small>{flow(r)}</small>
                    {r.symbol && (
                      <small>
                        {r.symbolName} · {r.symbol}
                      </small>
                    )}
                    {deleting === r.id && (
                      <div className="ws-rec-del-confirm">
                        <span>이 기록을 지울까요?</span>
                        <button onClick={() => setDeleting(null)} disabled={busy}>
                          닫기
                        </button>
                        <button className="danger" onClick={() => void remove(r.id)} disabled={busy}>
                          {busy ? "지우는 중…" : "지우기"}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

/** + 입력창: 무엇에 관한 기록인지(종목 / 시장 전반) 고르고 쓴다 */
function Composer({ current, lastExecution, onDone }: { current: SymbolInfo; lastExecution: Execution | null; onDone: () => void }) {
  const [about, setAbout] = useState<"stock" | "market">("stock");
  const [picked, setPicked] = useState<SymbolInfo>(current);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [link, setLink] = useState(true);

  // 종목 검색 (0.2초 디바운스)
  useEffect(() => {
    if (!open || !q.trim()) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      searchSymbols(q.trim(), ac.signal)
        .then(setResults)
        .catch(() => {
          if (!ac.signal.aborted) setResults([]);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q, open]);

  // 체결 연결은 지금 차트에 띄운 종목의 체결만 (다른 종목은 오늘 체결되면 자동 연결)
  const canLink = about === "stock" && !!lastExecution && picked.code === current.code;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!text.trim() || saving) return;
    const now = kstNow();
    setSaving(true);
    setError(null);
    let result: { ok: boolean; error?: string };
    if (about === "market") {
      result = await addRecord({ date: now.date, noteTime: now.time, executionTime: null, symbol: null, symbolName: null, topic: "시장 전반", text: text.trim() });
    } else {
      const linked = canLink && link ? lastExecution : null;
      result = await addRecord({
        date: now.date,
        noteTime: now.time,
        executionTime: linked?.time ?? null,
        side: linked?.side,
        quantity: linked?.quantity,
        symbol: picked.code,
        symbolName: picked.name,
        text: text.trim(),
      });
    }
    setSaving(false);
    if (!result.ok) return setError(result.error ?? "기록을 저장하지 못했어요.");
    onDone();
  }

  return (
    <div className="ws-rec-compose">
      <div className="ws-rec-about">
        <div className="ws-rec-kind" role="group" aria-label="무엇에 관한 기록">
          <button type="button" className={about === "stock" ? "active" : ""} onClick={() => setAbout("stock")}>
            종목
          </button>
          <button type="button" className={about === "market" ? "active" : ""} onClick={() => setAbout("market")}>
            시장 전반
          </button>
        </div>

        {about === "stock" ? (
          <div className="ws-rec-symbol">
            <input
              value={open ? q : `${picked.name} · ${picked.code}`}
              onFocus={() => {
                setQ("");
                setResults([]);
                setOpen(true);
              }}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  setPicked(results[0]);
                  setOpen(false);
                }
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="종목명 또는 코드 검색"
              aria-label="종목 검색"
            />
            {open && results.length > 0 && (
              <ul className="ws-search-list" role="listbox">
                {results.map((s) => (
                  <li key={s.code}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPicked(s);
                        setOpen(false);
                      }}
                      role="option"
                      aria-selected={s.code === picked.code}
                    >
                      <span>{s.code}</span>
                      <strong>{s.name}</strong>
                      <small>{s.market}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          // 종목 칸과 같은 자리·크기로 두어 둘을 바꿔도 상자가 움직이지 않게
          <div className="ws-rec-symbol ws-rec-market-slot">종목 없이 시장 전반에 대한 기록</div>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        placeholder={about === "stock" ? `${picked.name}에 관한 매매 메모` : "뉴스·거시경제·업종 흐름 등 시장 전반에 대한 내 생각 (예: 금리 인하 기대로 성장주 강세 예상)"}
        aria-label="새 기록 메모"
      />
      <div>
        {about === "market" ? (
          <small>종목과 상관없는 생각으로 저장돼요.</small>
        ) : canLink && lastExecution ? (
          <label>
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
            체결 연결 · {hhmm(lastExecution.time)} {lastExecution.side} {lastExecution.quantity.toLocaleString("ko-KR")}주
          </label>
        ) : (
          <span />
        )}
        {error && <small className="ws-rec-error">{error}</small>}
        <button onClick={onDone}>취소</button>
        <button className="primary" onClick={() => void save()} disabled={!text.trim() || saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
