"use client";
// 차트 전체 화면 오른쪽 종목 검색 (2026-11-20): 전체 화면을 끄지 않고 바로 다른 종목으로 바꿈
//   검색칸이 비면 관심 종목, 입력하면 검색 결과. 누르면 바로 그 종목 차트로
import { useEffect, useState } from "react";
import { searchAllSymbols, type SymbolInfo } from "../../lib/market-data";
import type { WatchItem } from "../insights/useWatchlist";

export default function ChartSymbolSide({ current, watch, onPick }: { current: string; watch: WatchItem[]; onPick: (s: SymbolInfo) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const typed = query.trim() !== "";

  useEffect(() => {
    if (!typed) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      searchAllSymbols(query.trim(), ac.signal)
        .then(setResults)
        .catch(() => {
          if (!ac.signal.aborted) setResults([]);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, typed]);

  const list: SymbolInfo[] = typed ? results : watch.map((w) => ({ code: w.code, name: w.name, market: w.market, exchange: w.exchange }));

  return (
    <aside className="ws-fs-side" aria-label="종목 검색">
      <label className="ws-fs-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // 차트 단축키(Esc 등)로 새지 않게: Enter 는 첫 결과, Esc 는 검색어만 지움
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && list[0]) {
              onPick(list[0]);
              setQuery("");
            }
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="종목명 · 코드 · 티커"
          aria-label="종목 검색"
        />
      </label>
      <p className="ws-fs-head">{typed ? `검색 결과 ${results.length}개` : "관심 종목"}</p>
      <ul className="ws-fs-list" role="listbox">
        {list.map((item) => (
          <li key={`${item.exchange ?? "KR"}:${item.code}`}>
            <button
              role="option"
              aria-selected={item.code === current}
              onClick={() => {
                onPick(item);
                setQuery("");
              }}
            >
              <strong>{item.name}</strong>
              <span>{item.code}</span>
              <small>{item.market}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="ws-fs-empty">{typed ? "찾는 종목이 없어요." : "관심 종목이 없어요. 위에서 검색해 보세요."}</li>}
      </ul>
    </aside>
  );
}
