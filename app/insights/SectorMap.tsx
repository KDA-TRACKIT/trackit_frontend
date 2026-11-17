"use client";
// 섹터맵: 칸 넓이 = 시가총액, 색 = 등락률 (오르면 빨강, 내리면 파랑)
// 업종 이름을 누르면 그 업종만 크게, 종목을 누르면 작업실에서 그 종목을 연다 (미국은 작업실 차트가 아직 없어 링크 없음)
// 코스피 · 코스닥 · S&P 500 · 나스닥 100 · 다우 30
//   미국 지수는 finviz 맵처럼: 섹터 → 세부 업종(작은 이름표) → 종목, 칸에는 티커와 등락률 (이름은 마우스를 올리면)
import { memoAttr } from "../../lib/memo-target";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../lib/api/client";
import { getSectorMap, isUsMarket, kiwoomTicker, type SectorMap as SectorMapData, type SectorMarket, type SectorStock } from "../../lib/api/insights";
import { squarify, type Rect } from "../../lib/treemap";
import { MARKET_NAME, money, price } from "./parts";
import type { UsChartTarget } from "./UsChart";

const HEIGHT = 560;
/** 종목이 많은 S&P 500 · 코스피 · 코스닥은 더 높게 (칸이 커져야 티커가 보임) */
const TALL = 760;
const HEADER = 22;
/** 이 폭·높이보다 작은 칸은 글자를 안 쓴다 */
/** 이름을 쓸 최소 칸 · 글자 크기 */
const LABEL_MIN = { w: 16, h: 10, font: 7 };
/** 세부 업종 이름표 높이 (이보다 작은 묶음은 이름표 없이) */
const IND_HEAD = 13;
const MARKETS: SectorMarket[] = ["kospi", "kosdaq", "sp500", "nasdaq100", "dow"];

/** 등락률 → 칸 색 (finviz 처럼 상승 초록 · 하락 빨강). ±3% 에서 가장 진함 */
function heat(rate: number) {
  const t = Math.max(-1, Math.min(1, rate / 3));
  const base = [65, 69, 84];
  const to = t >= 0 ? [48, 158, 72] : [214, 48, 49];
  const k = Math.abs(t);
  const c = base.map((b, i) => Math.round(b + (to[i] - b) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
function stamp(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString();
  return `${d.slice(5, 7)}.${d.slice(8, 10)} ${d.slice(11, 16)}`;
}

type Tip = { x: number; y: number; stock: SectorStock; sector: string } | null;

/** onData: 받은 섹터맵을 부모에게 (같은 데이터로 상승·하락·거래대금 순위를 만든다) */
export default function SectorMap({ onData, onOpenUs }: { onData?: (data: SectorMapData | null) => void; onOpenUs?: (t: UsChartTarget) => void }) {
  const [market, setMarket] = useState<SectorMarket>("kospi");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; error?: string } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  /** 지금 보이는 지도 (처음엔 전체, 그 뒤엔 바뀐 업종만 받아 합침) */
  const [live, setLive] = useState<SectorMapData | null>(null);
  const liveRef = useRef<SectorMapData | null>(null);
  const zoomRef = useRef<string | null>(null);
  useEffect(() => {
    liveRef.current = live;
    zoomRef.current = zoom;
  }, [live, zoom]);

  // 처음 · 시장을 바꿀 때 · 다시 시도: 전체를 받는다
  const key = `${market}:${attempt}`;
  useEffect(() => {
    let cancelled = false;
    getSectorMap(market)
      .then((data) => {
        if (cancelled) return;
        setResult({ key });
        setLive(data);
      })
      .catch((e) => !cancelled && setResult({ key, error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, [key, market]);

  // 장중엔 5초마다 "바뀐 것만" 물어본다. 서버는 메모리에서 바로 답하고(키움 호출 없음), 바뀐 업종만 돌려준다
  // 크게 본 업종은 focus 로 알려서 서버가 다음 차례에 먼저 갱신
  const open = live?.market === market && live.marketOpen;
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const t = setInterval(() => {
      const cur = liveRef.current;
      if (!cur || cur.market !== market || document.hidden) return; // 다른 탭을 보고 있으면 쉰다
      getSectorMap(market, { since: cur.version, focus: zoomRef.current ?? undefined })
        .then((next) => {
          if (stopped) return;
          setLive((prev) => {
            if (!prev || prev.market !== next.market) return prev;
            if (next.full) return next;
            if (!next.sectors.length && next.version === prev.version) return prev; // 그대로면 다시 그리지 않음
            const changed = new Map(next.sectors.map((s) => [s.code, s]));
            const sectors = prev.sectors.map((s) => changed.get(s.code) ?? s).sort((a, b) => b.marketCap - a.marketCap);
            return { ...prev, version: next.version, asOf: next.asOf, marketOpen: next.marketOpen, sectors };
          });
        })
        .catch(() => {
          // 한 번 못 받아도 다음 차례에 다시 (화면은 마지막 값 그대로)
        });
    }, 5_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [open, market]);

  const current = result?.key === key ? result : null;
  // 시장을 바꾸는 동안엔 이전 지도를 흐리게 남겨 두면 덜 깜빡인다
  const data = live?.market === market ? live : null;
  const loading = !current;
  const error = current?.error ?? null;
  useEffect(() => {
    onData?.(data);
  }, [data, onData]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const height = (market === "sp500" || market === "kospi" || market === "kosdaq") && !zoom ? TALL : HEIGHT;
  const sectors = useMemo(() => (data ? (zoom ? data.sectors.filter((s) => s.code === zoom) : data.sectors) : []), [data, zoom]);
  const layout = useMemo(() => {
    if (!width || !sectors.length) return [];
    const outer = squarify(
      sectors.map((s) => s.marketCap),
      { x: 0, y: 0, w: width, h: height },
    );
    return sectors.map((s, i) => {
      const r = outer[i];
      const inner: Rect = { x: r.x + 1, y: r.y + HEADER, w: Math.max(r.w - 2, 0), h: Math.max(r.h - HEADER - 1, 0) };
      const cells: { stock: SectorStock; c: Rect }[] = [];
      const groups: { name: string; rect: Rect; head: boolean }[] = [];
      if (s.stocks.some((t) => t.industry)) {
        // 세부 업종으로 한 번 더 나눈 뒤 그 안을 종목으로 (finviz 처럼)
        const byInd = new Map<string, SectorStock[]>();
        for (const t of s.stocks) byInd.set(t.industry ?? "", [...(byInd.get(t.industry ?? "") ?? []), t]);
        const inds = [...byInd.entries()].map(([name, list]) => ({ name, list, cap: list.reduce((a, t) => a + t.marketCap, 0) })).sort((a, b) => b.cap - a.cap);
        const rects = squarify(
          inds.map((x) => x.cap),
          inner,
        );
        inds.forEach((ind, k) => {
          const g = rects[k];
          if (!g) return;
          const head = !!ind.name && g.w >= 70 && g.h >= 44;
          groups.push({ name: ind.name, rect: g, head });
          const box: Rect = { x: g.x + 1, y: g.y + (head ? IND_HEAD : 1), w: Math.max(g.w - 2, 0), h: Math.max(g.h - (head ? IND_HEAD : 1) - 1, 0) };
          squarify(
            ind.list.map((t) => t.marketCap),
            box,
          ).forEach((c, j) => cells.push({ stock: ind.list[j], c }));
        });
      } else {
        squarify(
          s.stocks.map((t) => t.marketCap),
          inner,
        ).forEach((c, j) => cells.push({ stock: s.stocks[j], c }));
      }
      return { sector: s, rect: r, cells, groups };
    });
  }, [sectors, width, height]);
  const us = isUsMarket(market);

  const zoomed = zoom ? data?.sectors.find((s) => s.code === zoom) : null;
  const cur = data?.currency ?? (us ? "USD" : "KRW");
  const cap = (n: number) => money(n, cur);

  return (
    <section className="ins-card">
      <div className="ins-head">
        <div className="ins-title">
          <h2>{zoomed ? zoomed.name : "섹터맵"}</h2>
          {zoomed ? (
            <button type="button" className="ins-back" onClick={() => setZoom(null)}>
              ← 전체 업종
            </button>
          ) : null}
          {data && (
            <span className="ins-meta">
              {data.marketOpen ? (us ? "정규장 · 실시간" : data.session === "pre" ? "프리마켓(NXT) · 실시간" : data.session === "after" ? "애프터마켓(NXT) · 실시간" : "정규장 · 실시간") : "장 마감"} · {stamp(data.asOf)} 기준
            </span>
          )}
        </div>
        <div className="ins-seg" role="radiogroup" aria-label="시장">
          {MARKETS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={market === m}
              onClick={() => {
                setMarket(m);
                setZoom(null);
              }}
            >
              {MARKET_NAME[m]}
            </button>
          ))}
        </div>
      </div>

      <div ref={boxRef} className={`ins-map${loading && data ? " stale" : ""}`} style={{ height }} onMouseLeave={() => setTip(null)}>
        {error ? (
          <div className="ins-state">
            <p>{error}</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              다시 시도
            </button>
          </div>
        ) : !data ? (
          <div className="ins-state">
            <span className="ins-spinner" aria-hidden />
            <p>{us ? "미국 시세를 처음 불러오는 중 (1분쯤)" : "업종 시세를 불러오는 중"}</p>
          </div>
        ) : (
          layout.map(({ sector, rect, cells, groups }) => (
            <div key={sector.code} className="ins-sector" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
              <button
                type="button"
                className="ins-sector-head"
                style={{ height: HEADER }}
                onClick={() => setZoom(zoom ? null : sector.code)}
                {...memoAttr({ kind: "topic", topic: "업종·테마", label: `${sector.name} ${pct(sector.changeRate)}` })}
                title={`${sector.name} ${pct(sector.changeRate)} · 시가총액 ${cap(sector.marketCap)} · 상승 ${sector.rising} 하락 ${sector.falling}`}
              >
                <span>{sector.name}</span>
                {rect.w > 110 && <em className={sector.changeRate > 0 ? "up" : sector.changeRate < 0 ? "down" : ""}>{pct(sector.changeRate)}</em>}
              </button>
              {groups.map((g) => (
                <div
                  key={g.name}
                  className="ins-ind"
                  style={{ left: g.rect.x - rect.x, top: g.rect.y - rect.y, width: g.rect.w, height: g.rect.h }}
                  title={g.name}
                >
                  {g.head && <span style={{ height: IND_HEAD }}>{g.name}</span>}
                </div>
              ))}
              {cells.map(({ stock: s, c }) => {
                if (!c || c.w < 1 || c.h < 1) return null;
                // 글자 크기: 칸 넓이에 맞추되 이름이 가로에 들어가게 (영문 티커 0.62em, 한글 1em 정도)
                const text = us ? s.code : s.name;
                const charW = us ? 0.8 : 1.05;
                // 테두리 2px + 글자 좌우 여백 6px 빼고 남는 너비에 다 들어가야 (잘려서 "E…" 로 나오면 안 씀)
                const fontSize = Math.min(22, Math.max(9, Math.sqrt(c.w * c.h) / 6), (c.w - 9) / (text.length * charW), (c.h - 2) * 0.8);
                // 작은 칸도 이름은 보이게 (finviz 처럼), 등락률은 두 줄이 들어갈 때만
                const showName = fontSize >= LABEL_MIN.font && c.w >= LABEL_MIN.w && c.h >= LABEL_MIN.h;
                const showPct = showName && c.h >= fontSize * 2.3 + 4 && c.w >= fontSize * 3.6;
                const cell = {
                  className: "ins-cell",
                  style: { left: c.x - rect.x, top: c.y - rect.y, width: c.w, height: c.h, background: heat(s.changeRate), fontSize: Math.max(LABEL_MIN.font, fontSize) },
                  onMouseMove: (e: React.MouseEvent) => {
                    const host = boxRef.current?.getBoundingClientRect();
                    if (host) setTip({ x: e.clientX - host.left, y: e.clientY - host.top, stock: s, sector: sector.name });
                  },
                  "aria-label": `${s.name} ${pct(s.changeRate)}`,
                  ...memoAttr({ kind: "stock", code: s.code, name: s.name, note: `${sector.name} ${pct(s.changeRate)}` }),
                };
                const label = showName && (
                  <>
                    <strong>{text}</strong>
                    {showPct && <span>{pct(s.changeRate)}</span>}
                  </>
                );
                return us ? (
                  <button key={s.code} type="button" {...cell} onClick={() => onOpenUs?.({ code: kiwoomTicker(s.code), name: s.name })}>
                    {label}
                  </button>
                ) : (
                  <Link key={s.code} href={`/workshop?symbol=${s.code}&name=${encodeURIComponent(s.name)}&market=${market === "kospi" ? "KOSPI" : "KOSDAQ"}`} {...cell}>
                    {label}
                  </Link>
                );
              })}
            </div>
          ))
        )}
        {tip && (
          <div className="ins-tip" style={{ left: Math.min(tip.x + 14, width - 220), top: Math.min(tip.y + 14, height - 110) }}>
            <strong>
              {tip.stock.name} <small>{tip.stock.code}</small>
            </strong>
            <span className={tip.stock.changeRate > 0 ? "up" : tip.stock.changeRate < 0 ? "down" : ""}>
              {price(tip.stock.price, cur)} {pct(tip.stock.changeRate)}
            </span>
            <small>
              {tip.sector} · 시가총액 {cap(tip.stock.marketCap)} · 거래량 {tip.stock.volume.toLocaleString("ko-KR")}
            </small>
          </div>
        )}
      </div>

      <div className="ins-legend" aria-hidden>
        <span>−3%</span>
        <i style={{ background: `linear-gradient(90deg, ${heat(-3)}, ${heat(0)}, ${heat(3)})` }} />
        <span>+3%</span>
        <small>
          칸 크기 = 시가총액 · 업종 이름을 누르면 크게{us ? " · 섹터 안은 세부 업종별 · 정규장 한국 시간 23:30~06:00 (서머타임 22:30~05:00)" : " · KRX + NXT 통합 시세 (08:00~20:00) · 종목을 누르면 작업실"}
        </small>
      </div>
    </section>
  );
}

