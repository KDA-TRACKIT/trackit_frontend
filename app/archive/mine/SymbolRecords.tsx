"use client";
// 내 전략 · 모든 종목의 전체 기록 (2026-11-19 회의: 트레이딩 로그는 개별 종목 기록만, 모든 종목 기록은 내 전략 페이지에)
//   종목마다 한 장: 그 종목 메모 + 그 종목으로 정량 전략을 적은 뉴스 · 경제 지표 메모, 날짜와 내용만 (트레이딩 로그 종목 전략과 같은 모양)
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { dateLabel, initRecordSource, useRecords, type TradeRecord } from "../../../lib/records";
import { symbolRecords } from "../../../lib/strategy";

export default function SymbolRecords() {
  const all = useRecords();
  useEffect(() => {
    void initRecordSource();
  }, []);
  const groups = useMemo(() => {
    const names = new Map<string, string>();
    for (const r of all) {
      if (r.symbol) names.set(r.symbol, r.symbolName ?? r.symbol);
      else if (r.target) names.set(r.target.code, r.target.name);
    }
    return [...names.entries()]
      .map(([code, name]) => {
        const items = symbolRecords(all, code).sort((a, b) => `${a.date} ${a.noteTime}`.localeCompare(`${b.date} ${b.noteTime}`));
        return { code, name, items, last: items.at(-1) };
      })
      .filter((g) => g.items.length)
      .sort((a, b) => `${b.last!.date} ${b.last!.noteTime}`.localeCompare(`${a.last!.date} ${a.last!.noteTime}`));
  }, [all]);

  return (
    <section className="mk-card ar-symbol-records" aria-label="종목별 전략 기록">
      <h3>종목별 전략 기록</h3>
      {groups.length === 0 ? (
        <p className="ar-symbol-empty">아직 종목 기록이 없어요. 트레이딩 로그 차트 노트에서 저장하면 종목마다 쌓여요.</p>
      ) : (
        <div className="ar-symbol-grid">
          {groups.map((g) => (
            <div key={g.code} className="ar-symbol-card">
              <Link href={`/workshop?symbol=${encodeURIComponent(g.code)}&name=${encodeURIComponent(g.name)}`}>
                {g.name} <span>{g.code}</span>
              </Link>
              <div className="ar-symbol-entries">
                {g.items.map((r: TradeRecord) => (
                  <div key={r.id}>
                    <b>
                      {dateLabel(r.date)} {r.noteTime.slice(0, 5)}
                    </b>
                    <p>{r.text.replace(/^\[관찰 메모\]\s*/, "")}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
