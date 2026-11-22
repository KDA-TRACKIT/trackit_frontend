"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

type Step = {
  title: string;
  body: [string, string];
  width: number;
  height: number;
  strokes: { d: string; part?: string; pathLength?: number }[];
};

const steps: Step[] = [
  {
    title: "차트에서 발견",
    body: ["관심 구간에 선을 긋고", "매매 조건을 정해요."],
    width: 20.8,
    height: 20.8,
    strokes: [
      { d: "M0.9 0.9V19.9H19.9" },
      { d: "M3.9 13.9L8.9 8.9L12.9 11.9L19.9 3.9M19.9 8.9V3.9H14.9", part: "chart", pathLength: 1 },
    ],
  },
  {
    title: "노트로 기록",
    body: ["진입과 청산의 이유를", "노트에 남겨요."],
    width: 16.8,
    height: 21.8,
    strokes: [
      { d: "M10.9 0.9V5.9H15.9M0.9 0.9H11.9L15.9 4.9V20.9H0.9V0.9Z" },
      { d: "M3.9 9.9H12.9", part: "note-top", pathLength: 1 },
      { d: "M3.9 13.9H9.9", part: "note-bottom", pathLength: 1 },
    ],
  },
  {
    title: "기록을 전략으로",
    body: ["수익률과 이행률로", "내 매매 기준을 다듬어요."],
    width: 19.8,
    height: 21.8,
    strokes: [
      { d: "M0.9 0.9H18.9M0.9 8.9H18.9M0.9 16.9H18.9" },
      { d: "M5.9 12.9V20.9M5.9 0.9V8.9", part: "slider-right" },
      { d: "M13.9 4.9V12.9", part: "slider-left" },
    ],
  },
  {
    title: "전략을 사고팔기",
    body: ["다른 전략을 구독하고", "내 전략을 판매해요."],
    width: 19.8,
    height: 19.8,
    strokes: [
      { d: "M0.9 4.9H18.9M14.9 8.9L18.9 4.9L14.9 0.9", part: "trade-right" },
      { d: "M18.9 14.9H0.9M4.9 18.9L0.9 14.9L4.9 10.9", part: "trade-left" },
    ],
  },
];

export default function IntroSteps() {
  const listRef = useRef<HTMLOListElement>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setEntered(true);
    }, { threshold: 0.25, rootMargin: "0px 0px -12% 0px" });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.steps} aria-labelledby="intro-steps-title">
      <div className={styles.shell}>
        <h2 id="intro-steps-title">차트 분석부터 전략 거래까지</h2>
        <ol ref={listRef} data-step-motion={entered ? "" : undefined}>
          {steps.map(({ title, body, width, height, strokes }) => (
            <li key={title}>
              <span className={styles.stepIcon} aria-hidden="true">
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {strokes.map(({ d, part, pathLength }) => <path key={d} d={d} data-step-part={part} pathLength={pathLength} />)}
                </svg>
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body[0]}<br />{" "}{body[1]}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
