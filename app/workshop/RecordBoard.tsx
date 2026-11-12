"use client";
// 기록: 종목·기간을 골라 조회하고, 결과는 날짜별로 쌓인다. + 로 메모를 바로 남긴다
// 사전/사후/검증 대기는 메모·체결 시각으로 자동 분류
import { useState } from "react";
import type { Execution } from "../../lib/ai-link";
import type { SymbolInfo } from "../../lib/market-data";
import { addRecord, classify, dateLabel, daysAgo, groupByDate, kstNow, queryRecords, useRecords, type RecordKind, type RecordQuery, type TradeRecord } from "../../lib/records";

const KIND_LABEL: Record<RecordKind, string> = { pre: "사전 기록", post: "사후 기록", pending: "검증 대기" };
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
  const trade = r.side ? ` · ${r.side} ${(r.quantity ?? 0).toLocaleString("ko-KR")}주` : "";
  if (kind === "pending") return `메모 ${hhmm(r.noteTime)} · 연결된 체결 없음`;
  return kind === "pre" ? `메모 ${hhmm(r.noteTime)} → 체결 ${hhmm(r.executionTime ?? "")}${trade}` : `체결 ${hhmm(r.executionTime ?? "")}${trade} → 메모 ${hhmm(r.noteTime)}`;
}

export default function RecordBoard({ symbol, lastExecution }: { symbol: SymbolInfo; lastExecution: Execution | null }) {
  const records = useRecords();

  // 조회 조건 (폼) → 조회를 눌러야 결과가 바뀐다
  const [period, setPeriod] = useState<Period>("week");
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => kstNow().date);
  const [query, setQuery] = useState<RecordQuery & { label: string }>(() => ({ symbol: null, from: daysAgo(6), to: kstNow().date, label: "전체" }));

  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [link, setLink] = useState(true);

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

  function save() {
    if (!text.trim()) return;
    const now = kstNow();
    const linked = link && lastExecution ? lastExecution : null;
    addRecord({
      date: now.date,
      noteTime: now.time,
      executionTime: linked?.time ?? null,
      side: linked?.side,
      quantity: linked?.quantity,
      symbol: symbol.code,
      symbolName: symbol.name,
      text: text.trim(),
    });
    setText("");
    setComposing(false);
  }

  return (
    <section className="ws-records" aria-label="기록">
      <header className="ws-records-head">
        <h2>기록</h2>
        <button className={`ws-rec-add${composing ? " open" : ""}`} onClick={() => setComposing(!composing)} aria-expanded={composing} aria-label="기록 추가" title="기록 추가">
          +
        </button>
        <small>체결 전 메모는 사전, 체결 후 메모는 사후로 자동 분류돼요.</small>
      </header>

      <form
        className="ws-rec-query"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <span className="ws-rec-scope">전체 종목</span>
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

      {composing && (
        <div className="ws-rec-compose">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus placeholder={`${symbol.name} 매매 메모`} aria-label="새 기록 메모" />
          <div>
            {lastExecution ? (
              <label>
                <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
                체결 연결 · {hhmm(lastExecution.time)} {lastExecution.side} {lastExecution.quantity.toLocaleString("ko-KR")}주
              </label>
            ) : (
              <small>체결이 없어 검증 대기로 저장돼요. 오늘 이 종목을 체결하면 자동으로 연결돼요.</small>
            )}
            <small>저장한 기록은 고치거나 지울 수 없어요.</small>
            <button onClick={() => setComposing(false)}>취소</button>
            <button className="primary" onClick={save} disabled={!text.trim()}>
              저장
            </button>
          </div>
        </div>
      )}

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
                  <article key={r.id} className="ws-rec-card">
                    <span className={`ws-badge ${kind}`}>{KIND_LABEL[kind]}</span>
                    <p>{r.text}</p>
                    <small>{flow(r)}</small>
                    <small>
                      {r.symbolName} · {r.symbol}
                    </small>
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
