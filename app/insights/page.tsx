"use client";
// 증시 캘린더 (상단 FOR TRADE 메뉴 안. ?tab=market|news|economy|disclosures|mine 으로 바로 열림)
//   시장: 전광판 · 관심 종목 · 섹터맵 · 오늘의 종목(상승·하락·거래대금) · 외국인·기관
//   뉴스: 경제·증권 뉴스 제목 (종목 태그 · 관심 종목만)
//   경제: 경제 캘린더(지난·이번 주·다가오는 지표, 실제·예상·이전) · 기준금리(미국·한국·유로·일본)
//   공시: DART 최근 공시 (보유 종목만 보기)
//   매매 캘린더: 청산 손익 캘린더
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "../SiteHeader";
import type { SectorMap as SectorMapData } from "../../lib/api/insights";
import Board from "./Board";
import News from "./News";
import Watchlist from "./Watchlist";
import UsChart, { type UsChartTarget } from "./UsChart";
import SectorMap from "./SectorMap";
import { Flows, Rankings } from "./Movers";
import { EconCalendar } from "./Calendar";
import { PolicyRates } from "./Economy";
import { DisclosureList, PnlCalendar } from "./Mine";
import "./insights.css";
import "./sections.css";

const TABS = [
  ["market", "시장"],
  ["news", "뉴스"],
  ["economy", "경제"],
  ["disclosures", "공시"],
  ["mine", "매매 캘린더"],
] as const;
type Tab = (typeof TABS)[number][0];

const isTab = (v: string | null): v is Tab => TABS.some(([k]) => k === v);

export default function InsightsPage() {
  return (
    <Suspense fallback={<main className="ins"><SiteHeader active="fortrade" /></main>}>
      <Insights />
    </Suspense>
  );
}

function Insights() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("tab");
  const tab: Tab = isTab(q) ? q : "market";
  const setTab = (t: Tab) => router.replace(t === "market" ? "/insights" : `/insights?tab=${t}`, { scroll: false });
  const [sectors, setSectors] = useState<SectorMapData | null>(null);
  /** 미국 종목 차트 창 (관심 종목 · 지수 맵 · 순위에서 누르면) */
  const [usChart, setUsChart] = useState<UsChartTarget | null>(null);
  return (
    <main className="ins">
      <SiteHeader active="fortrade" />
      <div className="ins-body">
        <div className="ins-top">
          <h1>증시 캘린더</h1>
          <nav className="ins-tabs" role="tablist" aria-label="증시 캘린더">
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
            <PolicyRates />
          </>
        )}
        {tab === "disclosures" && <DisclosureList />}
        {tab === "mine" && <PnlCalendar />}
      </div>
      {usChart && <UsChart target={usChart} onClose={() => setUsChart(null)} />}
    </main>
  );
}
