import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./preview.module.css";

const assetDir = "/intro-preview/";
const traders = [
  { name: "차트메이트", description: "지지선 반등에 주목하는 단타 트레이더", archiveHoney: 128, marketHoney: 129, followThrough: "92%", returnRate: "−3.04%", months: "26년 9월 · 26년 8월", price: "₩19,900", trend: "market-trend-1.svg" },
  { name: "파동노트", description: "거래량을 보는 추세 추종 트레이더", archiveHoney: 96, marketHoney: 96, followThrough: "89%", returnRate: "+0.90%", months: "26년 9월", price: "₩9,900", trend: "market-trend-2.svg" },
  { name: "퀀트로그", description: "변동성을 관리하는 스윙 트레이더", archiveHoney: 85, marketHoney: 85, followThrough: "95%", returnRate: "+0.98%", months: "26년 8월 · 26년 7월", price: "₩8,900", trend: "market-trend-3.svg" },
];

const plannedTrades = [
  ["LG에너지솔루션", "380,000원", "지지 확인 후 매수"],
  ["SK하이닉스", "1,290,000원", "손절"],
  ["삼성전자", "70,800원", "추가 매수"],
];

const periods = ["1개월", "3개월", "6개월", "1년", "3년", "설정이후"];

function Preview({ title, variant, children }: {
  title: string;
  variant: "dashboard" | "workshop" | "archive" | "market";
  children: ReactNode;
}) {
  return (
    <figure aria-label={title + " 화면 미리보기"} className={styles.preview}>
      <div aria-hidden="true" className={`${styles.surface} ${styles[variant]}`}>
        <div className={styles.chrome}>
          <span className={styles.dots}><i /><i /><i /></span>
          {title}
        </div>
        {children}
      </div>
    </figure>
  );
}

function Honey({ count }: { count: number }) {
  return (
    <span className={styles.honey}>
      <Image src={assetDir + "honey.svg"} alt="" width={7.3659} height={9.24937} />
      {count}
    </span>
  );
}

export function DashboardPreview() {
  return (
    <Preview title="홈 · 트레이딩 성과 리포트" variant="dashboard">
      <div className={styles.banner}>
        <Image className={styles.waveMain} src={assetDir + "banner-wave-main.svg"} alt="" width={561.653} height={85.0208} />
        <Image className={styles.waveLeft} src={assetDir + "banner-wave-left.svg"} alt="" width={465.296} height={40.8795} />
        <Image className={styles.waveRight} src={assetDir + "banner-wave-right.svg"} alt="" width={270.521} height={40.8842} />
        <div className={styles.bannerCopy}>
          <i />
          <strong>기록하고, 발견하고, 나만의 전략을 완성하다.</strong>
          <p>나의 투자 여정을 함께하는 트레이딩 플랫폼, TRACKIT.</p>
          <span>트레이딩 로그 →</span>
        </div>
        <div className={styles.bee}>
          <Image src="/home/banner-bee.png" alt="" width={1536} height={1024} sizes="180px" />
        </div>
        <Image className={styles.ledge} src={assetDir + "banner-ledge.svg"} alt="" width={198.382} height={13.3972} />
      </div>
      <div className={styles.report}>
        <div className={styles.performance}>
          <div className={styles.performanceHeading}><b>11월 수익률</b><span>코스피보다 +1.99%p</span></div>
          <strong>+3.57%</strong>
          <div className={styles.reportPlot}>
            <div className={styles.chartGuides}>
              {["4%", "3%", "2%", "1%", "0%"].map(tick => <span key={tick}>{tick}</span>)}
            </div>
            <Image className={styles.reportGraph} src={assetDir + "report-chart.svg"} alt="" width={257.639} height={58.7417} />
            <div className={styles.chartDates}>
              {["11/1", "11/5", "11/8", "11/12", "11/15"].map(day => <span key={day}>{day}</span>)}
            </div>
          </div>
        </div>
        <div className={styles.reportSide}>
          <div className={styles.reportMetrics}>
            <div className={styles.reportMetric}><b>이행률</b><p><strong>83%</strong><small>6건 중 5건</small></p><i /></div>
            <div className={styles.reportMetric}><b>판매 등급</b><p><strong>C</strong><small>B까지 조건 2개</small></p><i /></div>
          </div>
          <div className={styles.reportPlans}>
            <b>이번 주 메모</b>
            <table>
              <tbody>{plannedTrades.map(([stock, price, plan]) => <tr key={stock}><th scope="row">{stock}</th><td>{price}</td><td>{plan}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </Preview>
  );
}

export function WorkshopPreview() {
  return (
    <Preview title="투자작업실 · 차트와 노트" variant="workshop">
      <div className={styles.workspaceBody}>
        <div className={styles.workspaceToolbar}>
          <div><strong>005930 · 삼성전자</strong><Image src={assetDir + "workspace-search.svg"} alt="" width={9.2375} height={9.2375} /></div>
          <span>레이아웃　 저장 ⌄　 ⚙　 ⛶</span>
          <b>매매하기</b>
        </div>
        <Image className={styles.workspaceChart} src={assetDir + "workspace-chart.svg"} alt="" width={546} height={261} />
        <div className={styles.workspaceNote}><strong>AI 노트</strong><p>지지선 반등과 거래량 증가를<br />확인한 뒤</p></div>
      </div>
    </Preview>
  );
}

export function ArchivePreview() {
  return (
    <Preview title="전략 보관함 · 구매한 전략" variant="archive">
      <div className={styles.archiveBody}>
        <strong className={styles.tableHeading}>트레이더</strong>
        <div className={styles.archiveRows}>
          {traders.map(trader => (
            <div className={styles.archiveRow} key={trader.name}>
              <div className={styles.archiveName}><small>{trader.description}</small><span><b>{trader.name}</b><Honey count={trader.archiveHoney} /></span></div>
              <div className={styles.archiveMetrics}>
                <div><small>전략 이행률</small><b>{trader.followThrough}</b></div>
                <div><small>최근 1개월 수익률</small><b className={trader.returnRate.startsWith("+") ? styles.positive : styles.negative}>{trader.returnRate}</b></div>
                <div><small>보유 전략</small><b>{trader.months}</b></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Preview>
  );
}

export function MarketPreview() {
  return (
    <Preview title="전략 마켓 · 트레이더 목록" variant="market">
      <div className={styles.marketBody}>
        <strong className={styles.tableHeading}>트레이더</strong>
        <div className={styles.marketSearch}><span>트레이더 이름, 매매 방식 등으로 검색하세요</span><b>검색</b></div>
        <b className={styles.results}>검색 결과 40건</b>
        <div className={styles.marketFilters}>
          <ul>{periods.map((period, i) => <li className={i === 1 ? styles.activePeriod : undefined} key={period}>{period}</li>)}</ul>
          <span>추천순　⌄</span>
        </div>
        <div className={styles.marketTable}>
          <div className={styles.marketRow}>
            <span>트레이더</span><span>수익률 추이</span><span>수익률</span><span>이행률</span><span>열람권 가격</span>
          </div>
          {traders.map(trader => (
            <div className={styles.marketRow} key={trader.name}>
              <div className={styles.marketName}>
                <Image src="/marketplace/favorite-star.svg" alt="" width={13} height={13} />
                <div><span><b>{trader.name}</b><Honey count={trader.marketHoney} /></span><small>{trader.description}</small></div>
              </div>
              <Image className={styles.trend} src={assetDir + trader.trend} alt="" width={140} height={44} />
              <b className={trader.returnRate.startsWith("+") ? styles.marketUp : styles.marketDown}>{trader.returnRate}</b>
              <b>{trader.followThrough}</b>
              <b>{trader.price}</b>
            </div>
          ))}
        </div>
      </div>
    </Preview>
  );
}
