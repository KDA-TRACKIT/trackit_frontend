import HomeBanner from "./HomeBanner";
import Link from "next/link";
import SiteHeader from "./SiteHeader";

import TraderCarousel from "./TraderCarousel";

const trades = [
  ["11.11  10:24", "삼성전자", "매수 · 10주", "₩721,000", "지지선 반등 확인 후 진입", "일지 보기"],
  ["11.10  14:36", "SK하이닉스", "매도 · 4주", "₩804,000", "직전 고점에서 일부 청산", "일지 보기"],
  ["11.07  09:48", "NAVER", "매수 · 6주", "₩1,182,000", "거래량 증가와 박스권 돌파 확인", "일지 보기"],
  ["11.06  11:12", "삼성전자", "매도 · 5주", "₩358,000", "작성 전", "일지 작성"],
];

export default function Home() {
  return <main className="home"><SiteHeader active="home" /><HomeBanner tradeCount={24} />
    <section id="trader-board" className="trader-board section-wrap">
      <div className="section-heading">
        <h2>트레이더 보드</h2>
        <Link className="heading-link" href="/marketplace">전략 시장 <span>→</span></Link>
      </div>
      <TraderCarousel />
    </section>
    <section className="report section-wrap"><div className="section-heading"><h2>트레이딩 성과 리포트</h2><button>성과 리포트 <span>→</span></button></div><div className="report-grid"><div className="chart-card"><p>누적 수익률 추이</p><strong>+7.0%</strong><div className="chart"><div className="y-labels"><span>8%</span><span>6%</span><span>4%</span><span>2%</span><span>0%</span></div><div className="chart-body"><div className="grid-lines" /><svg viewBox="0 0 580 130" preserveAspectRatio="none" aria-label="누적 수익률 차트"><polyline points="0,115 15,102 30,113 45,105 60,110 75,100 90,106 105,96 125,93 145,88 165,92 182,105 200,80 220,65 240,75 258,62 280,74 300,82 320,66 338,74 355,58 375,68 395,56 420,53 440,38 458,42 475,25 495,31 510,38 530,35 550,20 580,0" fill="none" stroke="#c9320b" strokeWidth="2" /></svg><div className="x-labels"><span>10.11</span><span>10.17</span><span>10.23</span><span>10.30</span><span>11.05</span><span>11.11</span></div></div></div></div><div className="metric-grid"><Metric label="평균 수익" value="+₩84,200" /><Metric label="거래 횟수" value="24건" /><Metric label="평균 손익비" value="1.72 : 1" /><Metric label="최대 낙폭" value="−3.2%" /></div></div></section><section id="trading-log" className="trades section-wrap"><div className="section-heading"><h2>최근 거래 기록과 매매일지</h2><Link className="heading-link" href="/workshop">작업실 열기 <span>→</span></Link></div><div className="trade-table"><div className="trade-head"><span>일시</span><span>종목</span><span>체결</span><span>체결 금액</span><span>매매일지</span><span /></div>{trades.map((trade) => <div className="trade-row" key={trade[0]}>{trade.map((value, i) => i === 5 ? <a key={value} href="#">{value} <span>→</span></a> : <span key={value}>{value}</span>)}</div>)}</div></section></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><p>{label}</p><strong>{value}</strong></div>; }
