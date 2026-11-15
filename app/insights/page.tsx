"use client";
// 투자 정보 (아직 메뉴에 안 넣음 — 주소 /insights 로 직접 열기)
//   시장: 전광판 · 관심 종목 · 섹터맵 · 오늘의 종목(상승·하락·거래대금) · 외국인·기관
//   뉴스: 경제·증권 뉴스 제목 (종목 태그 · 관심 종목만)
//   경제: 경제 캘린더(이번 주 지표·FOMC·금통위) · 물가(한국·미국 CPI·PPI)
//   공시: DART 최근 공시 (보유 종목만 보기)
//   내 손익: 청산 손익 캘린더
import { useState } from "react";
import SiteHeader from "../SiteHeader";
import type { SectorMap as SectorMapData } from "../../lib/api/insights";
import Board from "./Board";
import News from "./News";
import Watchlist from "./Watchlist";
import UsChart, { type UsChartTarget } from "./UsChart";
import SectorMap from "./SectorMap";
import { Flows, Rankings } from "./Movers";
import { EconCalendar } from "./Calendar";
import { Inflation } from "./Economy";
import { DisclosureList, PnlCalendar } from "./Mine";
import "./insights.css";
import "./sections.css";

const TABS = [
  ["market", "시장"],
  ["news", "뉴스"],
  ["economy", "경제"],
  ["disclosures", "공시"],
  ["mine", "내 손익"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("market");
  const [sectors, setSectors] = useState<SectorMapData | null>(null);
  /** 미국 종목 차트 창 (관심 종목 · 지수 맵 · 순위에서 누르면) */
  const [usChart, setUsChart] = useState<UsChartTarget | null>(null);
  return (
    <main className="ins">
      <SiteHeader />
      <div className="ins-body">
        <div className="ins-top">
          <h1>투자 정보</h1>
          <nav className="ins-tabs" role="tablist" aria-label="투자 정보">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
        {tab === "market" && (
          <>
            <Board />
            <Watchlist onOpenUs={setUsChart} />
            <SectorMap onData={setSectors} onOpenUs={setUsChart} />
            <div className="ins-grid-2">
              <Rankings data={sectors} onOpenUs={setUsChart} />
              <Flows />
            </div>
          </>
        )}
        {tab === "news" && <News />}
        {tab === "economy" && (
          <>
            <EconCalendar />
            <Inflation />
          </>
        )}
        {tab === "disclosures" && <DisclosureList />}
        {tab === "mine" && <PnlCalendar />}
      </div>
      {usChart && <UsChart target={usChart} onClose={() => setUsChart(null)} />}
    </main>
  );
}
