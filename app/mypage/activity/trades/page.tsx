"use client";
// 거래 기록: 체결과 연결된 기록 조회 (종목 검색 · 기간 · 매수/매도)
import { useMemo, useState } from "react";
import { daysAgo } from "../../../../lib/records";
import { isBuy, isSell, newestFirst, useActivity } from "../../data";
import { Card, Empty, PageHead, Stat, Table } from "../../ui";

const PERIODS = { 전체: 0, "최근 7일": 7, "최근 30일": 30, "최근 90일": 90 } as const;
type Period = keyof typeof PERIODS;
type Side = "전체" | "매수" | "매도";

export default function TradesPage() {
  const { trades, buys, sells } = useActivity();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("전체");
  const [side, setSide] = useState<Side>("전체");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const from = PERIODS[period] ? daysAgo(PERIODS[period]) : "";
    return newestFirst(trades).filter(
      (r) =>
        (!term || (r.symbolName ?? "").toLowerCase().includes(term) || (r.symbol ?? "").includes(term)) &&
        (!from || r.date >= from) &&
        (side === "전체" || (side === "매수" ? isBuy(r.side) : isSell(r.side))),
    );
  }, [trades, q, period, side]);

  return (
    <>
      <PageHead title="거래 기록" parent={["활동 이력", "/mypage/activity"]} />
      <Card>
        <div className="mp-stats">
          <Stat label="전체" value={trades.length} unit="건" />
          <Stat label="매수" value={buys} unit="건" />
          <Stat label="매도" value={sells} unit="건" />
        </div>
      </Card>
      <Card title="거래 내역" meta={list.length}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="mp-input" style={{ flex: "1 1 280px", maxWidth: 318, fontSize: 12 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목명, 종목코드" aria-label="종목 검색" />
          <select className="mp-select" style={{ width: 148 }} value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="기간">
            {Object.keys(PERIODS).map((p) => (
              <option key={p} value={p}>
                {p === "전체" ? "전체 기간" : p}
              </option>
            ))}
          </select>
          <select className="mp-select" style={{ width: 150 }} value={side} onChange={(e) => setSide(e.target.value as Side)} aria-label="거래 구분">
            <option value="전체">전체 거래</option>
            <option value="매수">매수</option>
            <option value="매도">매도</option>
          </select>
          <button
            type="button"
            className="mp-btn"
            style={{ width: 78, padding: 0, fontSize: 12 }}
            onClick={() => {
              setQ("");
              setPeriod("전체");
              setSide("전체");
            }}
          >
            초기화
          </button>
        </div>
        {list.length > 0 && (
        <Table cols={["거래일", "구분", "종목", "수량", "체결 시각", "메모", "매매일지"]}>
          {list.map((r) => (
            <div className="mp-tr" key={r.id}>
              <span className="num">{r.date.replaceAll("-", ".")}</span>
              <span>
                <em className={isBuy(r.side) ? "buy" : "sell"}>{isBuy(r.side) ? "매수" : isSell(r.side) ? "매도" : (r.side ?? "—")}</em>
              </span>
              <span>{r.symbolName ?? r.symbol}</span>
              <span className="num">{r.quantity ? `${r.quantity.toLocaleString("ko-KR")}주` : "—"}</span>
              <span className="num">{r.executionTime?.slice(0, 5)}</span>
              <span>{r.executionTime && r.noteTime < r.executionTime ? "사전" : "사후"}</span>
              <span className="clip">{r.text}</span>
            </div>
          ))}
        </Table>
        )}
        {list.length === 0 && <Empty text={trades.length ? "조건에 맞는 거래가 없어요" : "체결된 거래가 아직 없어요"} />}
      </Card>
    </>
  );
}
