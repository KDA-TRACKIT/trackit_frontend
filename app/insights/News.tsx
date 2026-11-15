"use client";
// 뉴스: 국내 경제·증권 뉴스 제목 (연합뉴스·한국경제·매일경제 RSS, 3분마다). 본문은 원문 사이트에서
//   전체 · 종목 뉴스(제목에 상장사가 나온 것) · 관심 종목
import Link from "next/link";
import { useMemo, useState } from "react";
import { getNews, type NewsItem } from "../../lib/api/insights";
import { CardHead, Failed, Loading } from "./parts";
import { useLoad } from "./useLoad";
import { useWatchlist } from "./useWatchlist";

const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString();
const todayKst = () => kst(new Date().toISOString()).slice(0, 10);

function when(iso: string, today: string) {
  const k = kst(iso);
  return k.slice(0, 10) === today ? k.slice(11, 16) : `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))} ${k.slice(11, 16)}`;
}

type Scope = "all" | "stocks" | "watch";

export default function News() {
  const { data, error, loading, reload } = useLoad("news", getNews, 3 * 60_000);
  const wl = useWatchlist();
  const [scope, setScope] = useState<Scope>("all");
  const [source, setSource] = useState<string | null>(null);
  const [today] = useState(todayKst);
  const watch = useMemo(() => new Set(wl.items.map((i) => i.code)), [wl.items]);

  const sources = [...new Set((data?.items ?? []).map((i) => i.source))];
  const items = (data?.items ?? []).filter(
    (i: NewsItem) =>
      (!source || i.source === source) && (scope === "all" || (scope === "stocks" ? i.stocks.length > 0 : i.stocks.some((s) => watch.has(s.code)))),
  );

  return (
    <section className="ins-card">
      <CardHead title="뉴스" meta="경제·증권 · 3분마다">
        <div className="ins-seg" role="radiogroup" aria-label="범위">
          {(
            [
              ["all", "전체"],
              ["stocks", "종목 뉴스"],
              ["watch", `관심 종목${wl.items.length ? ` ${wl.items.length}` : ""}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={scope === k} onClick={() => setScope(k)}>
              {label}
            </button>
          ))}
        </div>
      </CardHead>
      {sources.length > 1 && (
        <div className="ins-filters">
          <button type="button" aria-pressed={!source} onClick={() => setSource(null)}>
            모든 언론사
          </button>
          {sources.map((s) => (
            <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(source === s ? null : s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {error && !data ? (
        <Failed message={error} onRetry={reload} height={240} />
      ) : !data ? (
        <Loading height={240} />
      ) : items.length === 0 ? (
        <div className="ins-state" style={{ height: 160 }}>
          <p>{scope === "watch" ? (wl.items.length ? "관심 종목이 나온 최근 뉴스가 없어요" : "시장 탭에서 관심 종목을 추가해 보세요") : "뉴스가 없어요"}</p>
        </div>
      ) : (
        <ul className={`ins-news${loading ? " stale" : ""}`}>
          {items.map((n) => (
            <li key={n.id}>
              <span className="time">{when(n.publishedAt, today)}</span>
              <div className="body">
                <a href={n.url} target="_blank" rel="noreferrer" className="title">
                  {n.title}
                </a>
                <div className="tags">
                  <small>{n.source}</small>
                  {n.stocks.map((s) => (
                    <Link
                      key={s.code}
                      className={`stock${watch.has(s.code) ? " on" : ""}`}
                      href={`/workshop?symbol=${s.code}&name=${encodeURIComponent(s.name)}&market=${encodeURIComponent(s.market)}`}
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.failed.length > 0 && <p className="ins-missing">못 받아 온 곳: {data.failed.join(", ")}</p>}
    </section>
  );
}
