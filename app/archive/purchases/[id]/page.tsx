"use client";
// 전략보관함 · 구독한 트레이더를 누르면 → 그 트레이더 전략 중 가장 최근 것으로 (/archive/purchases/{id}/{전략 번호})
//   전략 상세는 전략 마켓과 같은 화면 (StrategyDetail, 2026-11-21 통일). 예전엔 여기서 달 단위로 따로 그렸음
//   가장 최근 것 = 구독으로 연 달 · 예전에 연 달 · 무료 전략의 달 중 가장 최근 달이 들어 있는 전략
//   구독 기록을 서버에서 다 읽은 뒤에 옮김 (읽기 전에 옮기면 무료 전략으로 잘못 감)
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import SiteHeader from "../../../SiteHeader";
import BeeLoader from "../../../BeeLoader";
import { subscribed, usePasses, usePassesLoaded } from "../../../../lib/purchases";
import { strategiesOf, strategyOf, traderById } from "../../../marketplace/data";
import "../../../marketplace/marketplace.css";
import "../../archive.css";

export default function PurchasedTraderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = traderById(id);
  const passes = usePasses();
  const loaded = usePassesLoaded();
  const target = useMemo(() => {
    if (!t) return null;
    const list = strategiesOf(t);
    const months = [
      ...new Set([
        ...(subscribed(passes, id) ? list.flatMap((s) => s.months) : []),
        ...passes.filter((p) => p.traderId === id && p.used).map((p) => p.used!.month),
        ...list.filter((s) => s.free).flatMap((s) => s.months),
      ]),
    ]
      .sort()
      .reverse();
    return months[0] ? (strategyOf(t, months[0])?.key ?? null) : null;
  }, [passes, id, t]);

  useEffect(() => {
    if (loaded && target) router.replace(`/archive/purchases/${id}/${target}`);
  }, [loaded, target, id, router]);

  return (
    <main className="mk-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap ar-pt">
        <Link href="/archive/purchases" className="ar-pt-back">
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          구독 목록
        </Link>
        {loaded && !target ? (
          <p className="mk-card mk-empty">{t ? "이 트레이더를 구독하면 전략을 볼 수 있어요." : "트레이더를 찾을 수 없어요."}</p>
        ) : (
          <div className="mk-card mk-empty">
            <BeeLoader />
          </div>
        )}
      </div>
    </main>
  );
}
