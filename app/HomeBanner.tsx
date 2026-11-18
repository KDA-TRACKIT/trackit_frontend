import Image from "next/image";
import Link from "next/link";
import styles from "./HomeBanner.module.css";

export default function HomeBanner({ tradeCount: _tradeCount, failed: _failed }: { tradeCount?: number; failed?: boolean }) {
  return (
    <section className={styles.banner} aria-labelledby="home-banner-title">
      <div className={styles.copy}>
        <span className={styles.accent} aria-hidden="true" />
        <p className={styles.eyebrow}>TRACKIT / TRADING JOURNEY</p>
        <h1 id="home-banner-title">기록하고, 발견하고, 나만의 전략을 완성하다.</h1>
        <p className={styles.description}>나의 투자 여정을 함께하는 트레이딩 플랫폼, TRAKIT.</p>
        <Link className={styles.cta} href="/workshop">트레이딩 로그 보기 <span aria-hidden="true">→</span></Link>
      </div>
      <div className={styles.mascot} aria-hidden="true">
        <Image src="/images/home-bee.png" alt="" width={347} height={430} priority sizes="347px" />
      </div>
      <div className={styles.ledge} aria-hidden="true" />
    </section>
  );
}
