"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import HeroGeometry from "./HeroGeometry";
import { setTheme, watchTheme } from "../../lib/theme";
import "./intro-dark.css";

const words = ["차트분석", "매매일지", "전략공부", "전략판매"];
const labels = ["차트분석", "전략구매", "기록", "매매", "전략 판매", "전략 공부"];
const tones = ["#263b61", "#7c8c9e", "#8d7465", "#6a7b73", "#a49883", "#384b69"];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => n * n * (3 - 2 * n);
const style = (v: Record<string, string | number>) => v as CSSProperties;

/** 로그인 전에도 라이트/다크를 바꿀 수 있게 (계정 메뉴와 같은 저장값) */
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.dataset.theme === "dark");
    const stopWatching = watchTheme();
    sync();
    const ob = new MutationObserver(sync);
    ob.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      ob.disconnect();
      stopWatching();
    };
  }, []);
  return <button type="button" className="ti-theme" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "라이트 모드로" : "다크 모드로"} title={dark ? "라이트 모드" : "다크 모드"}>{dark ? "☀" : "☾"}</button>;
}

function Glyph({ kind = 0 }: { kind?: number }) {
  return <span className={`ti-glyph ti-glyph-${kind % 6}`} aria-hidden="true">{kind % 6 === 1 ? "✳" : kind % 6 === 4 ? "↗" : ""}</span>;
}

function Candles({ progress }: { progress: number }) {
  return <svg className="ti-candles" viewBox="0 0 560 250" role="img" aria-label="예시 캔들 차트에 지지선과 추세선이 그려지는 모습">
    {[35, 80, 125, 170, 215].map(y => <g key={y}><line x1="0" y1={y} x2="505" y2={y} stroke="#dce1e7" strokeDasharray="3 5"/><text x="518" y={y + 4} fill="#7b8492" fontSize="10">{(72000 - y * 20).toLocaleString()}</text></g>)}
    {Array.from({ length: 36 }, (_, i) => { const x = i * 13 + 12; const y = 160 - i * 2.8 + Math.sin(i * .65) * 28; const up = i % 3 !== 0; const h = 12 + (i * 7 % 25); return <g key={i} fill={up ? "#b96d64" : "#5d789c"} stroke={up ? "#b96d64" : "#5d789c"}><line x1={x} x2={x} y1={y - 9} y2={y + h + 10}/><rect x={x - 4} y={y} width="8" height={h} rx="1"/><rect x={x - 4} y={237 - (i * 11 % 22)} width="8" height={8 + (i * 11 % 22)} opacity=".18" stroke="none"/></g>; })}
    {["M 15 201 L 460 85", "M 50 105 L 480 105", "M 160 183 L 474 53"].map((d, i) => <path key={d} d={d} fill="none" stroke={i === 1 ? "#8d7465" : "#263b61"} strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - clamp(progress * 3 - i * .55)} />)}
    <circle cx="402" cy="100" r="16" fill="none" stroke="#263b61" opacity={clamp(progress * 3 - 1.5)} strokeDasharray="3 3"/>
  </svg>;
}

export default function Intro() {
  const root = useRef<HTMLElement>(null);
  const hero = useRef<HTMLElement>(null);
  const stack = useRef<HTMLElement>(null);
  const [word, setWord] = useState(0);
  const [motion, setMotion] = useState({ hero: 0, stack: 0, scrolled: false, simple: false });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = (el: HTMLElement | null) => el ? clamp(-el.getBoundingClientRect().top / Math.max(1, el.offsetHeight - window.innerHeight)) : 0;
      setMotion({ hero: progress(hero.current), stack: progress(stack.current), scrolled: window.scrollY > 0, simple: media.matches || window.innerWidth < 760 });
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", scroll); media.addEventListener("change", scroll);
    const timer = window.setInterval(() => { if (!media.matches) setWord(w => (w + 1) % words.length); }, 2600);
    return () => { cancelAnimationFrame(frame); clearInterval(timer); window.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); media.removeEventListener("change", scroll); };
  }, []);

  const stage = motion.stack * 5.95;
  const collapse = ease(clamp((stage - 4.05) / .85));
  const fall = ease(clamp((stage - 4.9) / 1.05));

  return <main className="ti" ref={root}>
    <a className="ti-skip" href="#ti-features">기능 소개로 건너뛰기</a>
    <header className={motion.scrolled ? "ti-nav ti-nav-scrolled" : "ti-nav"}>
      <a href="#ti-top" className="ti-brand">TRACKIT</a>
      <nav className="ti-nav-links" aria-label="주 메뉴">
        <Link href="/">홈</Link>
        <Link href="/workshop">트레이딩 로그</Link>
        <Link href="/archive">아카이브</Link>
        <Link href="/marketplace">전략 쇼핑</Link>
      </nav>
      <div className="ti-nav-right"><ThemeToggle/><Link href="/login" className="ti-nav-cta"><span>↗</span> 시작하기</Link></div>
    </header>

    <section className="ti-hero" id="ti-top" ref={hero}>
      <div className="ti-hero-pin">
        <div className="ti-hero-top"><p className="ti-eyebrow"><i/> THINK. TRADE. TRACK.</p><span className="ti-edition">THE INVESTOR’S WORKSPACE / 01</span></div>
        <div className="ti-hero-copy"><h1 aria-label="당신의 차트분석, 매매일지, 전략공부, 전략판매를 위한 하나의 플랫폼"><span aria-hidden="true">당신의 <span className="ti-word" key={word}>{words[word]}</span>{word === 0 ? "을" : "를"} 위한<br/>하나의 플랫폼<span className="ti-period">.</span></span></h1><div className="ti-hero-aside"><p>분석의 순간부터<br/>나만의 전략이 되는 순간까지.</p><a href="#ti-connect">TRACKIT 알아보기 <span>↘</span></a></div></div>
        <div className="ti-art" aria-hidden="true">
          <div className="ti-art-grid"/>
          <HeroGeometry/>
          <span className="ti-art-caption">EVERY IDEA FINDS ITS PLACE.</span>
        </div>
        <div className="ti-hero-bottom"><span>분석 · 기록 · 학습 · 공유</span><a href="#ti-connect">SCROLL TO EXPLORE <span>↓</span></a><span>하나로 이어지는 투자 경험</span></div>
      </div>
    </section>

    <section className="ti-connect" id="ti-connect">
      <div className="ti-section-index"><span>01 — CONNECTED</span><span>모든 투자의 과정, 한곳에.</span></div>
      <div className="ti-orbit-layout"><h2>흩어져 있던<br/>투자의 순간을,</h2><div className="ti-orbit"><div className="ti-orbit-ring"/><strong>TRACKIT</strong><div className="ti-orbit-spin">{labels.map((label, i) => <div className="ti-orbit-arm" key={label} style={style({ "--angle": `${i * 60 - 90}deg` })}><span>{label}</span></div>)}</div></div><h2>하나로 연결해<br/>나만의 전략으로.</h2></div>
      <p className="ti-connect-note">분석하고, 기록하고, 배우고, 나누세요.<br/>당신의 투자에는 하나의 흐름이 필요하니까.</p>
    </section>

    <section className="ti-stack" ref={stack} id="ti-features">
      <div className="ti-stack-pin">
        <div className="ti-stack-heading" style={{ opacity: motion.simple ? 1 : clamp(1 - collapse * 4) }}><p className="ti-eyebrow">02 — FROM CHART TO INSIGHT</p><h2>당신의 생각이,<br/>기록이 되는 순간.</h2></div>
        <div className="ti-card-scene" style={motion.simple ? undefined : { transform: `translateY(${fall * 24}vh) scale(${1 - collapse * .935}) rotate(${collapse * 90}deg)`, borderRadius: 12, clipPath: collapse > 0 ? `inset(0 ${collapse * 31}% round 12px)` : undefined }}>
          {!motion.simple && collapse > .85 && (
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: 12, backgroundColor: "#384b69", opacity: clamp((collapse - .85) / .15) }} />
          )}
          {tones.map((tone, i) => { const cardStage = i === 0 ? stage : (stage - 0.32 - (i - 1) * 0.62) / 0.74 - 0.25;
            const incoming = i === 0 ? 1 : clamp(cardStage + 0.25);
            const behind = clamp(cardStage / 5) * 5;
            const detail = motion.simple ? 1 : clamp((cardStage - 0.08) * 3.5);
            return <article key={tone} className="ti-demo-card" style={style({ "--tone": tone, opacity: motion.simple ? 1 : 1 - collapse, zIndex: i + 1, transform: motion.simple ? "none" : `translateY(${((1 - ease(incoming)) * 150 + (i + Math.min(0, cardStage)) * 2.6) * (1 - collapse)}%) scale(${1 - behind * .035 * (1 - collapse)}) rotateX(${-behind * 1.4 * (1 - collapse)}deg)`, visibility: !motion.simple && i > 0 && incoming === 0 ? "hidden" : "visible" })} aria-label={`차트 분석 기록 예시 ${i + 1}`}>
            <div className="ti-chart-panel"><div className="ti-card-meta"><span>CHART ANALYSIS</span><span>0{i + 1} / 06</span></div><div className="ti-stock"><strong>나의 차트 분석</strong><span>DEMO · 일봉</span></div><Candles progress={detail}/><p className="ti-analysis-copy" aria-label="당신이 분석한 차트를 AI가 분석하여 기록으로 남길 수 있습니다.">{["당신이 분석한 차트를 AI가 분석하여", "기록으로 남길 수 있습니다."].map((line, lineIndex) => <span className="ti-copy-line" key={line} aria-hidden="true">{Array.from(line).map((letter, letterIndex) => <span key={letterIndex} style={{ opacity: motion.simple ? 1 : clamp(detail * 55 - lineIndex * 21 - letterIndex) }}>{letter}</span>)}</span>)}</p><div className="ti-chart-bottom"><span>차트 위의 생각을 놓치지 않도록</span><span>↗</span></div></div>
            <div className="ti-note-panel"><div className="ti-note-title"><span>✳</span> AI NOTE <small>분석 예시</small></div><div className="ti-note"><div className="ti-note-meta"><span>기록 #{String(i + 1).padStart(3, "0")}</span><span>차트에서 가져옴 ↗</span></div><h3>선으로 남긴 생각,<br/>문장으로 이어지다.</h3><div className="ti-note-content" style={{ opacity: detail }}><p><span>01</span> 상승 흐름을 따라 추세선을 그렸습니다.</p><p><span>02</span> 이전 가격 구간에 수평선을 추가했습니다.</p><p><span>03</span> 관심 구간을 표시해 기록으로 남깁니다.</p></div><div className="ti-note-tags"><span>추세선</span><span>지지 · 저항</span><span>나의 관점</span></div></div><div className="ti-note-footer"><span>한 번의 분석이 다음 투자의 바탕으로.</span><span>↗</span></div></div>
          </article>; })}
        </div>
        <div className="ti-collapse-copy" style={{ opacity: clamp((collapse - .35) / .65) }}><p>작은 기록들이 모여</p><h2>당신만의 투자 언어가 됩니다.</h2><span>↓</span></div>
      </div>
    </section>

    <section className="ti-toolkit" id="ti-toolkit"><div className="ti-arrival" aria-hidden="true"><span/><i/></div><p className="ti-eyebrow">03 — YOUR INVESTMENT TOOLKIT</p><h2>투자의 모든 단계에,<br/>필요한 도구가 있습니다.</h2><div className="ti-toolkit-layout"><aside><span className="ti-outline-label">YOUR WORKFLOW</span><h3>생각을 분석으로.<br/>기록을 전략으로.</h3><p>매일의 작은 판단을 쌓아<br/>더 선명한 나만의 기준을 만드세요.</p></aside><div className="ti-tiles">{labels.map((label, i) => <article className={`ti-tile ti-tile-${i}`} key={label}><div><h3>{label}</h3></div><p>{["차트 위에 나만의 관점을", "다른 투자자의 관점을 만나세요", "생각이 사라지기 전에", "판단과 실행을 한 흐름으로", "경험을 가치 있는 전략으로", "기록에서 발견하는 다음 힌트"][i]}</p><Glyph kind={i}/><small>0{i + 1} / TRACKIT</small></article>)}</div></div></section>

    <section className="ti-ending" id="ti-start"><div className="ti-cta-panel"><p className="ti-eyebrow">YOUR NEXT CHAPTER</p><h2>당신의 다음 투자를,<br/>더 선명하게.</h2><p>오늘의 생각이 내일의 전략이 되도록.<br/>지금, TRACKIT에서 시작하세요.</p><Link href="/workshop" className="ti-big-cta"><span>↗</span> TRACKIT 시작하기</Link><Link href="/login" className="ti-login-link">이미 계정이 있나요? 로그인 ↗</Link></div></section>
    <footer className="ti-footer"><a href="#ti-top" className="ti-brand">TRACKIT</a><span>THINK. TRADE. TRACK.</span><a href="#ti-top">맨 위로 ↑</a></footer>
  </main>;
}
