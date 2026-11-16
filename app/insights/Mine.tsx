"use client";
// 공시 (DART, 보유·관심 종목만 보기) + 매매 캘린더 (청산한 포지션의 날짜별 실현손익)
import Link from "next/link";
import { useMemo, useState } from "react";
import { accountPortfolio, orderAccounts } from "../../lib/api/orders";
import { getDisclosures } from "../../lib/api/insights";
import { getPositions, type Position } from "../../lib/api/performance";
import { CardHead, Failed, Loading, MissingKeys, won } from "./parts";
import { useLoad } from "./useLoad";
import { useWatchlist } from "./useWatchlist";

/** 연결한 증권사 계좌들의 보유 종목 코드 (마지막 잔고). 로그인 전·연결 없음이면 빈 목록 */
async function holdingCodes(): Promise<string[]> {
  const accounts = await orderAccounts().catch(() => []);
  const lists = await Promise.all(accounts.map((a) => accountPortfolio(a.id).catch(() => null)));
  return [...new Set(lists.flatMap((p) => p?.positions.map((x) => x.symbol) ?? []))];
}

export function DisclosureList() {
  const [scope, setScope] = useState<"all" | "mine" | "watch">("all");
  const holdings = useLoad("holdings", holdingCodes);
  const wl = useWatchlist();
  const codes = scope === "mine" ? (holdings.data ?? []) : scope === "watch" ? wl.items.filter((i) => !i.exchange).map((i) => i.code) : [];
  // 고른 범위에 종목이 하나도 없으면 전체를 부르지 않고 빈 목록
  const empty = scope !== "all" && codes.length === 0;
  const { data, error, loading, reload } = useLoad(`disclosures-${scope}-${codes.join(",")}`, () => (empty ? Promise.resolve({ items: [], missing: [] }) : getDisclosures(codes)), 5 * 60_000);
  const hasHoldings = (holdings.data?.length ?? 0) > 0;
  const onlyMine = scope !== "all";
  return (
    <section className="ins-card">
      <CardHead title="공시" meta="최근 3일 · 유가·코스닥 상장사">
        <div className="ins-seg" role="radiogroup" aria-label="범위">
          <button type="button" role="radio" aria-checked={scope === "all"} onClick={() => setScope("all")}>
            전체
          </button>
          {hasHoldings && (
            <button type="button" role="radio" aria-checked={scope === "mine"} onClick={() => setScope("mine")}>
              보유 종목 {holdings.data?.length}
            </button>
          )}
          <button type="button" role="radio" aria-checked={scope === "watch"} onClick={() => setScope("watch")}>
            관심 종목{wl.items.length ? ` ${wl.items.length}` : ""}
          </button>
        </div>
      </CardHead>
      {error && !data ? (
        <Failed message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : data.missing.length ? (
        <MissingKeys keys={data.missing} />
      ) : data.items.length === 0 ? (
        <div className="ins-state" style={{ height: 120 }}>
          <p>
            {scope === "watch" && !wl.items.length
              ? "시장 탭에서 관심 종목을 추가해 보세요"
              : onlyMine
                ? `${scope === "mine" ? "보유" : "관심"} 종목의 최근 공시가 없어요`
                : "최근 공시가 없어요"}
          </p>
        </div>
      ) : (
        <ul className={`ins-disc${loading ? " stale" : ""}`}>
          {data.items.map((d) => (
            <li key={d.url}>
              <span className="date">{d.date.slice(5).replace("-", ".")}</span>
              <span className="company">{d.company}</span>
              <a href={d.url} target="_blank" rel="noreferrer" className="title">
                {d.title}
              </a>
              <small>{d.filer}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** UTC ISO → KST YYYY-MM-DD */
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);

export function PnlCalendar() {
  const { data, error, reload } = useLoad("pnl", () => getPositions("CLOSED"));
  // 이번 달(KST)부터
  const [month, setMonth] = useState(() => {
    const t = new Date(Date.now() + 9 * 3_600_000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
  });
  const [picked, setPicked] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Position[]>();
    for (const p of data ?? []) {
      if (!p.closedAt) continue;
      const d = kstDay(p.closedAt);
      map.set(d, [...(map.get(d) ?? []), p]);
    }
    return map;
  }, [data]);

  const prefix = `${month.y}-${String(month.m).padStart(2, "0")}`;
  const first = new Date(Date.UTC(month.y, month.m - 1, 1));
  const daysIn = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`)];
  const pnl = (d: string) => (byDay.get(d) ?? []).reduce((a, p) => a + Number(p.realizedPnl ?? 0), 0);
  const monthDays = [...byDay.keys()].filter((d) => d.startsWith(prefix));
  const total = monthDays.reduce((a, d) => a + pnl(d), 0);
  const wins = monthDays.filter((d) => pnl(d) > 0).length;
  const maxAbs = Math.max(1, ...monthDays.map((d) => Math.abs(pnl(d))));
  const move = (k: number) => {
    setPicked(null);
    setMonth(({ y, m }) => (m + k < 1 ? { y: y - 1, m: 12 } : m + k > 12 ? { y: y + 1, m: 1 } : { y, m: m + k }));
  };
  const sign = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}₩${won(Math.abs(n))}`;

  return (
    <section className="ins-card">
      <CardHead title="매매 캘린더" meta="청산한 거래의 날짜별 실현손익 (수수료·세금 포함)">
        <div className="ins-month">
          <button type="button" onClick={() => move(-1)} aria-label="이전 달">
            ‹
          </button>
          <strong>
            {month.y}.{String(month.m).padStart(2, "0")}
          </strong>
          <button type="button" onClick={() => move(1)} aria-label="다음 달">
            ›
          </button>
        </div>
      </CardHead>
      {error && !data ? (
        error.includes("로그인") ? (
          <div className="ins-state" style={{ height: 160 }}>
            <p>로그인하면 매매 캘린더를 볼 수 있어요</p>
            <Link href="/login">로그인</Link>
          </div>
        ) : (
          <Failed message={error} onRetry={reload} height={300} />
        )
      ) : !data ? (
        <Loading height={300} />
      ) : (
        <>
          <div className="ins-pnl-sum">
            <span>
              이번 달 <strong className={total > 0 ? "up" : total < 0 ? "down" : ""}>{monthDays.length ? sign(total) : "—"}</strong>
            </span>
            <span>
              거래한 날 <strong>{monthDays.length}일</strong>
            </span>
            <span>
              이익 낸 날 <strong>{monthDays.length ? `${wins}일` : "—"}</strong>
            </span>
          </div>
          <div className="ins-pnl">
            {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
              <span key={w} className="wk">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const v = byDay.has(d) ? pnl(d) : null;
              const k = v === null ? 0 : Math.min(1, Math.abs(v) / maxAbs);
              return (
                <button
                  key={d}
                  type="button"
                  className={`day${picked === d ? " on" : ""}${v === null ? " none" : v > 0 ? " up" : v < 0 ? " down" : ""}`}
                  style={v === null ? undefined : { ["--k" as string]: (0.18 + k * 0.62).toFixed(2) }}
                  disabled={v === null}
                  onClick={() => setPicked(picked === d ? null : d)}
                >
                  <span>{Number(d.slice(8))}</span>
                  {v !== null && <small>{Math.abs(v) >= 10_000 ? `${v > 0 ? "+" : "−"}${won(Math.abs(v) / 10_000)}만` : sign(v)}</small>}
                </button>
              );
            })}
          </div>
          {picked && (
            <ul className="ins-pnl-day">
              {(byDay.get(picked) ?? []).map((p) => (
                <li key={p.id}>
                  <Link href={`/workshop?symbol=${p.symbol}&market=${encodeURIComponent(p.market)}`}>{p.symbol}</Link>
                  <span>
                    {Number(p.quantity).toLocaleString("ko-KR")}주 · 평균 {won(Number(p.avgEntryPrice))} → {p.avgExitPrice ? won(Number(p.avgExitPrice)) : "—"}
                  </span>
                  <strong className={Number(p.realizedPnl) > 0 ? "up" : Number(p.realizedPnl) < 0 ? "down" : ""}>{sign(Number(p.realizedPnl ?? 0))}</strong>
                </li>
              ))}
            </ul>
          )}
          {(data?.length ?? 0) === 0 && <p className="ins-missing">아직 청산한 거래가 없어요. 증권사 체결을 불러오면 날짜별로 채워져요 (홈 · 지금 불러오기)</p>}
        </>
      )}
    </section>
  );
}
