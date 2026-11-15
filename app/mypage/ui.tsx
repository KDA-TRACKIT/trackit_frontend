"use client";
// 마이페이지 공통 조각: 제목, 카드, 숫자 칸, 빈 화면, 칩 선택, 모달
import Link from "next/link";
import { useEffect } from "react";

/** 화면 제목. 상위 화면이 있으면 제목 위에 경로(상위 › 지금)를 작게 둔다. 브라우저 탭 제목도 바꾼다 */
export function PageHead({ title, parent }: { title: string; parent?: [string, string] }) {
  useEffect(() => {
    document.title = `${title} · TRACKIT`;
  }, [title]);
  return (
    <header className="mp-head">
      {parent && (
        <nav className="mp-crumbs" aria-label="위치">
          <Link href={parent[1]}>{parent[0]}</Link>
          <span aria-hidden> › </span>
          <span aria-current="page">{title}</span>
        </nav>
      )}
      <h1>{title}</h1>
    </header>
  );
}

export function Card({ title, meta, action, children, className = "" }: { title?: string; meta?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`mp-card ${className}`}>
      {title && (
        <div className="mp-card-head">
          <h2>
            {title}
            {meta !== undefined && <span className="mp-card-meta">{meta}</span>}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
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
      <p>{text}</p>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="mp-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mp-modal" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/** 저장 결과 한 줄 */
export function Notice({ text }: { text: { ok: boolean; msg: string } | null }) {
  if (!text) return null;
  return <p className={text.ok ? "mp-notice ok" : "mp-notice err"}>{text.msg}</p>;
}
