"use client";
// 트레이더 상세: 소개 · 열람권 구매 · 성과 카드 · 월별 수익률(마우스 올리면 숫자) · 월별 전략(꿀) · 구매자 후기(익명) · 비슷한 트레이더
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { backToList } from "../../../lib/market-list";
import { useState } from "react";
import SiteHeader from "../../SiteHeader";
import { TRADERS, listed, monthLabel, oneStock, pct, sellable, strategiesOf, tone, traderById, wa, won, type Trader } from "../data";
import { CartButton, FavButton, PassBuyBox, StrategyButton, useNotice } from "../parts";
import { GradeBadge } from "../GradeParts";
import HoneyPot from "../../HoneyPot";
import { unusedPasses, usePasses } from "../../../lib/purchases";
import { useFeedback } from "../../../lib/feedback";
import { LikeButton, Reviews } from "../feedback";
import "../marketplace.css";

/** 채널나스닥 → "채널나스닥"과, 원트로그 → "원트로그"와 (따옴표로 감싸고, 마지막 글자가 한글이 아니면 와(과)) */
function withWa(name: string) {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `"${name}"와(과)`;
  return `"${name}"${c % 28 ? "과" : "와"}`;
}

export default function TraderPage() {
  const { id } = useParams<{ id: string }>();
  const t = traderById(id);
  const { notify, node } = useNotice();
  const passLeft = unusedPasses(usePasses(), id).length;
  const fb = useFeedback(id);
  const router = useRouter();
  if (!t) {
    return (
      <main className="mk-page">
        <SiteHeader active="marketplace" />
        <div className="mk-wrap">
          <p className="mk-card mk-empty">
            트레이더를 찾을 수 없어요.{" "}
            <Link href="/marketplace" onClick={(e) => backToList(e, router.push)}>
              목록으로
            </Link>
          </p>
        </div>
      </main>
    );
  }
  const list = strategiesOf(t);
  const first = list[list.length - 1];
  const total = Math.round(t.monthly.reduce((a, m) => a * (1 + m.ret / 100), 1) * 10000 - 10000) / 100;
  // 마지막으로 기록한 달 (성과 카드 설명: "2026년 · 11월까지")
  const [lastYear, lastMonth] = t.monthly[t.monthly.length - 1].month.split("-").map(Number);
  const similar = TRADERS.filter((o) => o.id !== t.id && listed(o) && (o.type === t.type || o.styles.some((s) => t.styles.includes(s)))).slice(0, 4);

  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap">
        <Link href="/marketplace" className="mk-back" onClick={(e) => backToList(e, router.push)}>
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          트레이더 목록
        </Link>

        <div className="mk-hero">
          <section className="mk-card mk-profile">
            <div className="mk-profile-top">
              <span className="mk-avatar" aria-hidden>
                {t.name.slice(0, 1)}
              </span>
              <div>
                <h1>
                  <GradeBadge grade={t.grade?.grade} unrated={t.grade?.unrated} /> {t.name} <span className="mk-like" title="전략을 산 사람들이 준 꿀 합계"><HoneyPot count={fb?.total ?? 0} size={16} /> {fb?.total ?? 0}</span> <FavButton id={t.id} name={t.name} label />
                </h1>
              </div>
            </div>
            <blockquote>“{t.quote}”</blockquote>
            {t.bio.map((b) => (
              <p key={b}>{b}</p>
            ))}
            <div className="mk-tags">
              {[t.type, ...t.indicators, t.market].map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
          </section>

          <aside className="mk-card mk-buy">
            <small>
              <b>{t.name}</b>의 전략 열람권
            </small>
            <strong>
              {won(t.price)} <span>/ 1장 · 전략 1개</span>
            </strong>
            {sellable(t) ? (
              <PassBuyBox trader={t} notify={notify} />
            ) : (
              <p className="mk-stopped">
                {!t.grade || t.grade.unrated
                  ? "아직 판매 등급이 없어 전략 쇼핑에 올라가지 않았어요. 가입 3개월 뒤 비즈니스 계정으로 바꾸고 등급을 받으면 판매가 열려요."
                  : !listed(t)
                    ? "일반 계정으로 바뀌어 전략 쇼핑에서 내려간 트레이더예요. 이미 산 전략은 계속 볼 수 있어요."
                    : `판매 등급이 ${t.grade?.grade}라 새 열람권 판매가 멈췄어요. 이미 산 전략은 계속 볼 수 있어요.`}
              </p>
            )}
            {passLeft > 0 && <p className="mk-pass-left">남은 열람권 {passLeft}장 · 아래 월별 전략에서 골라 여세요</p>}
            <Link href={`/marketplace/${t.id}/strategies/${first.month}`} className="mk-ghost">
              첫 번째 전략 무료로 보기
            </Link>
          </aside>
        </div>

        {/* 시안: 남색 카드 4개 (누적 수익률 · 전략 이행률 · 최대 낙폭 · 구매한 사람) */}
        <div className="mk-kpis-navy">
          <div>
            <span>누적 수익률</span>
            <strong>{pct(total)}</strong>
            <small>{t.since.replace("-", "년 ")}월부터</small>
          </div>
          <div>
            <span>전략 이행률</span>
            <strong>{t.follow}%</strong>
            <small>{t.facts ? `매매 ${t.facts.wins + t.facts.losses}건 기준` : "계획대로 한 비율"}</small>
          </div>
          <div>
            <span>최대 낙폭</span>
            <strong>{pct(t.mdd)}</strong>
            <small>기간 중 가장 크게 빠진 폭</small>
          </div>
          <div>
            <span>구매한 사람</span>
            <strong>{t.buyers.toLocaleString("ko-KR")}명</strong>
            <small>누적 구매자 수</small>
          </div>
        </div>

        <MonthlyChart t={t} />

        <section className="mk-section">
          <div className="mk-section-head">
            <div>
              <h2>월별 전략</h2>
            </div>
            <Link href={`/marketplace/${t.id}/strategies`}>더보기 ›</Link>
          </div>
          <div className="mk-strats">
            {list.slice(0, 3).map((s) => (
              <article key={s.id} className="mk-card mk-strat">
                <small>{monthLabel(s.month)}</small>
                <h3>{s.title}</h3>
                <p>{s.summary.replace(/\s*\([^)]*\)/g, "")}</p>
                <div className="mk-strat-num">
                  <span className={tone(s.ret)}>수익률 {pct(s.ret)}</span>
                  <span>이행률 {s.follow}%</span>
                  <LikeButton trader={t} month={s.month} fb={fb} notify={notify} />
                </div>
                <strong>{won(s.price)}</strong>
                <div className="mk-buyrow">
                  <CartButton trader={t} strategy={s} />
                  <StrategyButton trader={t} strategy={s} className="mk-soft" notify={notify} />
                </div>
              </article>
            ))}
          </div>
          <div className="mk-card mk-free">
            <div>
              <strong>첫 번째 전략({monthLabel(first.month)})은 무료로 볼 수 있어요</strong>
            </div>
            <Link href={`/marketplace/${t.id}/strategies/${first.month}`} className="mk-primary">
              무료로 보기
            </Link>
          </div>
        </section>

        <Reviews trader={t} fb={fb} notify={notify} />

        <section className="mk-section mk-similar">
          <h2>{withWa(t.name)} 비슷한 트레이더</h2>
          <div className="mk-similar-grid">
            {similar.map((o) => (
              <Link key={o.id} href={`/marketplace/${o.id}`} className="mk-card mk-sim">
                <strong>
                  <GradeBadge grade={o.grade?.grade} unrated={o.grade?.unrated} small /> {o.name}
                </strong>
                <p>{o.tagline}</p>
                <span className={oneStock(o, "3m") ? "" : tone(o.returns["3m"])}>3개월 {oneStock(o, "3m") ? "-" : pct(o.returns["3m"])}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
      {node}
    </main>
  );
}

function Kpi({ label, value, tone: t = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mk-kpi">
      <span>{label}</span>
      <strong className={t}>{value}</strong>
    </div>
  );
}

/** 월별 수익률 막대 (해마다 12칸, 마우스를 올리면 그 달 숫자) */
function MonthlyChart({ t }: { t: Trader }) {
  const years = [...new Set(t.monthly.map((m) => m.month.slice(0, 4)))];
  const [year, setYear] = useState(years[years.length - 1]);
  const [hover, setHover] = useState<number | null>(null);
  const byMonth = new Map(t.monthly.filter((m) => m.month.startsWith(year)).map((m) => [Number(m.month.slice(5)), m.ret]));
  const max = Math.max(4, ...t.monthly.map((m) => Math.abs(m.ret)));
  const lim = Math.ceil(max / 2) * 2;
  const W = 760;
  const H = 220;
  const pad = { l: 8, r: 48, t: 14, b: 26 };
  const cw = (W - pad.l - pad.r) / 12;
  const y = (v: number) => pad.t + ((lim - v) / (lim * 2)) * (H - pad.t - pad.b);
  const sum = [...byMonth.values()].reduce((a, v) => a * (1 + v / 100), 1) * 100 - 100;
  return (
    <section className="mk-card mk-chart">
      <div className="mk-chart-head">
        <h2>월별 수익률</h2>
        <span className={`mk-chart-sum ${tone(sum)}`}>
          {year}년 합계 {pct(Math.round(sum * 100) / 100)}
        </span>
        <select value={year} onChange={(e) => (setYear(e.target.value), setHover(null))} aria-label="연도">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
      </div>
      <div className="mk-chart-box" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${year}년 월별 수익률`}>
          {[lim, lim / 2, 0, -lim / 2, -lim].map((v) => (
            <g key={v}>
              <line className={v === 0 ? "zero" : "grid"} x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
              <text className="tick" x={W - pad.r + 8} y={y(v)} dy="0.35em">
                {v > 0 ? "+" : ""}
                {v}%
              </text>
            </g>
          ))}
          {Array.from({ length: 12 }, (_, i) => {
            const m = i + 1;
            const v = byMonth.get(m);
            const x = pad.l + i * cw;
            return (
              <g key={m} onMouseEnter={() => setHover(v === undefined ? null : m)}>
                <rect className={`col ${hover === m ? "on" : ""}`} x={x + 2} y={pad.t} width={cw - 4} height={H - pad.t - pad.b} rx={4} />
                {v !== undefined && <rect className={`bar ${tone(v)}`} x={x + cw * 0.18} width={cw * 0.64} y={Math.min(y(v), y(0))} height={Math.max(Math.abs(y(v) - y(0)), 1.5)} rx={3} />}
                <text className="tick" x={x + cw / 2} y={H - 6} textAnchor="middle">
                  {m}월
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && byMonth.has(hover) && (
          <div className="mk-chart-tip" style={{ left: `${((pad.l + (hover - 0.5) * cw) / W) * 100}%`, top: `${(Math.min(y(byMonth.get(hover)!), y(0)) / H) * 100}%` }}>
            <span>
              {year}.{String(hover).padStart(2, "0")}
            </span>
            <b className={tone(byMonth.get(hover)!)}>{pct(byMonth.get(hover)!)}</b>
          </div>
        )}
      </div>
    </section>
  );
}


