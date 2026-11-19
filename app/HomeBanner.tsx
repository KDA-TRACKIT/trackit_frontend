import Image from "next/image";
import Link from "next/link";
import styles from "./HomeBanner.module.css";
import type { CSSProperties } from "react";

const BANNER_TITLE = "기록하고, 발견하고, 나만의 전략을 완성하다.";

// Restore the staggered letter wave from intro/ac72671.
function WaveText({ text }: { text: string }) {
  let letterOffset = 0;
  return text.split(/(\s+)/).map((word, wordIndex) => {
    const letters = Array.from(word);
    const offset = letterOffset;
    letterOffset += letters.length;
    if (!word.trim()) return word;

    return (
      <span key={wordIndex} className={styles.waveWord}>
        {letters.map((letter, index) => (
          <span key={index} className={styles.waveLetter} style={{ "--wave-delay": `${(offset + index) * 0.09}s` } as CSSProperties}>
            {letter}
          </span>
        ))}
      </span>
    );
  });
}

export default function HomeBanner() {
  return (
    <section className={styles.banner} aria-labelledby="home-banner-title">
      <div className={styles.copy}>
        <span className={styles.accent} aria-hidden="true" />
        <h1 id="home-banner-title" aria-label={BANNER_TITLE}><span aria-hidden="true"><WaveText text={BANNER_TITLE} /></span></h1>
        <p className={styles.description}>나의 투자 여정을 함께하는 트레이딩 플랫폼, TRACKIT.</p>
        <Link className={styles.cta} href="/workshop">트레이딩 로그 보기 <span aria-hidden="true">→</span></Link>
      </div>
      <div className={styles.mascot} aria-hidden="true">
        <Image src="/home/banner-bee.png" alt="" width={1536} height={1024} preload sizes="(max-width: 700px) 170px, 300px" />
      </div>
      <div className={styles.ledge} aria-hidden="true" />
    </section>
  );
}
