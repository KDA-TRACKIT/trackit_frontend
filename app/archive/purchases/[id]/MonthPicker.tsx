"use client";
// 연 달 고르기 (제목 안 "11월 ▾"): 기본 select 는 목록이 크게 · 꾸밈 없이 떠서 화면에 맞춘 작은 메뉴로
//   해가 섞여 있으면 "24년 12월"처럼 해까지
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function MonthPicker({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const years = new Set(months.map((m) => m.slice(0, 4)));
  const label = (m: string) => (years.size > 1 ? `${m.slice(2, 4)}년 ${Number(m.slice(5))}월` : `${Number(m.slice(5))}월`);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span className="ar-mp" ref={ref}>
      <button type="button" className="ar-mp-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label="달 고르기">
        {label(value)}
        <ChevronDown size={18} strokeWidth={2.4} aria-hidden />
      </button>
      {open && (
        <ul className="ar-mp-menu" role="listbox" aria-label="달">
          {months.map((m) => (
            <li key={m}>
              <button
                type="button"
                role="option"
                aria-selected={m === value}
                className={m === value ? "on" : ""}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
              >
                {label(m)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
