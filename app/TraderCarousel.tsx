"use client";
// 홈 "트레이더 보드": 전략 마켓 트레이더를 가로로 넘겨 보기 (Yoonsojj 님 a03132f 의 슬라이드 · 좌우 버튼을 옮겨 옴)
//   카드: 프로필 · 이름 · 한 달 수익률 · 판매 등급 · 전략 이행률 · 받은 꿀
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useLikeTotals } from "../lib/feedback";
import { useEffect, useRef, useState } from "react";
import { TRADERS, followLabel, listed, oneStock, pct, strategiesOf } from "./marketplace/data";


export default function TraderCarousel() {
  const likeTotals = useLikeTotals();
  const [order, setOrder] = useState("이번 달 인기");
  // 꿀(전략을 산 사람들이 준 합계) 많은 순 10명, 같으면 3개월 수익률 순
  const BOARD = TRADERS.filter(listed).sort((a, b) => {
    if (order === "이행률 높은 순") return (b.follow ?? -1) - (a.follow ?? -1) || b.returns["1m"] - a.returns["1m"];
    if (order === "최근 활동") return (strategiesOf(b)[0]?.start ?? "").localeCompare(strategiesOf(a)[0]?.start ?? "") || b.returns["1m"] - a.returns["1m"];
    return (likeTotals[b.id] ?? 0) - (likeTotals[a.id] ?? 0) || b.returns["1m"] - a.returns["1m"];
  }).slice(0, 10);
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
    <div className="home-leaderboard-content">
      <div className="home-leaderboard-tabs" role="group" aria-label="트레이더 정렬">
        {["이번 달 인기", "이행률 높은 순", "최근 활동"].map((label) => <button type="button" key={label} aria-pressed={order === label} onClick={() => { setOrder(label); target.current = null; track.current?.scrollTo({ left: 0 }); }}>{label}</button>)}
      </div>
    <div className="trader-carousel">
      <ul id="trader-cards" className="trader-grid" ref={track}>
        {BOARD.map((t, index) => (
          <li key={t.id}>
            <Link href={`/marketplace/${t.id}`} className="trader-card">
              <h3>
                <b className="home-trader-rank">{index + 1}</b>
                <span className="home-trader-avatar" aria-hidden="true"><Image src="/home/leaderboard-avatar.svg" alt="" width={30} height={30} /><Image src="/home/leaderboard-avatar-icon.svg" alt="" width={18} height={18} /></span>
                <span>{t.name}</span>
              </h3>
              <span className="home-trader-tag">{t.rule?.name ?? t.styles[0] ?? t.type}</span>
              <div className="home-trader-metrics">
                <div>
                  <p className="home-trader-metric-label">실시간 수익률</p>
                  <strong className={`home-trader-return ${t.returns["1m"] > 0 ? "gain" : t.returns["1m"] < 0 ? "loss" : ""}`}>{oneStock(t, "1m") ? "—" : pct(t.returns["1m"])}</strong>
                </div>
              </div>
              <div className="home-trader-footer">
                <span>이행률 {followLabel(t.follow)}</span>
                <span className="home-trader-honey" aria-label={`받은 꿀 ${likeTotals[t.id] ?? 0}개`}>
                  <Image src="/home/leaderboard-honey.svg" alt="" width={11.42} height={14.34} />
                  {likeTotals[t.id] ?? 0}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="trader-edge trader-edge-prev" hidden={!edges.previous}>
        <button type="button" aria-controls="trader-cards" aria-label="이전 트레이더" onClick={() => move(-1)}>
          <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      <div className="trader-edge trader-edge-next" hidden={!edges.next}>
        <button type="button" aria-controls="trader-cards" aria-label="다음 트레이더" onClick={() => move(1)}>
          <ChevronRight size={22} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </div>
    </div>
  );
}
