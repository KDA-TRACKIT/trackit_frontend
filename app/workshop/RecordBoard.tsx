"use client";
// 종목 전략 (2026-11-19): 가장 최근에 저장된 정리본 하나만 (AI 분석 후 저장의 '이번 저장'과 같은 글). 지난 기록은 내 노트에서
//   - 누르면 그 자리에서 고침. 확정 노트는 못 고쳐서, 고치면 지금 노트들을 합친 새 정리본으로 남김 (예전 것은 기록에 그대로)
//   - 본인이 지우지 않는 한 계속 쌓임. 이행률은 여기서 보여 주지 않음 (계산은 lib/strategy.ts)
//   - 증시 캘린더에서 쓴 메모를 가져와 이 종목 전략에 쌓을 수 있음
import { useEffect, useMemo, useState } from "react";
import type { Execution } from "../../lib/ai-link";
import type { SymbolInfo } from "../../lib/market-data";
import { addRecord, dateLabel, initRecordSource, kstNow, memoText, useRecords, type TradeRecord } from "../../lib/records";
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

  // 종목 전략 = 가장 최근에 저장된 정리본 하나 (AI 분석 후 저장의 '이번 저장'과 같은 글). 지난 기록은 내 노트에서
  const latest = notes[notes.length - 1];
  const merged = latest ? shown(latest.text) : "";
  const [mergedEdit, setMergedEdit] = useState<string | null>(null);
  /** 정리본 고치기 = 지금 보이는 노트를 다 합친 새 정리본으로 저장 (예전 것은 기록에 그대로) */
  async function saveMerged() {
    const text = mergedEdit?.trim() ?? "";
    if (busy || !text || text === merged.trim() || !latest) return setMergedEdit(null);
    setBusy(true);
    const now = kstNow();
    const res = await addRecord({ date: now.date, noteTime: now.time, executionTime: null, symbol: symbol.code, symbolName: symbol.name, text, consolidates: notes.map((r) => r.id) });
    setBusy(false);
    if (res.ok) {
      setMergedEdit(null);
      setMsg(null);
    } else setMsg(res.error ?? "고치지 못했어요.");
  }
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

  return (
    <section className="ws-records ws-strat" aria-label="종목 전략">
      <header className="ws-records-head">
        <h2>
          종목 전략 <span>{symbol.name}</span>
        </h2>
        <CalendarMemos records={all} onPick={(m) => void importMemo(m)} isImported={isImported} />
      </header>
      {msg && <p className="ws-rec-error">{msg}</p>}
      {/* 정리본 하나 (저장 확인 창과 같음). 눌러서 고치면 새 정리본으로 */}
      {notes.length > 0 && (
        <div className="ws-memo ws-strat-memo ws-strat-merged">
          <div className="ws-strat-row">
            <time>
              {dateLabel(latest.date)} {latest.noteTime.slice(0, 5)}
              <em className="ws-strat-merged-tag">정리본</em>
            </time>
            {mergedEdit !== null ? (
              <div className="ws-strat-edit">
                <textarea
                  autoFocus
                  value={mergedEdit}
                  onChange={(e) => setMergedEdit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setMergedEdit(null);
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void saveMerged();
                  }}
                  rows={Math.min(10, Math.max(3, mergedEdit.split(/\n/).length + 1))}
                  aria-label="종목 전략 정리본 고치기"
                />
                <div>
                  <button type="button" onClick={() => setMergedEdit(null)} disabled={busy}>
                    취소
                  </button>
                  <button type="button" className="primary" onClick={() => void saveMerged()} disabled={busy || !mergedEdit.trim()}>
                    {busy ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            ) : (
              <p role="button" tabIndex={0} title="눌러서 고치기 (고치면 새 정리본으로 남아요)" onClick={() => setMergedEdit(merged)} onKeyDown={(e) => e.key === "Enter" && setMergedEdit(merged)}>
                {merged || "아직 쌓인 내용이 없어요. 눌러서 적거나 차트 노트에서 저장하세요."}
              </p>
            )}
          </div>
        </div>
      )}
      {notes.length === 0 && <p className="ws-strat-empty">아직 쌓인 내용이 없어요.</p>}
    </section>
  );
}
