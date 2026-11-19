"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { kstDate, type Trade } from "../lib/api/performance";
import { koreanDay, weekDays } from "../lib/home-calendar";
import type { TradeRecord } from "../lib/records";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
export function recordColor(record: TradeRecord) {
  return record.topic === "뉴스" ? "news" : record.symbol ? "trade" : "market";
}
export function workshopLink(symbol?: string | null, name?: string | null, date?: string) {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  if (name) params.set("name", name);
  if (date) params.set("date", date);
  return `/workshop${params.size ? `?${params}` : ""}`;
}
export default function HomeWeeklyRecords({ trades, records, names, loading, failed }: { trades: Trade[]; records: TradeRecord[]; names: Record<string, string>; loading: boolean; failed: boolean }) {
  const [today] = useState(() => kstDate());
  const [selection, setSelection] = useState({ offset: 0, date: today });
  const days = weekDays(today, selection.offset);
  const dailyTrades = trades.filter((trade) => new Date(Date.parse(trade.executedAt) + 9 * 3_600_000).toISOString().slice(0, 10) === selection.date);
  const dailyNotes = records.filter((record) => record.date === selection.date).sort((a, b) => a.noteTime.localeCompare(b.noteTime));
  const selectedIndex = days.indexOf(selection.date);
  function moveWeek(direction: number) {
    const offset = selection.offset + direction;
    setSelection({ offset, date: weekDays(today, offset)[Math.max(selectedIndex, 0)] });
  }
  return (
    <section className="home-weekly home-container" aria-labelledby="weekly-records-title">
      <div className="home-section-heading">
        <h2 id="weekly-records-title">이번 주 거래기록 · 노트</h2>
        <Link className="home-action" href="/mypage/activity/trades">거래 기록 <span aria-hidden="true">→</span></Link>
      </div>
      <div className="home-weekly-card">
        <div className="home-week-nav">
          <button type="button" aria-label="이전 주" onClick={() => moveWeek(-1)}><ChevronLeft size={16} /></button>
          <h3>{koreanDay(days[0])} – {koreanDay(days[6])}</h3>
          <button type="button" aria-label="다음 주" disabled={selection.offset === 0} onClick={() => moveWeek(1)}><ChevronRight size={16} /></button>
        </div>
        <div className="home-week-days" role="group" aria-label="기록 날짜 선택">
          {days.map((date, index) => {
            const count = trades.filter((trade) => new Date(Date.parse(trade.executedAt) + 9 * 3_600_000).toISOString().slice(0, 10) === date).length;
            const notes = records.filter((record) => record.date === date);
            return <button key={date} type="button" className={`home-week-day${date === selection.date ? " selected" : ""}`} aria-pressed={date === selection.date} aria-label={`${koreanDay(date)} ${WEEKDAYS[index]}요일, 거래 ${count}건, 노트 ${notes.length}건`} onClick={() => setSelection({ ...selection, date })}>
              <span>{WEEKDAYS[index]}</span><strong>{date.slice(8)}</strong><b>{loading ? "불러오는 중" : count ? `거래 ${count}` : failed ? "확인 불가" : "—"}</b>
              <span className="home-note-dots" aria-hidden="true">{notes.slice(0, 3).map((record) => <i key={record.id} className={recordColor(record)} />)}{notes.length > 3 && <small>+{notes.length - 3}</small>}</span>
            </button>;
          })}
        </div>
        <div className="home-day-detail">
          <div className="home-day-detail-head" aria-live="polite">
            <p>선택 날짜 · {koreanDay(selection.date)} ({WEEKDAYS[selectedIndex]})</p>
            {dailyTrades.map((trade) => (
              <div className="home-day-trade" key={trade.id}>
                <strong>{names[trade.symbol] ?? trade.symbol} · {trade.side === "BUY" ? "매수" : "매도"}</strong>
                <span>{Number(trade.quantity).toLocaleString("ko-KR")}주 · {Number(trade.price).toLocaleString("ko-KR")}원</span>
              </div>
            ))}
          </div>
          {dailyNotes.map((record) => <Link key={record.id} className="home-day-note" href={workshopLink(record.symbol, record.symbolName, selection.date)}><i className={recordColor(record)} aria-hidden="true" /><strong>{record.noteTime.slice(0, 5)} · {record.symbolName ?? record.topic ?? "시장 전반"}</strong><span>{record.text}</span></Link>)}
          {!loading && !dailyTrades.length && !dailyNotes.length && <p className="home-detail-empty">{failed ? "거래 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "이 날짜에 저장된 거래와 노트가 없습니다."}</p>}
        </div>
      </div>
    </section>
  );
}
