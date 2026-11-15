"use client";
// 관심 종목: 국내 · 미국 전 종목 검색으로 추가 (한글 · 영문 이름 · 코드/티커) · 시세 20초마다 · 국내는 작업실 차트로
//   국내 키움 ka10095 / 미국 키움 usa20100 (나스닥 토탈뷰 실시간) — 백엔드가 캐시
//   미국 종목은 티커를 크게, 한글 이름을 작게
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getQuotes, searchAllSymbols, type Quote, type SymbolHit } from "../../lib/api/insights";
import { CardHead, Failed, pct, price, tone, won } from "./parts";
import { useLoad } from "./useLoad";
import type { UsChartTarget } from "./UsChart";
import { quoteKey, useWatchlist, type WatchItem } from "./useWatchlist";

const chartHref = (s: WatchItem) => `/workshop?symbol=${s.code}&name=${encodeURIComponent(s.name)}&market=${encodeURIComponent(s.market)}`;
/** 미국 전일 대비: 소수 둘째 자리까지 */
const change = (q: Quote) => (q.currency === "USD" ? Math.abs(q.change).toFixed(2) : won(Math.abs(q.change)));

function AddBox({ onPick, has }: { onPick: (s: SymbolHit) => void; has: (code: string) => boolean }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SymbolHit[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchAllSymbols(query, ac.signal)
        .then((list) => {
          setFound(list);
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
  const pick = (s: SymbolHit) => {
    if (has(s.code)) return;
    onPick(s);
    setQ("");
    setFound([]);
    setOpen(false);
  };
  return (
    <div className="ins-add" ref={box}>
      <input
        value={q}
        placeholder="종목 추가 (국내 · 미국)"
        aria-label="관심 종목 추가 — 종목명(한글·영문)이나 코드·티커"
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
            <li key={`${s.country}:${s.code}`}>
              <button type="button" role="option" aria-selected={i === hi} disabled={has(s.code)} onMouseEnter={() => setHi(i)} onClick={() => pick(s)}>
                {s.country === "US" ? (
                  <>
                    <strong className="ticker">{s.code}</strong>
                    <span className="nm">{s.name}</span>
                  </>
                ) : (
                  <>
                    <strong>{s.name}</strong>
                    <span>{s.code}</span>
                  </>
                )}
                <em className={`mk ${s.country === "US" ? "us" : ""}`}>{has(s.code) ? "추가됨" : s.etf ? `${s.country === "US" ? "미국 " : ""}ETF` : s.country === "US" ? "미국" : s.market === "KOSDAQ" ? "코스닥" : "코스피"}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Watchlist({ onOpenUs }: { onOpenUs?: (t: UsChartTarget) => void }) {
  const wl = useWatchlist();
  const keys = wl.items.map(quoteKey);
  const { data, error, reload } = useLoad(`quotes-${keys.join(",")}`, () => (keys.length ? getQuotes(keys) : Promise.resolve({ quotes: [] })), 20_000);
  const byKey = new Map((data?.quotes ?? []).map((q) => [q.code, q]));

  return (
    <section className="ins-card">
      <CardHead title="관심 종목" meta={wl.ready ? `${wl.items.length}/${wl.max} · ${wl.signedIn ? "계정에 저장" : "이 브라우저에 저장"}` : undefined}>
        <AddBox has={wl.has} onPick={(s) => wl.add({ code: s.code, name: s.name, market: s.market, ...(s.exchange ? { exchange: s.exchange } : {}) })} />
      </CardHead>
      {wl.error && <p className="ins-missing">{wl.error}</p>}
      {!wl.ready ? null : wl.items.length === 0 ? (
        <div className="ins-state" style={{ height: 96 }}>
          <p>국내·미국 종목을 추가하면 시세와 뉴스·공시를 모아 볼 수 있어요</p>
        </div>
      ) : error && !data ? (
        <Failed message={error} onRetry={reload} height={96} />
      ) : (
        <ul className="ins-watch">
          {wl.items.map((it) => {
            const q = byKey.get(quoteKey(it));
            const us = !!it.exchange;
            const label = us ? (
              <>
                <strong>{it.code}</strong>
                <span>{it.name}</span>
              </>
            ) : (
              <>
                <strong>{it.name}</strong>
                <span>{it.code}</span>
              </>
            );
            return (
              <li key={it.code}>
                {us ? (
                  <button type="button" className="name" title={`${it.name} · ${it.market} 차트`} onClick={() => onOpenUs?.({ code: it.code, name: it.name, exchange: it.exchange })}>
                    {label}
                  </button>
                ) : (
                  <Link href={chartHref(it)} className="name">
                    {label}
                  </Link>
                )}
                <span className="price">{q ? (us ? price(q.price, "USD") : won(q.price)) : "—"}</span>
                <span className={`chg ${q ? tone(q.changeRate) : ""}`}>{q ? `${q.change > 0 ? "▲" : q.change < 0 ? "▼" : ""} ${change(q)}` : ""}</span>
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
