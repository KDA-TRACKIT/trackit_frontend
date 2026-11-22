"use client";
// 증시 캘린더에서 쓴 노트(뉴스 · 거시경제 · 공시 · 시장 …, 종목 없는 노트)를 Memo 칸으로 가져오기 (2026-11-22)
//   고르면 지금 Memo 끝에 덧붙음. 원래 노트는 그대로 남음
// (2026-11-22) 이 종목의 이전 노트도 같이: 고르면 그때의 드로잉 · 글을 차트와 Note 칸에 불러와 고쳐 씀 (저장하면 새 노트로 남음)
import { useEffect, useRef, useState } from "react";
import { classify, dateLabel, type TradeRecord } from "../../lib/records";

export default function CalendarMemos({
  records,
  onPick,
  disabled,
  isImported,
  busy,
  stockNotes = [],
  onPickStock,
  editingId,
}: {
  records: TradeRecord[];
  onPick: (memo: TradeRecord) => void;
  disabled?: boolean;
  /** 이미 가져온 메모 (다시 못 고름) */
  isImported?: (memo: TradeRecord) => boolean;
  busy?: boolean;
  /** 지금 종목에 쓴 이전 노트 */
  stockNotes?: TradeRecord[];
  onPickStock?: (memo: TradeRecord) => void;
  /** 지금 불러와 고치는 중인 노트 */
  editingId?: string;
}) {
  const [open, setOpen] = useState(false);
  /** 누르면 먼저 메뉴 둘(종목 노트 · 캘린더 노트), 하나를 고르면 그 목록 (2026-11-22) */
  const [tab, setTab] = useState<"stock" | "calendar" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const memos = records
    .filter((r) => classify(r) === "thought")
    .sort((a, b) => `${b.date} ${b.noteTime}`.localeCompare(`${a.date} ${a.noteTime}`))
    .slice(0, 30);
  const stock = [...stockNotes].sort((a, b) => `${b.date} ${b.noteTime}`.localeCompare(`${a.date} ${a.noteTime}`)).slice(0, 30);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="ws-cal-memos" ref={ref}>
      <button type="button" onClick={() => (setTab(null), setOpen((o) => !o))} disabled={disabled || busy} aria-expanded={open}>
        {busy ? "가져오는 중…" : "노트 가져오기"}
      </button>
      {open && (
        <div className="ws-cal-memos-list" role="listbox" aria-label="가져올 노트">
          {tab === null ? (
            <div className="ws-cal-memos-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => setTab("stock")}>
                종목 노트 <i aria-hidden>›</i>
              </button>
              <button type="button" role="menuitem" onClick={() => setTab("calendar")}>
                캘린더 노트 <i aria-hidden>›</i>
              </button>
            </div>
          ) : (
            <button type="button" className="ws-cal-memos-back" onClick={() => setTab(null)}>
              ‹ {tab === "stock" ? "종목 노트" : "캘린더 노트"}
            </button>
          )}
          {tab === null ? null : tab === "stock" ? (
            stock.length === 0 ? (
              <p>이 종목에 쓴 노트가 없어요.</p>
            ) : (
              stock.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={r.id === editingId}
                  disabled={r.id === editingId}
                  onClick={() => {
                    onPickStock?.(r);
                    setOpen(false);
                  }}
                >
                  <b>
                    {dateLabel(r.date)} {r.noteTime.slice(0, 5)}
                    {r.id === editingId ? " · 고치는 중" : ""}
                  </b>
                  <span>{r.text || "(내용 없음)"}</span>
                </button>
              ))
            )
          ) : memos.length === 0 ? (
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
