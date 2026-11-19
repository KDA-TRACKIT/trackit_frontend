"use client";
// 내 전략 · 모든 종목의 전체 기록 (2026-11-19 회의: 트레이딩 로그는 개별 종목 기록만, 모든 종목 기록은 내 전략 페이지에)
//   위 '전략 목록' 카드와 같은 모양 · 같은 선에 맞춤. 종목명만 보여 주고, 누르면 그 종목의 트레이딩 로그(종목 전략)로
//   종목 = 그 종목 메모가 있거나, 뉴스 · 경제 지표 메모에서 그 종목으로 정량 전략을 적은 것. 최근에 기록한 종목 먼저
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { initRecordSource, useRecords } from "../../../lib/records";
import { currentRecords, symbolRecords } from "../../../lib/strategy";

export default function SymbolRecords() {
  const all = useRecords();
  useEffect(() => {
    void initRecordSource();
  }, []);
  const symbols = useMemo(() => {
    const names = new Map<string, string>();
    for (const r of all) {
      if (r.symbol) names.set(r.symbol, r.symbolName ?? r.symbol);
      else if (r.target) names.set(r.target.code, r.target.name);
    }
    return [...names.entries()]
      .map(([code, name]) => {
        const last = currentRecords(symbolRecords(all, code)).reduce((a, r) => (`${r.date} ${r.noteTime}` > a ? `${r.date} ${r.noteTime}` : a), "");
        return { code, name, last };
      })
      .filter((s) => s.last)
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [all]);

  return (
    <section className="mk-card ar-table-card ar-symbol-records" aria-label="종목별 전략 기록">
      <div className="ar-sec-head">
        <div>
          <h3>종목별 전략 기록</h3>
        </div>
      </div>
      {symbols.length === 0 ? (
        <p className="ar-symbol-empty">아직 종목 기록이 없어요. 트레이딩 로그 차트 노트에서 저장하면 종목마다 쌓여요.</p>
      ) : (
        <ul className="ar-symbol-list">
          {symbols.map((s) => (
            <li key={s.code}>
              <Link href={`/workshop?symbol=${encodeURIComponent(s.code)}&name=${encodeURIComponent(s.name)}`} title={`${s.name} 종목 전략 보기`}>
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
