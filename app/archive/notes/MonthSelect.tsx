"use client";
// 달력 보기의 달 고르기 (필터 줄의 "2026년 11월 ▾")
//   기본 select 는 목록이 운영체제 글꼴로 떠서 '9월' · '10월' 처럼 자릿수가 다르면 '월' 위치가 들쭉날쭉 → 작은 메뉴로 바꾸고
//   연 · 월을 칸으로 나눠 숫자 폭을 맞춤(tabular-nums), 월은 오른쪽 정렬
//   키보드: ↑ ↓ 로 옮기고 Enter 로 고름, Esc 로 닫기 (닫으면 단추로 돌아감)
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { monthLabel } from "./model";

export default function MonthSelect({ months, value, onChange }: { months: string[]; value: string; onChange: (ym: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const focusAt = (i: number) => {
    const items = list.current?.querySelectorAll<HTMLButtonElement>("[role=option]");
    if (!items?.length) return;
    items[Math.max(0, Math.min(items.length - 1, i))].focus();
  };

  useEffect(() => {
    if (!open) return;
    // 열면 지금 고른 달에 초점
    focusAt(Math.max(0, months.indexOf(value)));
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
    // 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (ym: string) => {
    onChange(ym);
    setOpen(false);
    btn.current?.focus();
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") focusAt(at + 1);
    else if (e.key === "ArrowUp") focusAt(at - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(items.length - 1);
    else if (e.key === "Escape") {
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  };

  return (
    <span className="mm-select mm-month" ref={wrap}>
      {/* 칸 전체가 단추 (달력 · 화살표 아이콘을 눌러도 열림) */}
      <button
        ref={btn}
        type="button"
        className="mm-month-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`달: ${monthLabel(value)}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CalendarDays size={14} aria-hidden="true" />
        <span>{monthLabel(value)}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <ul className="mm-month-menu" role="listbox" aria-label="달" ref={list} onKeyDown={onListKey}>
          {months.map((ym) => (
            <li key={ym}>
              <button type="button" role="option" aria-selected={ym === value} className={ym === value ? "on" : ""} onClick={() => pick(ym)}>
                <i aria-hidden="true">{ym === value && <Check size={13} strokeWidth={2.6} />}</i>
                <span className="y">{ym.slice(0, 4)}년</span>
                <span className="m">{Number(ym.slice(5, 7))}월</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
