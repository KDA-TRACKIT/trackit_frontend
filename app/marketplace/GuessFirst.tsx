"use client";
// 먼저 판단해 보기 (아카이브 · 구매한 전략의 연습하기에서 씀) + 월별 전략 데이터 타입 · 다크 모드 훅
//   판매자가 이 종목을 처음 산 날 바로 전까지만 차트를 보여 주고, 매수 / 관망을 고른 뒤 판매자의 판단과 결과를 비교
import { useMemo, useState, useSyncExternalStore } from "react";
import WorkshopChart from "../workshop/WorkshopChart";
import type { Bar, ChartNote } from "../../lib/mock/workshop";
import { uuid } from "../../lib/uuid";
import type { SimCandle, SimInd, SimNote, SimTrade } from "./StrategyChart";
import "../workshop/workshop.css";

/** "2026-10-14" → 그날 0시(KST) 초 (국내 일봉 시각과 같게) */
const dayTime = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 1000 - 9 * 3600;

export type SimMonth = { month: string; title: string; summary: string; ret: number; follow: number; symbol: { code: string; name: string }; candles: SimCandle[]; ind?: SimInd; trades: SimTrade[]; notes?: SimNote[] };
export type SimDetail = { id: string; market: "KR" | "US"; rule: { key: string; name: string; desc: string }; symbols: { code: string; name: string }[]; months: SimMonth[] };

/** 다크 모드 (html data-theme) — 차트 색을 맞추려고 */
export function useDark() {
  return useSyncExternalStore(
    (cb) => {
      const o = new MutationObserver(cb);
      o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => o.disconnect();
    },
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );
}

/**
 * 먼저 판단해 보기: 판매자가 이 종목을 처음 산 날 바로 전까지만 차트를 보여 주고(그은 선 · 표시 없이),
 * 구매자가 먼저 매수 / 관망을 고른 뒤 판매자의 판단과 결과를 비교
 */
export default function GuessFirst({ m, dark, currency, cur }: { m: SimMonth; dark: boolean; currency: "KRW" | "USD"; cur: (n: number) => string }) {
  const tr = m.trades.filter((x) => x.code === m.symbol.code).sort((a, b) => a.entry.d.localeCompare(b.entry.d))[0];
  const [pick, setPick] = useState<"buy" | "wait" | null>(null);
  const cut = m.candles.findIndex(([d]) => d >= tr.entry.d);
  const visible = cut > 0 ? m.candles.slice(0, cut) : m.candles;
  const lastDay = visible[visible.length - 1]?.[0];
  const won = tr.ret > 0;
  // 트레이딩 로그 차트 그대로: 선 긋기 · 보조지표 · Shift 측정. 그린 것은 이 화면에만 (기록에 저장 안 함)
  const bars: Bar[] = useMemo(() => visible.map(([d, o, h, l, c, v]) => ({ time: dayTime(d), open: o, high: h, low: l, close: c, volume: v ?? 0 })), [visible]);
  const [notes, setNotes] = useState<ChartNote[]>([]);
  return (
    <section className="mk-card mk-guess">
      <h2>
        먼저 판단해 보기 <small>{m.symbol.name} · {lastDay} 종가까지</small>
      </h2>
      {!pick ? (
        <>
          <p>선을 긋거나 보조지표를 켜 보고, 다음 날 나라면 어떻게 할지 골라 보세요. 그린 선은 저장되지 않아요.</p>
          <div className="mk-guess-chart">
            <WorkshopChart
              bars={bars}
              interval="1d"
              onIntervalChange={() => {}}
              notes={notes}
              onAddNote={(n) => setNotes((l) => [...l, { ...n, id: uuid(), createdAt: new Date().toISOString() }])}
              dataKey={`practice:${m.symbol.code}:${m.month}`}
              symbolCode={m.symbol.code}
              symbolName={m.symbol.name}
              market=""
              currency={currency}
            />
          </div>
          <div className="mk-guess-btns">
            <button type="button" className="mk-primary" onClick={() => setPick("buy")}>
              매수
            </button>
            <button type="button" className="mk-ghost" onClick={() => setPick("wait")}>
              관망
            </button>
          </div>
        </>
      ) : (
        <div className={`mk-guess-result ${pick === "buy" ? (won ? "good" : "bad") : won ? "bad" : "good"}`}>
          <p>
            나: <b>{pick === "buy" ? "매수" : "관망"}</b> · 판매자: <b>매수</b> ({tr.entry.d} · {cur(tr.entry.px)})
          </p>
          <p>판매자의 근거: {tr.entry.why}</p>
          <p>
            결과: {tr.exit.d} {tr.exit.why} → <b className={won ? "gain" : "loss"}>{tr.ret > 0 ? "+" : ""}
            {tr.ret}%</b> {pick === "buy" ? (won ? "· 같은 판단, 이익" : "· 같은 판단이었지만 손실") : won ? "· 관망했다면 이 이익을 놓쳤어요" : "· 관망이 더 나았어요"}
          </p>
          <button type="button" className="mk-ghost" onClick={() => setPick(null)}>
            다시 해 보기
          </button>
        </div>
      )}
    </section>
  );
}

