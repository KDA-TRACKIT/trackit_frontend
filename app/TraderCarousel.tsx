"use client";
// 홈 "트레이더 보드": 전략 쇼핑 트레이더를 가로로 넘겨 보기 (Yoonsojj 님 a03132f 의 슬라이드 · 좌우 버튼을 옮겨 옴)
//   카드는 전략 쇼핑 데이터(예시)로: 3개월 수익률(+ 초록 · − 빨강) · 전략 이행률 · 좋아요, 누르면 트레이더 상세
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TRADERS, pct, tone } from "./marketplace/data";

// 좋아요 많은 순 10명
const BOARD = [...TRADERS].sort((a, b) => b.likes - a.likes).slice(0, 10);

export default function TraderCarousel() {
  const track = useRef<HTMLUListElement>(null);
  const target = useRef<number | null>(null);
  const [edges, setEdges] = useState({ previous: false, next: true });

  useEffect(() => {
    const list = track.current;
    if (!list) return;
    const update = () => {
      const max = list.scrollWidth - list.clientWidth;
      setEdges({ previous: list.scrollLeft > 1, next: list.scrollLeft < max - 1 });
      if (target.current !== null && Math.abs(list.scrollLeft - target.current) < 1) target.current = null;
    };
    const observer = new ResizeObserver(() => {
      target.current = null;
      update();
    });
    observer.observe(list);
    list.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", update);
    };
  }, []);

  /** 카드 한 장씩 (연달아 누르면 목표 위치에서 이어서) */
  function move(direction: number) {
    const list = track.current;
    if (!list || list.children.length < 2) return;
    const [first, second] = list.children;
    const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    const max = list.scrollWidth - list.clientWidth;
    const next = Math.max(0, Math.min(max, (target.current ?? list.scrollLeft) + direction * step));
    target.current = next;
    list.scrollTo({ left: next, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return (
    <div className="trader-carousel">
      <ul id="trader-cards" className="trader-grid" ref={track}>
        {BOARD.map((t) => (
          <li key={t.id}>
            <Link href={`/marketplace/${t.id}`} className="trader-card">
              <h3>
                <span className="trader-avatar" aria-hidden="true">
                  {t.name[0]}
                </span>
                {t.name}
              </h3>
              <p>
                3개월 수익률 <b className={tone(t.returns["3m"]) === "gain" ? "up" : tone(t.returns["3m"]) === "loss" ? "down" : ""}>{pct(t.returns["3m"])}</b>
              </p>
              <p>
                전략 이행률 <b>{t.follow}%</b>
              </p>
              <p>
                <span className="trader-heart" aria-label="좋아요">
                  ♥
                </span>{" "}
                {t.likes}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="trader-edge trader-edge-prev" hidden={!edges.previous}>
        <button type="button" aria-controls="trader-cards" aria-label="이전 트레이더" onClick={() => move(-1)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="trader-edge trader-edge-next" hidden={!edges.next}>
        <button type="button" aria-controls="trader-cards" aria-label="다음 트레이더" onClick={() => move(1)}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
