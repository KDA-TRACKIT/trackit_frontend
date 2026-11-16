"use client";
// 전략 쇼핑 공통 조각: 작은 수익 곡선 · 쪽 번호 · 두 손잡이 범위 슬라이더 · 준비 중 안내
import { useEffect, useState } from "react";

/** 누적 수익 곡선 (월 수익률을 이어 붙임). 끝이 위면 초록, 아래면 빨강 */
export function Spark({ values, w = 112, h = 36 }: { values: number[]; w?: number; h?: number }) {
  const acc: number[] = [];
  values.reduce((a, v) => {
    const n = a * (1 + v / 100);
    acc.push(n);
    return n;
  }, 1);
  const min = Math.min(1, ...acc);
  const max = Math.max(1, ...acc);
  const x = (i: number) => (i / Math.max(acc.length - 1, 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const d = acc.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const up = acc[acc.length - 1] >= 1;
  return (
    <svg className={`mk-spark ${up ? "gain" : "loss"}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <line x1={0} x2={w} y1={y(1)} y2={y(1)} className="base" />
      <path d={d} />
    </svg>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return (
    <nav className="mk-pager" aria-label="쪽 이동">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="이전 쪽">
        ‹
      </button>
      {nums.map((n) => (
        <button key={n} type="button" className={n === page ? "on" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>
          {n}
        </button>
      ))}
      <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="다음 쪽">
        ›
      </button>
    </nav>
  );
}

/** 두 손잡이 범위 (아래 · 위) */
export function Range2({ min, max, step, value, onChange, format, label }: { min: number; max: number; step: number; value: [number, number]; onChange: (v: [number, number]) => void; format: (n: number) => string; label: string }) {
  const [lo, hi] = value;
  const p = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div className="mk-range">
      <span className="mk-range-label">{label}</span>
      <div className="mk-range-track" style={{ ["--lo" as string]: `${p(lo)}%`, ["--hi" as string]: `${p(hi)}%` }}>
        <input type="range" min={min} max={max} step={step} value={lo} aria-label={`${label} 최소`} onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} />
        <input type="range" min={min} max={max} step={step} value={hi} aria-label={`${label} 최대`} onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])} />
      </div>
      <b>
        {format(lo)} ~ {format(hi)}
      </b>
    </div>
  );
}

/** 결제가 아직 없어서 누르면 잠깐 뜨는 안내 */
export function useNotice() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="mk-toast" role="status">
      {msg}
    </div>
  ) : null;
  return { notify: setMsg, node };
}
