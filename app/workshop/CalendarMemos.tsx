"use client";
// 증시 캘린더에서 쓴 메모(뉴스 · 거시경제 · 공시 · 시장 …, 종목 없는 메모)를 종목 전략으로 가져오기
//   누르면 지금 종목의 메모로 하나 더 쌓임. 원래 메모는 그대로 남음
import { useEffect, useRef, useState } from "react";
import { classify, dateLabel, type TradeRecord } from "../../lib/records";

export default function CalendarMemos({ records, onPick, disabled, isImported }: { records: TradeRecord[]; onPick: (memo: TradeRecord) => void; disabled?: boolean; /** 이미 가져온 메모 (다시 못 고름) */ isImported?: (memo: TradeRecord) => boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const memos = records
    .filter((r) => classify(r) === "thought")
    .sort((a, b) => `${b.date} ${b.noteTime}`.localeCompare(`${a.date} ${a.noteTime}`))
    .slice(0, 30);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="ws-cal-memos" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open}>
        캘린더 노트 가져오기
      </button>
      {open && (
        <div className="ws-cal-memos-list" role="listbox" aria-label="증시 캘린더 노트">
          {memos.length === 0 ? (
            <p>증시 캘린더에서 쓴 노트가 없어요.</p>
          ) : (
            memos.map((r) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={false}
                disabled={isImported?.(r)}
                title={isImported?.(r) ? "이미 가져온 노트예요" : undefined}
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                }}
              >
                <b>
                  {dateLabel(r.date)} {r.noteTime.slice(0, 5)}
                  {r.topic ? ` · ${r.topic}` : ""}
                  {isImported?.(r) ? " · 가져옴" : ""}
                </b>
                <span>{r.text}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
