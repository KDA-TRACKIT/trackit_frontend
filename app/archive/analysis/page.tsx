"use client";
// 전략보관함 · 전략 분석: 채팅창 하나 (2026-11-20)
//   산 전략 · 전략 버전 · 내 노트 · 실제 매매 · 시세를 찾아 근거로 답하는 전략 분석 채팅 (AskPanel)
//   예전의 트레이더 비교 표 · 월별 수익률 카드는 뺌
import SiteHeader from "../../SiteHeader";
import AskPanel from "./AskPanel";
import "../../marketplace/marketplace.css";
import "../archive.css";

export default function AnalysisPage() {
  return (
    <main className="mk-page an-chat-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <div className="ar-title-row">
          <h1 className="mk-title">전략 분석</h1>
        </div>
        <AskPanel />
      </div>
    </main>
  );
}
