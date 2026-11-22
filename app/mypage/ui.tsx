"use client";
// 마이페이지 공통 조각: 제목, 카드, 숫자 칸, 빈 화면, 칩 선택, 모달
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BeeLoader from "../BeeLoader";

/**
 * 화면 제목 + 한 줄 설명. 상위 화면이 있으면 경로(상위 / 지금)를 제목 위에 작게 둔다 (2026-11-22: 모든 하위 화면을 "계정 설정 / 개인정보 공개 설정" 방식으로 통일).
 * 브라우저 탭 제목도 바꾼다
 */
export function PageHead({ title, desc, parent }: { title: string; desc?: string; parent?: [string, string] }) {
  useEffect(() => {
    document.title = `${title} · TRACKIT`;
  }, [title]);
  const crumbs = parent && (
    <nav className="mp-crumbs" aria-label="위치">
      <Link href={parent[1]}>{parent[0]}</Link>
      <span aria-hidden> / </span>
      <span aria-current="page">{title}</span>
    </nav>
  );
  return (
    <header className="mp-head">
      {crumbs}
      <h1>{title}</h1>
      {desc && <p>{desc}</p>}
    </header>
  );
}

export function Card({ title, desc, meta, action, children, className = "" }: { title?: string; desc?: string; meta?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`mp-card ${className}`}>
      {title && (
        <div className={`mp-card-head${desc ? " with-desc" : ""}`}>
          <div>
            <h2>
              {title}
              {meta !== undefined && <span className="mp-card-meta">{meta}</span>}
            </h2>
            {desc && <p className="mp-card-desc">{desc}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** 기간 탭: 전체 기간 · 최근 30일 · 최근 7일 · 기간 설정(달력) */
export type Period = { kind: "all" } | { kind: "days"; days: number } | { kind: "range"; from: string; to: string };
export function inPeriod(iso: string, p: Period) {
  if (p.kind === "all") return true;
  const d = iso.slice(0, 10);
  if (p.kind === "range") return d >= p.from && d <= p.to;
  return Date.parse(iso) >= Date.now() - p.days * 86_400_000;
}
export function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const tab = (label: string, p: Period, on: boolean) => (
    <button key={label} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => onChange(p)}>
      {label}
    </button>
  );
  return (
    <>
      <div className="mp-period" role="radiogroup" aria-label="기간">
        {tab("전체 기간", { kind: "all" }, value.kind === "all")}
        {tab("최근 30일", { kind: "days", days: 30 }, value.kind === "days" && value.days === 30)}
        {tab("최근 7일", { kind: "days", days: 7 }, value.kind === "days" && value.days === 7)}
        <button type="button" className={value.kind === "range" ? "on" : ""} onClick={() => setOpen(true)}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <rect x="2" y="3" width="12" height="11" rx="2" />
            <path d="M2 7h12M5.5 1.5v3M10.5 1.5v3" />
          </svg>
          {value.kind === "range" ? `${value.from.slice(2).replaceAll("-", ".")} ~ ${value.to.slice(2).replaceAll("-", ".")}` : "기간 설정"}
        </button>
      </div>
      {open && (
        <RangeModal
          initial={value.kind === "range" ? value : undefined}
          onClose={() => setOpen(false)}
          onApply={(from, to) => {
            onChange({ kind: "range", from, to });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dotted = (s: string) => s.replaceAll("-", ".");

/** 기간 설정 달력: 빠른 선택(오늘 · 1주일 · 1개월 · 3개월 · 6개월) + 시작일 · 종료일. 최대 1년, 오늘 이후는 못 고름 */
function RangeModal({ initial, onClose, onApply }: { initial?: { from: string; to: string }; onClose: () => void; onApply: (from: string, to: string) => void }) {
  const today = ymd(new Date());
  const back = (days: number, months = 0) => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    d.setDate(d.getDate() - days);
    return ymd(d);
  };
  const [from, setFrom] = useState(initial?.from ?? back(0, 1));
  const [to, setTo] = useState(initial?.to ?? today);
  const [editing, setEditing] = useState<"from" | "to">("to");
  const [view, setView] = useState(() => {
    const d = new Date(`${initial?.to ?? today}T00:00:00`);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const QUICK: [string, string][] = [
    ["오늘", today],
    ["1주일", back(7)],
    ["1개월", back(0, 1)],
    ["3개월", back(0, 3)],
    ["6개월", back(0, 6)],
  ];
  const minDay = back(0, 12);
  const first = new Date(view.y, view.m, 1);
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(view.y, view.m, i + 1)))];
  const pick = (d: string) => {
    if (editing === "from") {
      setFrom(d);
      if (d > to) setTo(d);
      setEditing("to");
    } else if (d < from) {
      setFrom(d);
    } else setTo(d);
  };
  return (
    <Modal label="기간 설정" onClose={onClose}>
      <div className="mp-range">
        <div className="mp-modal-head">
          <h2>기간 설정</h2>
          <button type="button" className="mp-x" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mp-range-quick">
          {QUICK.map(([label, d]) => (
            <button key={label} type="button" className={from === d && to === today ? "on" : ""} onClick={() => (setFrom(d), setTo(today), setView({ y: new Date().getFullYear(), m: new Date().getMonth() }))}>
              {label}
            </button>
          ))}
        </div>
        <div className="mp-range-dates">
          <label className={editing === "from" ? "on" : ""}>
            <span>시작일</span>
            <button type="button" onClick={() => setEditing("from")}>
              {dotted(from)}
            </button>
          </label>
          <i aria-hidden>~</i>
          <label className={editing === "to" ? "on" : ""}>
            <span>종료일</span>
            <button type="button" onClick={() => setEditing("to")}>
              {dotted(to)}
            </button>
          </label>
        </div>
        <div className="mp-cal">
          <div className="mp-cal-head">
            <button type="button" aria-label="이전 달" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}>
              ‹
            </button>
            <strong>
              {view.y}년 {view.m + 1}월
            </strong>
            <button type="button" aria-label="다음 달" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}>
              ›
            </button>
          </div>
          <div className="mp-cal-grid">
            {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
              <span key={w} className={`wd${i === 0 ? " sun" : ""}`}>
                {w}
              </span>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  disabled={d > today || d < minDay}
                  className={[d >= from && d <= to ? "in" : "", d === from || d === to ? "edge" : "", i % 7 === 0 ? "sun" : ""].join(" ")}
                  onClick={() => pick(d)}
                >
                  {Number(d.slice(8))}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
        </div>
        <p className="mp-range-note">최대 1년까지 조회할 수 있어요. 오늘 이후 날짜는 선택할 수 없어요.</p>
        <div className="mp-actions full">
          <button type="button" className="mp-btn soft" onClick={onClose}>
            취소
          </button>
          <button type="button" className="mp-btn primary" onClick={() => onApply(from, to)}>
            적용하기
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** 공개 · 비공개 두 칸 스위치 */
export function PublicToggle({ value, onChange, label, mixed }: { value: boolean; onChange: (v: boolean) => void; label: string; mixed?: boolean }) {
  return (
    <div className="mp-pubtog" role="radiogroup" aria-label={label}>
      <button type="button" role="radio" aria-checked={!mixed && value} className={!mixed && value ? "on" : ""} onClick={() => onChange(true)}>
        공개
      </button>
      <button type="button" role="radio" aria-checked={!mixed && !value} className={!mixed && !value ? "on" : ""} onClick={() => onChange(false)}>
        비공개
      </button>
    </div>
  );
}

/** 표를 CSV 로 내려받기 (엑셀에서 한글이 깨지지 않게 BOM) */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const text = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/** 숫자 칸. 값이 없으면 0, 단위는 숫자 뒤에 작게 */
export function Stat({ label, value = 0, unit, boxed }: { label: string; value?: number; unit?: string; boxed?: boolean }) {
  return (
    <div className={boxed ? "mp-stat boxed" : "mp-stat"}>
      <span>{label}</span>
      <strong>
        {value.toLocaleString("ko-KR")}
        {unit && <small>{unit}</small>}
      </strong>
    </div>
  );
}

/** 빈 목록: 한 줄 + (있으면) 다음 행동 버튼 */
export function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="mp-empty">
      {/* 불러오는 중이면 꿀벌 로딩 */}
      {text.includes("불러오는 중") ? <BeeLoader size="sm" /> : <p>{text}</p>}
      {children}
    </div>
  );
}

/** 한 개만 고르는 필터 칩 */
export function FilterChips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mp-chips" role="radiogroup">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? "on" : ""} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** 여러 개 고르는 칩 */
export function MultiChips({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="mp-chips multi">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Table({ cols, children }: { cols: string[]; children?: React.ReactNode }) {
  return (
    <div className="mp-table" style={{ ["--cols" as string]: cols.length }}>
      <div className="mp-tr mp-th">
        {cols.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

export function Modal({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="mp-overlay" aria-label={label} onCancel={(e) => { e.preventDefault(); onClose(); }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mp-modal">
        {children}
      </div>
    </dialog>
  );
}

/** 저장 결과 한 줄 */
export function Notice({ text }: { text: { ok: boolean; msg: string } | null }) {
  if (!text) return null;
  return <p className={text.ok ? "mp-notice ok" : "mp-notice err"}>{text.msg}</p>;
}
