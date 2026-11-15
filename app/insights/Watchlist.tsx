"use client";
// 관심 종목: 종목 검색으로 추가 · 시세 (키움 ka10095, 20초마다) · 차트로 이동
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getQuotes } from "../../lib/api/insights";
import { searchSymbols, type SymbolInfo } from "../../lib/market-data";
import { CardHead, Failed, pct, tone, won } from "./parts";
import { useLoad } from "./useLoad";
import { useWatchlist } from "./useWatchlist";

const chartHref = (s: { code: string; name: string; market: string }) => `/workshop?symbol=${s.code}&name=${encodeURIComponent(s.name)}&market=${encodeURIComponent(s.market)}`;

function AddBox({ onPick, has }: { onPick: (s: SymbolInfo) => void; has: (code: string) => boolean }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SymbolInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchSymbols(query, ac.signal)
        .then((list) => {
          setFound(list.slice(0, 8));
          setHi(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const list = q.trim() ? found : [];
  const pick = (s: SymbolInfo) => {
    onPick(s);
    setQ("");
    setFound([]);
    setOpen(false);
  };
  return (
    <div className="ins-add" ref={box}>
      <input
        value={q}
        placeholder="종목 추가"
        aria-label="관심 종목 추가 — 종목명이나 코드"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!list.length) return;
          if (e.key === "ArrowDown") setHi((h) => Math.min(h + 1, list.length - 1));
          else if (e.key === "ArrowUp") setHi((h) => Math.max(h - 1, 0));
          else if (e.key === "Enter") pick(list[hi]);
          else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && list.length > 0 && (
        <ul role="listbox">
          {list.map((s, i) => (
            <li key={s.code}>
              <button type="button" role="option" aria-selected={i === hi} disabled={has(s.code)} onMouseEnter={() => setHi(i)} onClick={() => pick(s)}>
                <strong>{s.name}</strong>
                <span>{s.code}</span>
                {has(s.code) && <em>추가됨</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Watchlist() {
  const wl = useWatchlist();
  const codes = wl.items.map((i) => i.code);
  const { data, error, reload } = useLoad(`quotes-${codes.join(",")}`, () => (codes.length ? getQuotes(codes) : Promise.resolve({ quotes: [] })), 20_000);
  const byCode = new Map((data?.quotes ?? []).map((q) => [q.code, q]));

  return (
    <section className="ins-card">
      <CardHead title="관심 종목" meta={wl.ready ? `${wl.items.length}/${wl.max} · ${wl.signedIn ? "계정에 저장" : "이 브라우저에 저장"}` : undefined}>
        <AddBox has={wl.has} onPick={(s) => wl.add({ code: s.code, name: s.name, market: s.market })} />
      </CardHead>
      {wl.error && <p className="ins-missing">{wl.error}</p>}
      {!wl.ready ? null : wl.items.length === 0 ? (
        <div className="ins-state" style={{ height: 96 }}>
          <p>자주 보는 종목을 추가하면 시세와 뉴스·공시를 모아 볼 수 있어요</p>
        </div>
      ) : error && !data ? (
        <Failed message={error} onRetry={reload} height={96} />
      ) : (
        <ul className="ins-watch">
          {wl.items.map((it) => {
            const q = byCode.get(it.code);
            return (
              <li key={it.code}>
                <Link href={chartHref(it)} className="name">
                  <strong>{it.name}</strong>
                  <span>{it.code}</span>
                </Link>
                <span className="price">{q ? won(q.price) : "—"}</span>
                <span className={`chg ${q ? tone(q.changeRate) : ""}`}>
                  {q ? `${q.change > 0 ? "▲" : q.change < 0 ? "▼" : ""} ${won(Math.abs(q.change))}` : ""}
                </span>
                <span className={`rate ${q ? tone(q.changeRate) : ""}`}>{q ? pct(q.changeRate) : ""}</span>
                <span className="vol">{q ? `${won(q.volume)}주` : ""}</span>
                <button type="button" className="del" aria-label={`${it.name} 관심 종목에서 빼기`} onClick={() => wl.remove(it.code)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
