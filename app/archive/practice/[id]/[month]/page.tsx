"use client";
// 전략보관함 · 연습하기: 연 전략(열람권 · 무료)으로 "먼저 판단해 보기"
//   판매자가 처음 산 날 전까지의 차트만 보고 매수 / 관망을 고른 뒤, 판매자의 판단 · 결과와 비교
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import SiteHeader from "../../../../SiteHeader";
import { opened, usePasses } from "../../../../../lib/purchases";
import { monthLabel, strategiesOf, traderById } from "../../../../marketplace/data";
import { GradeBadge } from "../../../../marketplace/GradeParts";
import GuessFirst, { useDark, type SimDetail } from "../../../../marketplace/GuessFirst";
import { fetchStrategyMonth } from "../../../../../lib/strategy-data";
import "../../../../marketplace/marketplace.css";
import "../../../archive.css";
import BeeLoader from "../../../../BeeLoader";

export default function PracticePage() {
  const { id, month } = useParams<{ id: string; month: string }>();
  const t = traderById(id);
  const passes = usePasses();
  const dark = useDark();
  const [detail, setDetail] = useState<{ id: string; data: SimDetail | null } | null>(null);
  // 서버가 열람권을 확인하고 그 달 것만 줌. 열람권 목록이 늦게 와도 다시 받게 key 에 넣음
  const key = `${id}/${month}/${!!t && opened(passes, t.id, month)}`;

  useEffect(() => {
    let cancelled = false;
    fetchStrategyMonth(id, month)
      .then((data) => !cancelled && setDetail({ id: key, data }))
      .catch(() => !cancelled && setDetail({ id: key, data: null }));
    return () => {
      cancelled = true;
    };
  }, [id, month, key]);

  const s = t ? strategiesOf(t).find((x) => x.month === month) : undefined;
  const unlocked = !!t && !!s && (!!s.free || opened(passes, t.id, month));
  const m = detail?.id === key ? detail.data?.months.find((x) => x.month === month) : undefined;
  const market = detail?.data?.market;
  const cur = (n: number) => (market === "US" ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : `${n.toLocaleString("ko-KR")}원`);
  const canPlay = !!m && m.trades.some((tr) => tr.code === m.symbol.code);

  return (
    <main className="mk-page ar-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <nav className="ar-crumb">
          <Link href="/archive">전략보관함</Link> / <Link href="/archive/purchases">구매한 전략</Link> / <b>연습하기</b>
        </nav>
        <h1 className="mk-title">{t && s ? <>{t.name} <GradeBadge grade={t.grade?.grade} unrated={t.grade?.unrated} small /> {`의 ${monthLabel(month)} 전략 · 연습하기`}</> : "연습하기"}</h1>

        {!t || !s ? (
          <p className="mk-card mk-empty">전략을 찾을 수 없어요.</p>
        ) : !unlocked ? (
          <p className="mk-card mk-empty">
            열람권으로 연 전략만 연습할 수 있어요. <Link href={`/marketplace/${t.id}/strategies/${month}`}>전략 보러 가기 ›</Link>
          </p>
        ) : detail?.id !== key ? (
          <div className="mk-card mk-empty"><BeeLoader /></div>
        ) : !canPlay ? (
          <p className="mk-card mk-empty">이 달 전략에는 연습할 매매가 없어요.</p>
        ) : (
          <GuessFirst m={m!} dark={dark} currency={market === "US" ? "USD" : "KRW"} cur={cur} />
        )}

        {t && s && unlocked && (
          <p className="ar-practice-foot">
            <Link href={`/marketplace/${t.id}/strategies/${month}`}>전략 전체 보기 ›</Link>
          </p>
        )}
      </div>
    </main>
  );
}
