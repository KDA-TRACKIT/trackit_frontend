"use client";
// 트레이더의 월별 전략 전체 (최근 것부터, 쪽 나눔). 열람권을 사서 그 열람권으로 전략 하나를 골라 엶
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import SiteHeader from "../../../SiteHeader";
import { monthLabel, pct, strategiesOf, tone, traderById, won } from "../../data";
import { GradeBadge } from "../../GradeParts";
import { Pager, PassBuyBox, StrategyButton, useNotice } from "../../parts";
import { unusedPasses, usePasses } from "../../../../lib/purchases";
import { useFeedback } from "../../../../lib/feedback";
import { LikeButton } from "../../feedback";
import "../../marketplace.css";

const PER_PAGE = 6;

export default function StrategiesPage() {
  const { id } = useParams<{ id: string }>();
  const t = traderById(id);
  const [page, setPage] = useState(1);
  const { notify, node } = useNotice();
  const passLeft = unusedPasses(usePasses(), id).length;
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
  const list = strategiesOf(t).filter((s) => !s.free);
  const first = strategiesOf(t).find((s) => s.free)!;
  const pages = Math.ceil(list.length / PER_PAGE);
  const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap mk-narrow">
        <Link href={`/marketplace/${t.id}`} className="mk-back">
          ‹ {t.name}
        </Link>
        <h1 className="mk-sub-title">
          <GradeBadge grade={t.grade?.grade} unrated={t.grade?.unrated} small /> <b>{t.name}</b>의 월별 전략
        </h1>
        <p className="mk-sub-desc">한 달의 매매 기준, 진입 · 청산 기록, 원칙을 지켰는지 회고를 함께 담았어요.</p>
        {passLeft > 0 && (
          <p className="mk-pass-bar on">
            남은 열람권 <b>{passLeft}장</b> · 열어 볼 전략의 &quot;열람권으로 열기&quot;를 누르세요
          </p>
        )}
        <div className="mk-passbox-row">
          <PassBuyBox trader={t} notify={notify} />
        </div>
        <ul className="mk-slist">
          {shown.map((s) => (
            <li key={s.id} className="mk-card mk-srow">
              <div>
                <small>{monthLabel(s.month)}</small>
                <strong>{s.title}</strong>
                <p>{s.summary}</p>
              </div>
              <div className="mk-srow-num">
                <span className={tone(s.ret)}>수익률 {pct(s.ret)}</span>
                <small>이행률 {s.follow}%</small>
                <LikeButton trader={t} month={s.month} fb={fb} notify={notify} />
              </div>
              <div className="mk-srow-buy">
                <strong>{won(s.price)}</strong>
                <div className="mk-buyrow">
                  <StrategyButton trader={t} strategy={s} notify={notify} />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mk-card mk-free">
          <div>
            <strong>{monthLabel(first.month)} · 첫 번째 전략</strong>
            <p>처음 공개한 전략은 무료로 볼 수 있어요.</p>
          </div>
          <button type="button" className="mk-primary" onClick={() => notify(`${monthLabel(first.month)} 전략은 곧 무료로 열려요`)}>
            첫 번째 전략 무료로 보기
          </button>
        </div>
        <Pager page={page} pages={pages} onPage={(p) => (setPage(p), window.scrollTo({ top: 0, behavior: "smooth" }))} />
      </div>
      {node}
    </main>
  );
}
