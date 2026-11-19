"use client";
// 종목 전략 (2026-11-19 회의, 예전 '기록' 자리): 지금 종목에 쌓인 메모를 하나의 창에 이어서 (메모마다 칸을 나누지 않음)
//   - 줄마다 왼쪽에 날짜 · 시각, 오른쪽 내용. 내용을 누르면 그 자리에서 고침
//   - 확정 메모는 못 고쳐서, 고치면 새 메모로 남기고(replaces) 예전 메모는 기록에 그대로 둠 → 여기엔 고친 것만 보임
//   - 본인이 지우지 않는 한 계속 쌓임. 이행률은 여기서 보여 주지 않음 (계산은 lib/strategy.ts)
//   - 증시 캘린더에서 쓴 메모를 가져와 이 종목 전략에 쌓을 수 있음
import { useEffect, useMemo, useState } from "react";
import type { Execution } from "../../lib/ai-link";
import type { SymbolInfo } from "../../lib/market-data";
import { addRecord, dateLabel, initRecordSource, kstNow, memoText, removeRecord, useRecords, type TradeRecord } from "../../lib/records";
import CalendarMemos from "./CalendarMemos";
import { currentRecords, symbolRecords } from "../../lib/strategy";

const shown = memoText;

export default function RecordBoard({ symbol }: { symbol: SymbolInfo; lastExecution: Execution | null }) {
  const all = useRecords();
  useEffect(() => {
    void initRecordSource();
  }, []);
  // 이 종목 메모(고친 것만), 오래된 것부터
  const notes = useMemo(
    () => currentRecords(symbolRecords(all, symbol.code)).sort((a, b) => `${a.date} ${a.noteTime}`.localeCompare(`${b.date} ${b.noteTime}`)),
    [all, symbol.code],
  );

  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /** 캘린더 메모 → 이 종목 메모로 남길 글 (같은 메모는 같은 글이 되어 중복을 알아봄) */
  //   용어를 '메모' → '노트'로 바꿈: 새로 가져오면 '[캘린더 노트 …]', 예전에 '[캘린더 메모 …]'로 가져온 것도 이미 가져온 것으로 봄
  const importText = (m: TradeRecord, word = "노트") => `[캘린더 ${word}${m.topic ? ` · ${m.topic}` : ""} · ${m.date.slice(5).replace("-", ".")}] ${m.text}`;
  // 이 종목에 이미 가져온 캘린더 메모 (지운 건 다시 가져올 수 있음)
  const imported = useMemo(() => new Set(symbolRecords(all, symbol.code).map((r) => r.text)), [all, symbol.code]);
  const isImported = (m: TradeRecord) => imported.has(importText(m)) || imported.has(importText(m, "메모"));
  /** 캘린더 메모 → 이 종목 메모로 (원래 메모는 그대로, 이미 가져온 건 다시 안 가져옴) */
  async function importMemo(m: TradeRecord) {
    if (isImported(m)) return setMsg("이미 가져온 노트예요.");
    const now = kstNow();
    const r = await addRecord({
      date: now.date,
      noteTime: now.time,
      executionTime: null,
      symbol: symbol.code,
      symbolName: symbol.name,
      text: importText(m),
    });
    setMsg(r.ok ? null : (r.error ?? "가져오지 못했어요."));
  }

  /** 고치기 = 새 메모로 남기고 예전 메모를 가리킴 (선 · 체결 연결 · 정량 전략은 그대로 이어감) */
  async function saveEdit(r: TradeRecord) {
    const text = editing?.text.trim() ?? "";
    if (busy || !text || text === shown(r.text)) return setEditing(null);
    setBusy(true);
    const now = kstNow();
    const { id, drawings: _drawings, ...rest } = r;
    void _drawings;
    const res = await addRecord({ ...rest, date: now.date, noteTime: now.time, text, replaces: id });
    setBusy(false);
    if (res.ok) {
      setEditing(null);
      setMsg(null);
    } else setMsg(res.error ?? "고치지 못했어요.");
  }

  async function remove(id: string) {
    setBusy(true);
    const result = await removeRecord(id);
    setBusy(false);
    if (result.ok) setDeleting(null);
    else setMsg(result.error ?? "지우지 못했어요.");
  }

  return (
    <section className="ws-records ws-strat" aria-label="종목 전략">
      <header className="ws-records-head">
        <h2>
          종목 전략 <span>{symbol.name}</span>
        </h2>
        <CalendarMemos records={all} onPick={(m) => void importMemo(m)} isImported={isImported} />
      </header>
      {msg && <p className="ws-rec-error">{msg}</p>}
      <div className="ws-memo ws-strat-memo">
        {notes.length === 0 ? (
          <p className="ws-strat-empty">아직 쌓인 내용이 없어요.</p>
        ) : (
          notes.map((r) => (
            <div key={r.id} className="ws-strat-row">
              <time>
                {dateLabel(r.date)} {r.noteTime.slice(0, 5)}
                {/* 전략 노트 뒤에 관련 매매가 생겨 매매 노트가 된 것만 표시 */}
                {r.noteType === "trade" && <em className="ws-strat-trade" title="이 전략대로 매매가 있었어요 (같은 종목 · 같은 방향 · 노트 뒤 매매)">매매 노트</em>}
              </time>
              {editing?.id === r.id ? (
                <div className="ws-strat-edit">
                  <textarea
                    autoFocus
                    value={editing.text}
                    onChange={(e) => setEditing({ id: r.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditing(null);
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void saveEdit(r);
                    }}
                    rows={Math.min(8, Math.max(2, editing.text.split("\n").length))}
                    aria-label="노트 고치기"
                  />
                  <div>
                    <button type="button" onClick={() => setEditing(null)} disabled={busy}>
                      취소
                    </button>
                    <button type="button" className="primary" onClick={() => void saveEdit(r)} disabled={busy || !editing.text.trim()}>
                      {busy ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              ) : (
                <p role="button" tabIndex={0} title="눌러서 고치기 (고치면 새 노트로 남아요)" onClick={() => setEditing({ id: r.id, text: shown(r.text) })} onKeyDown={(e) => e.key === "Enter" && setEditing({ id: r.id, text: shown(r.text) })}>
                  {shown(r.text)}
                </p>
              )}
              <button type="button" className="ws-strat-del" onClick={() => setDeleting(deleting === r.id ? null : r.id)} aria-label="지우기" title="지우기">
                ✕
              </button>
              {deleting === r.id && (
                <div className="ws-rec-del-confirm">
                  <span>이 내용을 지울까요?</span>
                  <button onClick={() => setDeleting(null)} disabled={busy}>
                    닫기
                  </button>
                  <button className="danger" onClick={() => void remove(r.id)} disabled={busy}>
                    {busy ? "지우는 중…" : "지우기"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
