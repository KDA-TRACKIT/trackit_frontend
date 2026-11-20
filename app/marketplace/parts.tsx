"use client";
import Link from "next/link";
import PolicyDialog from "../PolicyDialog";
import { POLICY, POLICY_FOOT, POLICY_LEAD, POLICY_TITLE, PURCHASE_NOTICE } from "./policy";
// 전략 마켓 공통 조각: 작은 수익 곡선 · 쪽 번호 · 두 손잡이 범위 슬라이더 · 안내 · 즐겨찾기 · 열람권 구매 · 열람권으로 열기
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { useRouter } from "next/navigation";
import { isFavorite, toggleFavorite, useFavorites } from "../../lib/favorites";
import { startCheckout } from "../../lib/api/payments";
import { errorMessage } from "../../lib/api/client";
import { opened, redeem, unusedPasses, usePasses } from "../../lib/purchases";
import type { Strategy, Trader } from "./data";

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

/** ☆ 즐겨찾기 (이 브라우저에 저장, 새 전략을 올리면 상단 종으로 알림) */
export function FavButton({ id, name, label = false, outlineIcon }: { id: string; name: string; label?: boolean; outlineIcon?: ReactNode }) {
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
      {on ? "★" : outlineIcon ?? "☆"}
      {label && <span>{on ? "즐겨찾기 중" : "즐겨찾기"}</span>}
    </button>
  );
}

/** 열람권 구매 (토스 결제창 → 성공하면 /payments/success 에서 승인 · 열람권 quantity장). 로그인 전이면 로그인으로 */
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
      {busy ? "결제창 여는 중…" : (label ?? "열람권 구매하기")}
    </button>
  );
}

/** 월별 전략 카드의 숫자 줄: 작성 N일 · 매매 N건 · 노트 N개 (숫자가 없는 예전 전략은 요약 문장) */
export function StrategyStatsRow({ strategy, className = "mk-strat-stats" }: { strategy: Strategy; className?: string }) {
  const st = strategy.stats;
  if (!st) return <p>{strategy.summary.replace(/\s*\([^)]*\)/g, "")}</p>;
  const notes = st.stock + st.market;
  return (
    <ul className={className} aria-label="이 달 기록">
      <li>
        작성 <b>{st.days}</b>일
      </li>
      <li>
        매매 <b>{st.trades}</b>건
      </li>
      {/* 올리면 종목 노트 · 증시 메모로 나눠 보여 줌 (title 툴팁은 늦게 뜨거나 안 떠서 직접 그림) */}
      <li className="mk-tip" tabIndex={0} aria-label={`노트 ${notes}개: 종목 노트 ${st.stock}개 · 증시 메모 ${st.market}개`}>
        노트 <b>{notes}</b>개
        <span className="mk-tip-box" role="tooltip">
          종목 노트 {st.stock}개 · 증시 메모 {st.market}개
        </span>
      </li>
    </ul>
  );
}

/**
 * 월별 전략 버튼: 연 전략이면 "열람 중 ✓", 남은 열람권이 있으면 "열람권으로 열기"(확인 뒤 1장 사용), 없으면 "열람권 구매하기"
 */
export function StrategyButton({ trader, strategy, className = "mk-primary", notify }: { trader: Trader; strategy: Strategy; className?: string; notify: (m: string) => void }) {
  const passes = usePasses();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  if (opened(passes, trader.id, strategy.month) || strategy.free) {
    // 연 전략 · 무료 첫 전략: 내용(그은 선 · 매매 · 차트) 보러 가기
    return (
      <Link href={`/marketplace/${trader.id}/strategies/${strategy.month}`} className={`${className} mk-owned`} aria-label={`${strategy.title} 보기`}>
        {strategy.free ? "무료로 보기 ›" : "열람 중 · 보기 ›"}
      </Link>
    );
  }
  const left = unusedPasses(passes, trader.id).length;
  if (left > 0) {
    // 확인은 화면 안 팝업으로 (window.confirm 은 앱 안 브라우저 · 일부 환경에서 바로 '취소'로 처리돼 아무 일도 안 일어났음)
    const open = async () => {
      setAsking(false);
      setBusy(true);
      try {
        await redeem(trader.id, strategy.month, strategy.title);
        notify("전략을 열었어요");
      } catch (e) {
        notify(errorMessage(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
        <button type="button" className={`${className} mk-redeem`} disabled={busy} onClick={() => setAsking(true)}>
          {busy ? "여는 중…" : "열람권으로 열기"}
        </button>
        {asking && (
          <div className="mk-overlay" role="dialog" aria-modal="true" aria-label="열람권으로 열기" onClick={() => setAsking(false)}>
            <div className="mk-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mk-modal-head">
                <strong>열람권으로 열기</strong>
                <button type="button" onClick={() => setAsking(false)} aria-label="닫기">
                  ×
                </button>
              </div>
              <p className="mk-redeem-ask">
                열람권 1장으로 <b>&quot;{strategy.title}&quot;</b> ({strategy.month}) 전략을 열까요?
                <br />
                한 번 바꾸면 다른 전략으로 바꿀 수 없어요. (남은 열람권 {left}장)
              </p>
              <div className="mk-redeem-acts">
                <button type="button" className="mk-ghost" onClick={() => setAsking(false)}>
                  취소
                </button>
                <button type="button" className="mk-primary" onClick={() => void open()}>
                  열기
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  return <PassBuyButton trader={trader} className={className} notify={notify} />;
}

/** 열람권 몇 장 살지 (1~999) + 합계 + 구매 버튼. 미리 여러 장 사 두고 나중에 전략을 골라 열 수 있음 */
/** 한 번에 살 수 있는 열람권 장수 (백엔드 checkout 과 같게) */
const MAX_PASSES = 999;

export function PassBuyBox({ trader, notify }: { trader: Trader; notify: (m: string) => void }) {
  const [qty, setQty] = useState(1);
  /** 직접 입력 중인 글자 (입력 중이 아니면 null) */
  const [draft, setDraft] = useState<string | null>(null);
  /** 구매 전 안내(환불 · 유효기간 · 월 기준)를 확인했는지 */
  const [agreed, setAgreed] = useState(false);
  const policy = useRef<HTMLDialogElement>(null);
  return (
    <div className="mk-passbox">
      <div className="mk-qty" role="group" aria-label="열람권 수량">
        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="한 장 빼기">
          −
        </button>
        {/* 숫자를 눌러 직접 입력 (1~999, 벗어나면 맞춰 줌). 칸 너비는 자릿수에 맞춰 늘어남 */}
        <label className="mk-qty-input" style={{ ["--len" as string]: Math.max(1, (draft ?? String(qty)).length) }}>
          <input
            type="text"
            inputMode="numeric"
            value={draft ?? String(qty)}
            onFocus={(e) => (setDraft(String(qty)), e.currentTarget.select())}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            onBlur={() => {
              const n = Number(draft);
              if (draft && Number.isFinite(n)) setQty(Math.min(MAX_PASSES, Math.max(1, Math.round(n))));
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") (setDraft(null), e.currentTarget.blur());
              if (e.key === "ArrowUp") (e.preventDefault(), setQty((q) => Math.min(MAX_PASSES, q + 1)), setDraft(null));
              if (e.key === "ArrowDown") (e.preventDefault(), setQty((q) => Math.max(1, q - 1)), setDraft(null));
            }}
            aria-label="열람권 장수 (1~999)"
          />
          장
        </label>
        <button type="button" onClick={() => setQty((q) => Math.min(MAX_PASSES, q + 1))} disabled={qty >= MAX_PASSES} aria-label="한 장 더하기">
          +
        </button>
        <b>₩{(trader.price * qty).toLocaleString("ko-KR")}</b>
      </div>
      <label className="mk-agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          {PURCHASE_NOTICE}
          <br />
          {/* label 안의 버튼은 체크박스를 건드리지 않음 (팝업은 body 에 붙어 있어 안을 눌러도 마찬가지) */}
          <button type="button" className="mk-policy-link" aria-haspopup="dialog" onClick={(e) => (e.preventDefault(), policy.current?.showModal())}>
            정책 자세히
          </button>
        </span>
      </label>
      <PurchasePolicyDialog ref={policy} />
      <PassBuyButton trader={trader} quantity={qty} label={qty > 1 ? `열람권 ${qty}장 구매하기` : "열람권 구매하기"} notify={notify} disabled={!agreed} />
    </div>
  );
}

/** '정책 자세히' 팝업: 열람권 구매 정책 (모양은 홈 화면 이용약관 · 환불정책 팝업과 같음) */
function PurchasePolicyDialog({ ref }: { ref: Ref<HTMLDialogElement> }) {
  const titleId = useId();
  return (
    <PolicyDialog ref={ref} titleId={titleId} title={POLICY_TITLE}>
      <p>{POLICY_LEAD}</p>
      {POLICY.map((sec) => (
        <section key={sec.title}>
          <h3>{sec.title}</h3>
          <ul>
            {sec.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </section>
      ))}
      <p>{POLICY_FOOT}</p>
    </PolicyDialog>
  );
}
