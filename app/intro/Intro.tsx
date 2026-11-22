import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import IntroSnap from "./IntroSnap";
import IntroSteps from "./IntroSteps";
import { ArchivePreview, DashboardPreview, MarketPreview, WorkshopPreview } from "./ProductPreviews";
import styles from "./landing.module.css";

const headline = ["매매를 기록하고,", "전략을 사고팔다."];

// 제목 파도타기 (2026-11-22): '매'부터 한 글자씩 위로 솟았다 내려오고, 첫 줄 '고'가 내려오면 둘째 줄 '전'이 시작.
//   글자마다 같은 길이(WAVE_CYCLE)의 애니메이션에 시작만 늦춰서, 돌 때마다 순서가 그대로 유지됨. 띄어쓰기 · 쉼표 · 마침표는 가만히
const WAVE_STEP = 160; // 다음 글자가 출발하는 간격 (ms)
const WAVE_RISE = 1100; // 한 글자가 솟았다 내려오는 시간 (ms)
const WAVE_PAUSE = 2400; // 둘째 줄이 끝나고 다시 시작하기까지 (ms)
// ⚠ 값을 바꾸면 landing.module.css @keyframes title-wave 의 % (WAVE_RISE ÷ 한 바퀴 6520ms ≈ 16.9%)도 같이
const WAVE_START = 500; // 처음 화면이 뜨고 출발까지 (ms)
const isLetter = (ch: string) => /[가-힣A-Za-z0-9]/.test(ch);
const waveLines = (() => {
  let t = 0;
  const lines = headline.map((line) => {
    let n = 0;
    const chars = [...line].map((ch) => {
      if (!isLetter(ch)) return { ch, delay: null as number | null };
      const delay = t + n * WAVE_STEP;
      n += 1;
      return { ch, delay };
    });
    t += (n - 1) * WAVE_STEP + WAVE_RISE; // 이 줄 마지막 글자가 내려온 때 → 다음 줄 첫 글자 출발
    return chars;
  });
  return { lines, cycle: t + WAVE_PAUSE };
})();
const WAVE_CYCLE = waveLines.cycle;
const orbitLabels = ["차트분석", "기록", "매매", "전략 판매", "전략 구매", "전략 공부"];

const questions = [
  { title: "차트만 보고 있을 때도 노트를 남길 수 있나요?", answer: "투자작업실에서 관심 종목을 열고 차트 옆 노트에 관찰한 구간과 생각을 남길 수 있어요." },
  { title: "이전 매매를 다시 보려면 어디로 가나요?", answer: "홈의 거래기록이나 전략 보관함에서 기록을 열고, 당시의 계획과 매매 결과를 확인할 수 있어요." },
  { title: "전략은 어떻게 사고팔 수 있나요?", answer: "전략 마켓에서 트레이더의 성과를 비교하고 구독할 수 있어요. 내 전략도 등록해 판매할 수 있어요." },
];

function Brand() {
  return (
    <a href="#intro-top" className={styles.brand}>
      <Image src="/home/brand.png" alt="" width={28} height={28} />
      TRACKIT
    </a>
  );
}

export default function Intro() {
  return (
    <div className={styles.landing} id="intro-top">
      <IntroSnap />
      <a className={styles.skip} href="#intro-content">본문으로 건너뛰기</a>
      <header className={styles.header} data-snap="start">
        <div className={styles.shell}>
          <Brand />
          <Link className={styles.button} href="/login">시작하기 <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <main id="intro-content">
        <section className={styles.hero} aria-labelledby="intro-headline">
          <div className={styles.shell}>
            <div className={styles.heroCopy}>
              <h1 id="intro-headline" aria-label={headline.join(" ")} style={{ "--wave-cycle": `${WAVE_CYCLE}ms` } as CSSProperties}>
                {waveLines.lines.map((chars, i) => (
                  <span key={i} className={styles.titleLine} aria-hidden="true">
                    {chars.map(({ ch, delay }, j) =>
                      delay === null ? (
                        ch
                      ) : (
                        <span key={j} className={styles.waveChar} style={{ animationDelay: `${WAVE_START + delay}ms` }}>
                          {ch}
                        </span>
                      ),
                    )}
                  </span>
                ))}
              </h1>
              <p>매매의 이유를 노트에 남기고 내 전략을 판매하세요.<br />{" "}다른 트레이더의 전략도 구독해서 볼 수 있어요.</p>
              <div className={styles.actions}>
                <Link className={styles.button} href="/login">TRACKIT 시작하기 <span aria-hidden="true">↗</span></Link>
                <a className={styles.secondary} href="#intro-features">기능 둘러보기 <span aria-hidden="true">↓</span></a>
              </div>
            </div>
            <div className={styles.heroPreview}><DashboardPreview /></div>
          </div>
        </section>

        <section className={styles.workflow} aria-label="투자 과정 연결" data-snap="start">
          <div className={styles.orbitLayout}>
            <h2>흩어져 있던<br />투자의 순간을,</h2>
            <div className={styles.orbit}>
              <strong>TRACKIT</strong>
              <ul className={styles.orbitSpin}>
                {orbitLabels.map((label, i) => (
                  <li key={label} className={styles.orbitArm} style={{ "--angle": (i * 60 - 90) + "deg" } as CSSProperties}>
                    <span className={styles.orbitBalance}><span className={styles.orbitLabel}>{label}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <p className={styles.orbitHeading}>하나로 연결해<br />나만의 전략으로.</p>
          </div>
        </section>

        <IntroSteps />

        <section className={styles.features} id="intro-features" aria-label="주요 기능">
          <div className={styles.shell}>
            <article className={styles.feature} data-snap="start">
              <WorkshopPreview />
              <div className={styles.featureCopy}>
                <p className={styles.eyebrow}>투자작업실</p>
                <h2>차트를 보던 그 자리에서<br />판단을 남기세요.</h2>
                <p>차트 옆 노트에 종목, 진입 이유, 다시 확인할 가격대를 기록해 두세요. 나중에 같은 차트를 볼 때 판단의 맥락을 되짚을 수 있어요.</p>
              </div>
            </article>

            <article className={`${styles.feature} ${styles.reverseFeature}`} data-snap="start">
              <ArchivePreview />
              <div className={styles.featureCopy}>
                <p className={styles.eyebrow}>전략 보관함</p>
                <h2>구독한 전략을<br />한곳에서 다시 보세요.</h2>
                <p>전략 보관함에서 구독한 트레이더의 전략을 확인하고, 필요한 전략을 다시 열어보세요.</p>
              </div>
            </article>

            <article className={styles.feature} data-snap="start">
              <MarketPreview />
              <div className={styles.featureCopy}>
                <p className={styles.eyebrow}>전략 마켓</p>
                <h2>다른 전략을 살펴보고,<br />내 전략을 판매하세요.</h2>
                <dl className={styles.marketActions}>
                  <div>
                    <dt>트레이더 구독</dt>
                    <dd>수익률, 이행률, 구독료를 비교해 보세요.<br />구독한 트레이더의 전략을 확인할 수 있어요.</dd>
                  </div>
                  <div>
                    <dt>내 전략 판매</dt>
                    <dd>매매 기록으로 만든 전략을 마켓에 등록해 판매하세요.</dd>
                  </div>
                </dl>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="intro-faq-title" data-snap="start">
          <div className={styles.shell}>
            <h2 id="intro-faq-title">자주 묻는 질문</h2>
            <dl>
              {questions.map(({ title, answer }) => (
                <div key={title}><dt>{title}</dt><dd>{answer}</dd></div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className={styles.footer} data-snap="end">
        <div className={styles.shell}>
          <div className={styles.footerAction}>
            <p>첫 매매 노트를 남기거나 전략 마켓을 둘러보세요.</p>
            <Link className={styles.goldButton} href="/login">TRACKIT 시작하기 <span aria-hidden="true">↗</span></Link>
          </div>
          <div className={styles.footerBar}><Brand /><a href="#intro-top">맨 위로 <span aria-hidden="true">↑</span></a></div>
        </div>
      </footer>
    </div>
  );
}
