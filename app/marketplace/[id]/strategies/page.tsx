"use client";
// 트레이더의 전략 전체: 시장 → 섹터별로 묶음 (섹터 안은 최근 것부터). 전략 = 판매자가 끊은 기간 하나. 구독하면 전부 봄
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "../../../SiteHeader";
import { pct, periodLabel, strategiesBySector, strategiesOf, tone, traderById } from "../../data";
import { PassBuyBox, StrategyStatsRow, useNotice } from "../../parts";
import { useFeedback } from "../../../../lib/feedback";
import { LikeButton } from "../../feedback";
import "../../marketplace.css";

export default function StrategiesPage() {
  const { id } = useParams<{ id: string }>();
  const t = traderById(id);
  const { notify, node } = useNotice();
  const fb = useFeedback(id);
  if (!t) {
    return (
      <main className="mk-page">
        <SiteHeader active="marketplace" />
        <div className="mk-wrap">
          <p className="mk-card mk-empty">
            트레이더를 찾을 수 없어요. <Link href="/marketplace">목록으로</Link>
          </p>
        </div>
      </main>
    );
  }
  const groups = strategiesBySector(t);
  const first = strategiesOf(t).find((s) => s.free);

  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap mk-narrow">
        <Link href={`/marketplace/${t.id}`} className="mk-back">
          ‹ {t.name}
        </Link>
        <h1 className="mk-sub-title">
          <b>{t.name}</b>의 전략
        </h1>
        <p className="mk-sub-desc">시장 · 섹터별로 기간을 끊어 올린 전략이에요. 전략마다 그 기간의 매매 기준, 진입 · 청산 기록, 원칙을 지켰는지 회고를 함께 담았어요.</p>
        <div className="mk-passbox-row">
          <PassBuyBox trader={t} notify={notify} />
        </div>
        {/* 시장 → 섹터 → 전략 (최근 것부터) */}
        {groups.map((m) => (
          <div key={m.market} className="mk-market-group">
            <h2 className="mk-market-name">{m.market}</h2>
            {m.sectors.map((g) => (
              <div key={g.sector} id={g.sector} className="mk-sector-group">
                <div className="mk-sector-head">
                  <h3>{g.sector}</h3>
                  <span>전략 {g.list.length}개</span>
                </div>
                <ul className="mk-slist">
                  {g.list.map((s) => (
                    <li key={s.id} className="mk-card mk-srow">
                      <div>
                        <small>
                          {periodLabel(s, t.asOf)}
                          {s.free ? " · 무료" : ""}
                        </small>
                        <strong>
                          <Link href={`/marketplace/${t.id}/strategies/${s.key}`}>{s.title}</Link>
                        </strong>
                        <StrategyStatsRow strategy={s} />
                      </div>
                      <div className="mk-srow-num">
                        <span className={tone(s.ret)}>수익률 {pct(s.ret)}</span>
                        <small>이행률 {s.follow}%</small>
                        <LikeButton trader={t} strategy={s} fb={fb} notify={notify} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
        {first && (
          <div className="mk-card mk-free">
            <div>
              <strong>
                {first.sector} · {periodLabel(first, t.asOf)} · 첫 번째 전략
              </strong>
              <p>처음 공개한 전략은 무료로 볼 수 있어요.</p>
            </div>
            <Link href={`/marketplace/${t.id}/strategies/${first.key}`} className="mk-primary">
              첫 번째 전략 무료로 보기
            </Link>
          </div>
        )}
      </div>
      {node}
    </main>
  );
}
