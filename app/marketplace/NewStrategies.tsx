"use client";
// 전략 마켓 · 새로 올라온 전략 (2026-11-22): 비즈니스 계정이 내 노트에서 올린 전략 (GET /market/strategies, 판매 중인 것만)
//   판매자 · 섹터 · 기간. 아직 성과 숫자가 없어 수익률 · 이행률 칸은 없음 (구독료는 트레이더 단위)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api/client";

type Item = {
  id: string;
  title: string;
  sector: string | null;
  market?: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  seller: { name: string };
};

const day = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, ".") : "");

export default function NewStrategies() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let live = true;
    apiRequest<{ items: Item[] }>("/market/strategies?limit=20", { auth: false })
      .then((d) => live && setItems(d.items ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!items.length) return null;
  return (
    <section className="mk-new">
      <h2>새로 올라온 전략</h2>
      <div className="mk-trader-panel">
        <div className="mk-trader-columns mk-new-cols" aria-hidden="true">
          <span>전략</span>
          <span>판매자</span>
          <span>섹터</span>
          <span>기간</span>
        </div>
        <ul className="mk-new-rows">
          {items.map((s) => (
            <li key={s.id} className="mk-new-row" onClick={() => router.push(`/marketplace/s/${s.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(`/marketplace/s/${s.id}`)}>
              <strong title={s.title}>{s.title}</strong>
              <span>{s.seller.name}</span>
              <span>{[s.market, s.sector].filter(Boolean).join(" · ") || "—"}</span>
              <span>{s.periodStart ? `${day(s.periodStart)} ~ ${day(s.periodEnd)}` : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
