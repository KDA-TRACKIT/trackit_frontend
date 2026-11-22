import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./preview.module.css";

const assetDir = "/intro-preview/";
// 2026-11-22: Figma '로그인 전 · TRACKIT 소개'(2375:6118) 미리보기 그대로. 구독 목록 = 실제 구독 목록 카드, 마켓 = 판매순 · 3개월 1쪽 위 세 줄
//   꿀 · 구독자 수처럼 아직 실제 값이 0인 곳은 예시 값
const subscriptions = [
  { name: "어진냥이", sector: "하락에서 살아남기", honey: 24, until: "2026. 12. 21.까지", followThrough: "83%", returnRate: "0.00%" },
  { name: "스윙도크", sector: "미국 빅테크", honey: 96, until: "2026. 12. 10.까지", followThrough: "92%", returnRate: "+1.29%" },
  { name: "모멘텀랩", sector: "미국 헬스케어", honey: 85, until: "2026. 12. 2.까지", followThrough: "97%", returnRate: "+0.98%" },
];
const marketRows = [
  { name: "깃발러너", tag: "#반도체", honey: 129, subscribers: 48, returnRate: "−18.10%", followThrough: "91%", price: "₩19,900", trend: "market-trend-1.svg" },
  { name: "트렌드픽", tag: "#2차전지", honey: 96, subscribers: 41, returnRate: "−21.96%", followThrough: "83%", price: "₩14,900", trend: "market-trend-2.svg" },
  { name: "밸류버스", tag: "#바이오", honey: 85, subscribers: 36, returnRate: "−16.33%", followThrough: "91%", price: "₩12,900", trend: "market-trend-3.svg" },
];
const tone = (r: string) => (r.startsWith("+") ? "up" : r.startsWith("−") || r.startsWith("-") ? "down" : "flat");

const plannedTrades = [
  ["LG에너지솔루션", "09:12", "380,000원 지지 확인 후 매수"],
  ["SK하이닉스", "13:40", "1,290,000원 이탈 시 손절"],
  ["삼성전자", "15:05", "70,800원 추가 매수"],
];

const periods = ["이번 달", "3개월", "6개월", "1년", "2년", "전체"];

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
          <div className={styles.performanceHeading}><b>11월 수익률</b><span>이번 달 청산 기준</span></div>
          <strong>+3.57%</strong>
          <div className={styles.reportPlot}>
            <div className={styles.chartGuides}>
              {["4%", "3%", "2%", "1%", "0%"].map(tick => <span key={tick}>{tick}</span>)}
            </div>
            <Image className={styles.reportGraph} src={assetDir + "report-chart.svg"} alt="" width={257.639} height={58.7417} />
            <div className={styles.chartDates}>
              {["11.01", "11.05", "11.09", "11.13", "11.18"].map(day => <span key={day}>{day}</span>)}
            </div>
          </div>
        </div>
        <div className={styles.reportSide}>
          <div className={styles.reportMetrics}>
            <div className={styles.reportMetric}><b>실시간 수익률</b><p><strong className={styles.positive}>+2.14%</strong><small>보유 3종목</small></p></div>
            <div className={styles.reportMetric}><b>이행률</b><p><strong>83%</strong><small>계획 6건 중 5건 지킴</small></p><i /></div>
          </div>
          <div className={styles.reportPlans}>
            <b>이번 주 노트</b>
            <table>
              <tbody>{plannedTrades.map(([stock, time, plan]) => <tr key={stock}><th scope="row">{stock}</th><td>{time}</td><td>{plan}</td></tr>)}</tbody>
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
        <div className={styles.workspaceTop}>
          <div className={styles.workspaceSearch}><span>005930</span><b>삼성전자</b><Image src={assetDir + "workspace-search.svg"} alt="" width={9.2375} height={9.2375} /></div>
          <span className={styles.feed}><i />장 열림</span>
          <strong className={styles.quote}>206,000원</strong>
          <span className={styles.quoteUp}>+7,100 (+3.57%)</span>
          <small className={styles.volume}>거래량 1,532만 · 30일 평균 1,410만</small>
          <b className={styles.tradeButton}>매매하기</b>
        </div>
        <Image className={styles.workspaceChart} src={assetDir + "workspace-chart.svg"} alt="" width={546} height={341} />
        <div className={styles.workspaceNote}>
          <div className={styles.noteHead}><strong>Note</strong><em>저장 전 검증</em></div>
          <div className={styles.memo}>
            <div className={styles.memoHead}><b>삼성전자</b><span>노트 가져오기</span></div>
            <p>지지선 반등과 거래량 증가를<br />확인한 뒤</p>
          </div>
        </div>
      </div>
    </Preview>
  );
}

export function ArchivePreview() {
  return (
    <Preview title="전략 보관함 · 구독 목록" variant="archive">
      <div className={styles.archiveBody}>
        <strong className={styles.tableHeading}>구독 목록</strong>
        <div className={styles.archiveRows}>
          {subscriptions.map(s => (
            <div className={styles.archiveRow} key={s.name}>
              <div className={styles.archiveName}>
                <small>{s.sector}</small>
                <span><b>{s.name}</b><span className={styles.honeyPlain}><Image src={assetDir + "honey.svg"} alt="" width={7.3659} height={9.24937} />{s.honey}</span></span>
              </div>
              <div className={styles.archiveStat}><small>구독</small><b>{s.until}</b></div>
              <div className={styles.archiveStat}><small>전략 이행률</small><b>{s.followThrough}</b></div>
              <div className={styles.archiveStat}><small>전략 직결 수익률 · 1개월</small><b className={styles["archive-" + tone(s.returnRate)]}>{s.returnRate}</b></div>
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
        <div className={styles.results}>
          <b>검색 결과 13건</b>
          <span className={styles.filterPill}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
            필터
          </span>
        </div>
        <div className={styles.marketFilters}>
          <ul>{periods.map((period, i) => <li className={i === 1 ? styles.activePeriod : undefined} key={period}>{period}</li>)}</ul>
          <span>판매순　⌄</span>
        </div>
        <div className={styles.marketTable}>
          <div className={styles.marketRow}>
            <span>트레이더</span><span>수익률 추이</span><span>수익률</span><span>이행률</span><span>월 구독료</span>
          </div>
          {marketRows.map(row => (
            <div className={styles.marketRow} key={row.name}>
              <div className={styles.marketName}>
                <Image src="/marketplace/favorite-star.svg" alt="" width={13} height={13} />
                <div>
                  <span><b>{row.name}</b><Honey count={row.honey} /><small className={styles.subs}>구독자 {row.subscribers}명</small></span>
                  <small>{row.tag}</small>
                </div>
              </div>
              <Image className={styles.trend} src={assetDir + row.trend} alt="" width={140} height={44} />
              <b className={tone(row.returnRate) === "up" ? styles.marketUp : styles.marketDown}>{row.returnRate}</b>
              <b>{row.followThrough}</b>
              <b>{row.price}</b>
            </div>
          ))}
        </div>
      </div>
    </Preview>
  );
}
