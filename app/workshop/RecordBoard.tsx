"use client";
// 기록: 종목·기간을 골라 조회하고, 결과는 날짜별로 쌓인다.
// + 로 바로 남기기: 종목을 검색해서 그 종목에 관한 메모, 또는 종목 없이 뉴스·거시경제·시장에 관한 내 생각
// 종목 메모의 사전/사후/검증 대기는 메모·체결 시각으로 자동 분류
import { useEffect, useState } from "react";
import type { Execution } from "../../lib/ai-link";
import type { SymbolInfo } from "../../lib/market-data";
import { classify, initRecordSource, dateLabel, daysAgo, groupByDate, kstNow, queryRecords, useRecords, type RecordKind, type RecordQuery, type TradeRecord, removeRecord } from "../../lib/records";

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

// 기록 추가는 오른쪽 아래 빠른 메모 원(app/QuickMemo)에서 — 여기는 조회 · 지우기만
export default function RecordBoard(_props: { symbol: SymbolInfo; lastExecution: Execution | null }) {
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


      {deleteError && <p className="ws-rec-error">{deleteError}</p>}
      <p className="ws-rec-summary">
        {query.label} · {dateLabel(query.from)} ~ {dateLabel(query.to)} · <strong>{shown.length}건</strong>
      </p>

      {groups.length === 0 ? (
        <p className="ws-rec-empty">조회한 기간에 기록이 없어요. 오른쪽 아래 캔들 버튼으로 메모하거나 AI 노트에서 “확인하고 저장”하면 여기에 날짜별로 쌓여요.</p>
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
                    {/* 계획 점검에서 관찰 메모로 저장한 것: 이행률의 '계획 있음'에 안 들어감 */}
                    {r.text.startsWith("[관찰 메모]") && <span className="ws-badge observe">관찰 메모</span>}
                    <p>{r.text.replace(/^\[관찰 메모\]\s*/, "")}</p>
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
