"use client";
// 아카이브: 구매한 전략과 내가 남긴 매매 일지 · 노트 · 차트 기록을 한곳에서 (목록 · 보드 · 차트)
//   보기 · 검색어는 주소(?view= &q=)에 남겨 뒤로 가기에도 그대로
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import SiteHeader from "../SiteHeader";
import { filterItems, useArchive } from "./items";
import { ViewToggle, type View } from "./parts";
import ListView from "./ListView";
import BoardView from "./BoardView";
import ChartView from "./ChartView";


export default function ArchiveHub() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const view = (["list", "board", "chart"].includes(params.get("view") ?? "") ? params.get("view") : "list") as View;
  const q = params.get("q") ?? "";
  const symbol = params.get("symbol");
  const { items, loading } = useArchive();

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`${path}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  const searched = q ? filterItems(items, { q }) : items;

  return (
    <main className="mk-page ar-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <div className="ar-hub-head">
          <div>
            <h1 className="mk-title">아카이브</h1>
          </div>
          <div className="ar-hub-tools">
            <ViewToggle view={view} onView={(v) => update({ view: v === "list" ? null : v, symbol: null })} />
            <label className="ar-search">
              <Search size={15} />
              <input defaultValue={q} onChange={(e) => update({ q: e.target.value.trim() || null })} placeholder="종목, 전략, 메모 내용 검색" aria-label="아카이브 검색" />
            </label>
            <Link href="/archive/ai" className="ar-ai-btn">
              <Sparkles size={15} />
              AI 전략 만들기
            </Link>
          </div>
        </div>

        {view === "list" && <ListView items={items} q={q} loading={loading} />}
        {view === "board" && <BoardView items={searched} onChart={(s) => update({ view: "chart", symbol: s })} />}
        {view === "chart" && <ChartView key={symbol ?? ""} items={searched} initialSymbol={symbol} />}
      </div>
    </main>
  );
}
