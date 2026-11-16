import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import styles from "./HomeBanner.module.css";
import type { CSSProperties } from "react";

function WaveText({ text, offset = 0 }: { text: string; offset?: number }) {
  return <>{Array.from(text).map((letter, index) => <span key={index} className={styles.waveLetter} style={{ "--wave-delay": `${(offset + index) * 0.09}s` } as CSSProperties}>{letter === " " ? "\u00a0" : letter}</span>)}</>;
}

export default function HomeBanner({ tradeCount, failed = false }: { tradeCount?: number; failed?: boolean }) {
  return <section className={styles.banner} aria-labelledby="home-banner-title">
    <div className={styles.inner}>
      <div className={styles.eyebrow}><span>TRACKIT / MY OVERVIEW</span><i aria-hidden="true"/><span>PERSONAL DASHBOARD</span></div>
      <div className={styles.content}>
        <div className={styles.copy}>
          <h1 id="home-banner-title" aria-label="오늘의 기록이 내일의 전략으로."><span aria-hidden="true"><WaveText text="오늘의 기록이"/><br/><WaveText text="내일의 " offset={7}/><em><WaveText text="전략" offset={11}/></em><WaveText text="으로." offset={13}/></span></h1>
          <p>나의 거래와 투자 기록을 확인해보세요.</p>
          <Link className={styles.cta} href="/workshop">거래 기록 작성 <ArrowRight size={22} aria-hidden="true"/></Link>
        </div>
        <Link className={styles.record} href="#trading-log">
          <h2><FileText size={26} aria-hidden="true"/> 나의 거래 기록</h2>
          <div className={styles.count}>{tradeCount === undefined ? <span className={styles.pending}>{failed ? "확인 필요" : "불러오는 중"}</span> : <><strong>{tradeCount.toLocaleString("ko-KR")}</strong><span>건</span></>}</div>
          <small>최근 1개월 기준 · 예시 데이터</small>
          <div className={styles.recordFooter}><span>최근 거래를 확인하세요.</span><ArrowRight size={22} aria-hidden="true"/></div>
        </Link>
        <div className={styles.mascot} aria-hidden="true"><Image src="/images/home-bee.png" alt="" width={1024} height={1024} priority sizes="(max-width: 600px) 180px, (max-width: 1000px) 240px, 360px"/><div className={styles.ledge}/></div>
      </div>
    </div>
  </section>;
}
