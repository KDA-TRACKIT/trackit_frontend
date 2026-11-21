"use client";
// 트레이더 상세: 소개 · 구독 구매 · 성과 카드 · 월별 수익률(마우스 올리면 숫자) · 전략(시장 → 섹터별, 꿀) · 구매자 후기(익명)
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { backToList } from "../../../lib/market-list";
import { useState } from "react";
import SiteHeader from "../../SiteHeader";
import { monthLabel, pct, periodLabel, sellable, strategiesBySector, strategiesOf, tone, traderById, wa, won, type Trader } from "../data";
import { FavButton, PassBuyBox, StrategyStatsRow, useNotice } from "../parts";
import HoneyPot from "../../HoneyPot";
import { usePasses } from "../../../lib/purchases";
import { useFeedback } from "../../../lib/feedback";
import { LikeButton, Qna, Reviews } from "../feedback";
import { useMyTrader, useSubscriberCounts } from "../../../lib/my-trader";
import "../marketplace.css";

export default function TraderPage() {
  const { id } = useParams<{ id: string }>();
  const t = traderById(id);
  const { notify, node } = useNotice();
  const passes = usePasses();
  // 수익률: 구독을 산 적 없으면 계좌 누적 수익률(지금까지), 샀으면 전략 직결 수익률(전략대로 한 매매만)
  const bought = passes.some((p) => p.traderId === id);
  const fb = useFeedback(id);
  const router = useRouter();
  // 내가 올린 전략인지 (내 전략 표시 · 구독 버튼 숨김) · 지금 구독 중인 사람 수
  const own = useMyTrader() === id;
  const subscribers = useSubscriberCounts();
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
  // 전략 직결 = 달별 전략 수익률을 이어 붙인 값, 누적 = 계좌 수익 곡선(전체 기간 · 지금까지)
  const linkedTotal = Math.round(t.monthly.reduce((a, m) => a * (1 + m.ret / 100), 1) * 10000 - 10000) / 100;
  const total = bought ? linkedTotal : t.returns.all;
  // 마지막으로 기록한 달 (성과 카드 설명: "2026년 · 11월까지")
  const [lastYear, lastMonth] = t.monthly[t.monthly.length - 1].month.split("-").map(Number);

  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap">
        <Link href="/marketplace" className="mk-back" onClick={(e) => backToList(e, router.push)}>
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          트레이더 목록
        </Link>

        {/* 맨 위 한 장 카드: 왼쪽 프로필 | 오른쪽 구독, 두 칸 세로 가운데 (Figma '마켓 / 트레이더 소개 카드') */}
        <div className="mk-card mk-hero">
          <section className="mk-profile">
            <div className="mk-profile-top">
              <span className="mk-avatar" aria-hidden>
                {t.name.slice(0, 1)}
              </span>
              <div className="mk-profile-who">
                <div className="mk-profile-name">
                  <h1>{t.name}</h1>
                  {own ? (
                    <span className="mk-mine">내 전략</span>
                  ) : (
                    <FavButton
                      id={t.id}
                      name={t.name}
                      outlineIcon={<Image src="/marketplace/favorite-star.svg" alt="" width={20} height={20} />}
                      onIcon={<Image src="/marketplace/favorite-star-on.svg" alt="" width={20} height={20} />}
                    />
                  )}
                </div>
                <div className="mk-profile-meta">
                  <span className="mk-like" title="전략을 산 사람들이 준 꿀 합계">
                    <HoneyPot count={fb?.total ?? 0} size={16} /> {fb?.total ?? 0}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="mk-subs" title="지금 구독 중인 사람 수">
                    구독자 {subscribers ? `${(subscribers[t.id] ?? 0).toLocaleString("ko-KR")}명` : "…"}
                  </span>
                </div>
              </div>
            </div>
            {(t.quote || t.bio.length > 0) && (
              <div className="mk-profile-intro">
                {t.quote && <blockquote>“{t.quote}”</blockquote>}
                {t.bio.map((b) => (
                  <p key={b}>{b}</p>
                ))}
              </div>
            )}
            <div className="mk-tags">
              {[t.type, ...t.indicators, t.market].map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
          </section>

          <aside className="mk-buy">
            <small>
              <b>{t.name}</b> 월 구독
            </small>
            <strong>
              {won(t.price)} <span>/ 30일 · 전략 전체</span>
            </strong>
            {sellable(t) ? (
              <PassBuyBox trader={t} notify={notify} />
            ) : (
              <p className="mk-stopped">
                지금은 구독을 받지 않는 트레이더예요.
              </p>
            )}
            <Link href={`/marketplace/${t.id}/strategies/${first.key}`} className="mk-ghost">
              첫 번째 전략 무료로 보기
            </Link>
          </aside>
        </div>

        {/* 남색 카드: 누적 수익률 · 전략 이행률 · 최대 낙폭 (등급 · 일관성은 등급제와 함께 뺌) */}
        <div className="mk-kpis-navy">
          <div>
            <span title={bought ? "구독한 전략대로 한 매매만 모은 수익률" : "처음부터 지금까지 쌓인 수익률 (구독하면 전략 직결 수익률로 보여요)"}>{bought ? "전략 직결 수익률" : "누적 수익률"}</span>
            <strong>{pct(total)}</strong>
          </div>
          <div>
            <span title={t.facts ? `매매 ${t.facts.wins + t.facts.losses}건 기준` : "계획대로 한 비율"}>전략 이행률</span>
            <strong>{t.follow}%</strong>
          </div>
          <div>
            <span title="기간 중 가장 크게 빠진 폭">최대 낙폭</span>
            <strong>{pct(t.mdd)}</strong>
          </div>
        </div>

        <MonthlyChart t={t} />

        <section className="mk-section">
          <div className="mk-section-head">
            <h2>전략</h2>
            <Link href={`/marketplace/${t.id}/strategies`}>전체 {list.length}개 ›</Link>
          </div>
          {/* '전략' 아래 내용은 한 칸 들여 써서 '전략'에 묶여 보이게: 시장 → 섹터 → 전략 카드(섹터마다 최근 3개, 나머지는 더보기) → 무료 첫 전략 */}
          <div className="mk-section-body">
            {strategiesBySector(t).map((m) => (
              <div key={m.market} className="mk-market-group">
                <h3 className="mk-market-name">{m.market}</h3>
                {m.sectors.map((g) => (
                  <div key={g.sector} className="mk-sector-group">
                    <div className="mk-sector-head">
                      <h4>{g.sector}</h4>
                      <span>전략 {g.list.length}개</span>
                      {g.list.length > 3 && <Link href={`/marketplace/${t.id}/strategies#${encodeURIComponent(g.sector)}`}>더보기 ›</Link>}
                    </div>
                    <div className="mk-strats">
                      {g.list.slice(0, 3).map((s) => (
                        <article key={s.id} className="mk-card mk-strat">
                          <small>{periodLabel(s, t.asOf)}</small>
                          <h3>
                            <Link href={`/marketplace/${t.id}/strategies/${s.key}`}>{s.title}</Link>
                          </h3>
                          <StrategyStatsRow strategy={s} />
                          <div className="mk-strat-num">
                            <span className={tone(s.ret)}>수익률 {pct(s.ret)}</span>
                            <span>이행률 {s.follow}%</span>
                            <LikeButton trader={t} strategy={s} fb={fb} notify={notify} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div className="mk-card mk-free">
              <div>
                <strong>첫 번째 전략({first.sector} · {periodLabel(first, t.asOf)})은 무료로 볼 수 있어요</strong>
              </div>
              <Link href={`/marketplace/${t.id}/strategies/${first.key}`} className="mk-primary">
                무료로 보기
              </Link>
            </div>
          </div>
        </section>

        <Reviews trader={t} fb={fb} notify={notify} />

        <Qna trader={t} fb={fb} notify={notify} />
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


