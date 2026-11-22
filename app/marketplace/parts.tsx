"use client";
import Link from "next/link";
// 전략 마켓 공통 조각: 작은 수익 곡선 · 쪽 번호 · 두 손잡이 범위 슬라이더 · 안내 · 즐겨찾기 · 월 구독
import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isFavorite, toggleFavorite, useFavorites } from "../../lib/favorites";
import { startCheckout } from "../../lib/api/payments";
import { errorMessage } from "../../lib/api/client";
import { opened, subscribed, subscriptionEnd, usePasses } from "../../lib/purchases";
import type { Strategy, Trader } from "./data";
import { useMyTrader } from "../../lib/my-trader";
import BeeLoader from "../BeeLoader";

/** 누적 수익 곡선 (월 수익률을 이어 붙임). 끝이 위면 초록, 아래면 빨강 */
/**
 * 수익률 추이 (고른 기간의 날마다 평가금, 기간 시작 대비 %). 0% 기준선 위는 초록 면, 아래는 빨강 면
 *   아주 작은 흔들림이 과장되지 않게 세로 폭은 최소 ±1%
 */
export function Spark({ equity, w = 160, h = 46 }: { equity: number[]; w?: number; h?: number }) {
  // 평가금 → 기간 시작 대비 %
  // equity[0] 은 기간 직전 종가(기준), 그래프는 그 뒤 고른 기간의 날만 — 끝 값이 목록의 기간 수익률과 같음
  const days = equity.slice(1);
  const acc = days.length > 1 ? days.map((e) => (e / equity[0] - 1) * 100) : days.length === 1 ? [(days[0] / equity[0] - 1) * 100, (days[0] / equity[0] - 1) * 100] : [0, 0];
  const lo = Math.min(-1, ...acc);
  const hi = Math.max(1, ...acc);
  const pad = 4;
  const x = (k: number) => pad + (k / Math.max(acc.length - 1, 1)) * (w - pad * 2);
  const y = (v: number) => pad + ((hi - v) / (hi - lo)) * (h - pad * 2);
  const line = acc.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const zero = y(0);
  const area = `${line}L${x(acc.length - 1).toFixed(1)},${zero.toFixed(1)}L${x(0).toFixed(1)},${zero.toFixed(1)}Z`;
  const end = acc[acc.length - 1];
  // 줄마다 따로 자르는 영역 id (같은 화면에 여러 개)
  const id = `sp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={`mk-spark ${end >= 0 ? "gain" : "loss"}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        {/* 0% 위 · 아래를 잘라 위는 초록, 아래는 빨강으로 칠함 */}
        <clipPath id={`${id}u`}>
          <rect x={0} y={0} width={w} height={zero} />
        </clipPath>
        <clipPath id={`${id}d`}>
          <rect x={0} y={zero} width={w} height={h - zero} />
        </clipPath>
      </defs>
      <path d={area} className="area up" clipPath={`url(#${id}u)`} />
      <path d={area} className="area down" clipPath={`url(#${id}d)`} />
      <line x1={pad} x2={w - pad} y1={zero} y2={zero} className="base" />
      <path d={line} className="ln up" clipPath={`url(#${id}u)`} />
      <path d={line} className="ln down" clipPath={`url(#${id}d)`} />
      <circle cx={x(acc.length - 1)} cy={y(end)} r={3} className="dot" />
    </svg>
  );
}

export function Pager({ page, pages, onPage, doubleChevron = false }: { page: number; pages: number; onPage: (p: number) => void; doubleChevron?: boolean }) {
  if (pages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return (
    <nav className="mk-pager" aria-label="쪽 이동">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="이전 쪽">
        {doubleChevron ? "«" : "‹"}
      </button>
      {nums.map((n) => (
        <button key={n} type="button" className={n === page ? "on" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>
          {n}
        </button>
      ))}
      <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="다음 쪽">
        {doubleChevron ? "»" : "›"}
      </button>
    </nav>
  );
}

/** 두 손잡이 범위 (아래 · 위) */
export function Range2({ min, max, step, value, onChange, format, label }: { min: number; max: number; step: number; value: [number, number]; onChange: (v: [number, number]) => void; format: (n: number) => string; label: string }) {
  const [lo, hi] = value;
  const p = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div className="mk-range">
      <span className="mk-range-label">{label}</span>
      <div className="mk-range-track" style={{ ["--lo" as string]: `${p(lo)}%`, ["--hi" as string]: `${p(hi)}%` }}>
        <input type="range" min={min} max={max} step={step} value={lo} aria-label={`${label} 최소`} onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} />
        <input type="range" min={min} max={max} step={step} value={hi} aria-label={`${label} 최대`} onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])} />
      </div>
      <b>
        {format(lo)} ~ {format(hi)}
      </b>
    </div>
  );
}

/** 결제가 아직 없어서 누르면 잠깐 뜨는 안내 */
export function useNotice() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="mk-toast" role="status">
      {msg}
    </div>
  ) : null;
  return { notify: setMsg, node };
}

/** ☆ 즐겨찾기 (이 브라우저에 저장, 새 전략을 올리면 상단 종으로 알림). 그림은 Figma '즐겨찾기 별'(미선택 outlineIcon / 선택 onIcon) */
export function FavButton({ id, name, label = false, outlineIcon, onIcon }: { id: string; name: string; label?: boolean; outlineIcon?: ReactNode; onIcon?: ReactNode }) {
  const favs = useFavorites();
  const on = isFavorite(favs, id);
  return (
    <button
      type="button"
      className={`mk-fav${on ? " on" : ""}${label ? " label" : ""}`}
      aria-pressed={on}
      aria-label={on ? `${name} 즐겨찾기 해제` : `${name} 즐겨찾기`}
      title={on ? "즐겨찾기 해제" : "즐겨찾기 (새 전략을 올리면 알려 드려요)"}
      onClick={(e) => {
        // 줄 전체가 링크라서 누르면 이동하지 않게
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(id, name);
      }}
    >
      {on ? onIcon ?? "★" : outlineIcon ?? "☆"}
      {label && <span>{on ? "즐겨찾기 중" : "즐겨찾기"}</span>}
    </button>
  );
}

/** 월 구독 결제 (토스 결제창 → 성공하면 /payments/success 에서 승인 → 30일 구독). 로그인 전이면 로그인으로 */
export function PassBuyButton({
  trader,
  quantity = 1,
  className = "mk-primary",
  label,
  notify,
  disabled = false,
}: {
  trader: Trader;
  quantity?: number;
  className?: string;
  label?: string;
  notify: (m: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await startCheckout({ type: "sample", traderId: trader.id, traderName: trader.name, price: trader.price, quantity });
          if (r.needLogin) router.push("/login");
          else if (r.canceled) notify("결제를 취소했어요");
        } catch (e) {
          notify(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "결제창 여는 중…" : (label ?? "구독하기")}
    </button>
  );
}

/** 전략 카드의 숫자 줄: 작성 N일 · 매매 N건 · 메모 N개 (숫자가 없는 예전 전략은 요약 문장) */
export function StrategyStatsRow({ strategy, className = "mk-strat-stats" }: { strategy: Strategy; className?: string }) {
  const st = strategy.stats;
  if (!st) return <p>{strategy.summary.replace(/\s*\([^)]*\)/g, "")}</p>;
  // 메모 = 매매 메모(매매마다 하나) + 종목 노트 + 증시 메모 + 복기
  const review = Math.max(0, strategy.memos - st.trades - st.stock - st.market);
  const parts = `매매 메모 ${st.trades}개 · 종목 노트 ${st.stock}개 · 증시 메모 ${st.market}개${review ? ` · 복기 ${review}개` : ""}`;
  return (
    <ul className={className} aria-label="이 전략의 기록">
      <li>
        작성 <b>{st.days}</b>일
      </li>
      <li>
        매매 <b>{st.trades}</b>건
      </li>
      {/* 올리면 매매 메모 · 종목 노트 · 증시 메모 · 복기로 나눠 보여 줌 (title 툴팁은 늦게 뜨거나 안 떠서 직접 그림) */}
      <li className="mk-tip" tabIndex={0} aria-label={`메모 ${strategy.memos}개: ${parts}`}>
        메모 <b>{strategy.memos}</b>개
        <span className="mk-tip-box" role="tooltip">
          {parts}
        </span>
      </li>
    </ul>
  );
}

/** 전략 버튼: 구독 중이거나 무료 첫 전략이면 "보기", 아니면 "구독하기" */
export function StrategyButton({ trader, strategy, className = "mk-primary", notify }: { trader: Trader; strategy: Strategy; className?: string; notify: (m: string) => void }) {
  const passes = usePasses();
  const my = useMyTrader();
  if (my === undefined) return <BeeLoader size="sm" />;
  if (my === trader.id || opened(passes, trader.id, strategy.key) || strategy.free) {
    return (
      <Link href={`/marketplace/${trader.id}/strategies/${strategy.key}`} className={`${className} mk-owned`} aria-label={`${strategy.title} 보기`}>
        {my === trader.id ? "내 전략 보기 ›" : strategy.free ? "무료로 보기 ›" : "보기 ›"}
      </Link>
    );
  }
  return <PassBuyButton trader={trader} className={className} notify={notify} />;
}

/**
 * 월 구독 상자: (구독 중이면 끝나는 날) + 구독 버튼. 결제 1번 = 30일
 *   내가 올린 전략이면 구독 버튼 없이 '내 전략' 안내 (서버 결제 준비에서도 막음). 내 트레이더인지 확인하는 동안은 로딩
 */
export function PassBuyBox({ trader, notify }: { trader: Trader; notify: (m: string) => void }) {
  const passes = usePasses();
  const my = useMyTrader();
  if (my === undefined) return <BeeLoader size="sm" />;
  if (my === trader.id) {
    return (
      <div className="mk-passbox">
        <Link href="/mypage/sales" className="mk-ghost">
          구독 관리 ›
        </Link>
      </div>
    );
  }
  const end = subscriptionEnd(passes, trader.id);
  const active = subscribed(passes, trader.id);
  return (
    <div className="mk-passbox">
      {active && end && <p className="mk-sub-until">{end.toLocaleDateString("ko-KR")}까지 구독 중</p>}
      <PassBuyButton trader={trader} label={active ? "30일 연장하기" : "구독하기"} notify={notify} />
    </div>
  );
}
