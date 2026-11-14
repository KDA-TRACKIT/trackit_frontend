"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const traders = ["차트메이트", "파동노트", "퀀트로그", "모멘텀랩", "트렌드픽", "시그널랩", "마켓노트"];

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
      if (target.current !== null && Math.abs(list.scrollLeft - target.current) < 1) {
        target.current = null;
      }
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
        {traders.map((name) => (
          <li className="trader-card" key={name}>
            <h3><span className="trader-avatar" aria-hidden="true">{name[0]}</span>{name}</h3>
            <p className="trader-return">수익률 00%</p>
            <p>전략이행률 00%</p>
            <p><span className="trader-heart" aria-label="좋아요">♡</span> + 00</p>
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
