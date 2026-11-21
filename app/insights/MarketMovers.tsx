"use client";
// 증시 캘린더 · 오늘의 종목: 시장 · 순위 기준을 골라 표로 보고, 줄을 누르면 오른쪽에 그 종목 차트 · 요약
//   순위 기준: 거래대금 · 거래량 · 상승 · 하락 · 시가총액 (+ 국내는 외국인 · 기관 순매수 · 순매도)
//   데이터: 섹터맵과 같은 업종별 시세(키움 추가 호출 없음) + 외국인·기관(ka90009).
//   국내 현재가 · 전일 대비는 페이지 공통 줄(lib/live-quotes)로 장중 5초마다 새로
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { memoAttr } from "../../lib/memo-target";
import { getFlows, getSectorMap, getUsBars, isUsMarket, kiwoomTicker, searchAllSymbols, type FlowRow, type KrMarket, type SectorMarket } from "../../lib/api/insights";
import { useQuotes } from "../../lib/live-quotes";
import type { Bar } from "../../lib/interval";
import { loadDaily } from "../archive/bars";
import { useDark } from "../marketplace/GuessFirst";
import type { UsChartTarget } from "./UsChart";
import { Failed, Loading, money, pct, price, tone } from "./parts";
import { useLoad } from "./useLoad";
import { useWatchlist } from "./useWatchlist";
import { fixZoomPointer } from "../../lib/zoom-pointer";
import { normalizeLogo, type NormalizedLogo } from "../../lib/stock-logo";

const MARKETS: [SectorMarket, string][] = [
  ["kospi", "코스피"],
  ["kosdaq", "코스닥"],
  ["sp500", "S&P 500"],
  ["nasdaq100", "나스닥 100"],
  ["dow", "다우 30"],
];
type Tab = "amount" | "volume" | "up" | "down" | "cap" | "fbuy" | "fsell" | "ibuy" | "isell";
const TABS: { key: Tab; label: string; kr?: boolean }[] = [
  { key: "amount", label: "거래대금" },
  { key: "volume", label: "거래량" },
  { key: "up", label: "상승" },
  { key: "down", label: "하락" },
  { key: "cap", label: "시가총액" },
  { key: "fbuy", label: "외국인 순매수", kr: true },
  { key: "fsell", label: "외국인 순매도", kr: true },
  { key: "ibuy", label: "기관 순매수", kr: true },
  { key: "isell", label: "기관 순매도", kr: true },
];
const FLOW_KEY: Partial<Record<Tab, "foreignBuy" | "foreignSell" | "institutionBuy" | "institutionSell">> = {
  fbuy: "foreignBuy",
  fsell: "foreignSell",
  ibuy: "institutionBuy",
  isell: "institutionSell",
};

type Row = {
  code: string;
  name: string;
  industry: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  amount: number;
  marketCap: number;
  /** 외국인 · 기관 탭: 순매수(+) · 순매도(−) 금액 (백만원) */
  flow?: number;
};

const KST = 9 * 3600_000;
const hhmm = (ms: number) => new Date(ms + KST).toISOString().slice(11, 16);
const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
/** 백만원 → 억 */
const eokOf = (millions: number) => `${millions > 0 ? "+" : millions < 0 ? "−" : ""}${num(Math.abs(millions) / 100)}억`;
/** 이름 첫 글자 동그라미 색 (코드로 정해 늘 같게) */
function hue(code: string) {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
/** 로고 주소 판 번호: 출처 · 정리 방식을 바꾸면 올려서 브라우저 · CDN 에 남은 예전 응답(없음 404 포함)을 건너뜀 */
const LOGO_VERSION = 2;
/** 받아서 정리한 로고 (종목별, 페이지를 옮겨 다녀도 다시 그리지 않음). 'none' = 로고 없음 → 첫 글자 */
type Logo = NormalizedLogo | { url: string; mode: "raw"; fill: string } | "none";
const logos = new Map<string, { logo: Logo; at: number }>();
/** '없음'은 10분만 기억 (잠깐 실패가 세션 내내 첫 글자로 굳지 않게) */
const NONE_TTL = 10 * 60_000;
const cachedLogo = (key: string): Logo | null => {
  const hit = logos.get(key);
  if (!hit) return null;
  if (hit.logo === "none" && Date.now() - hit.at > NONE_TTL) {
    logos.delete(key);
    return null;
  }
  return hit.logo;
};

/** 로고 받기: 실패하면 1.5초 · 3초 뒤 두 번 더 (서버가 잠깐 503 · 시간 초과일 때), 그래도 안 되면 '없음' */
function useStockLogo(code: string, m: "kospi" | "kosdaq" | "us" | null): Logo | "loading" {
  const key = `${m}:${code}`;
  const [logo, setLogo] = useState<Logo | "loading">(() => (m ? (cachedLogo(key) ?? "loading") : "none"));
  useEffect(() => {
    if (!m || logo !== "loading") return;
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (v: Logo) => {
      logos.set(key, { logo: v, at: Date.now() });
      if (alive) setLogo(v);
    };
    const attempt = () => {
      const img = new Image();
      const src = `/api/v1/insights/logo?symbol=${encodeURIComponent(code)}&market=${m}&v=${LOGO_VERSION}${tries ? `&r=${tries}` : ""}`;
      img.onload = () => {
        try {
          done(normalizeLogo(img) ?? "none");
        } catch {
          done({ url: src, mode: "raw", fill: "#fff" }); // 캔버스로 못 읽으면 원본을 여백만 두고
        }
      };
      img.onerror = () => {
        tries++;
        if (tries <= 2) timer = setTimeout(attempt, 1500 * tries);
        else done("none");
      };
      img.src = src;
    };
    attempt();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, code, m, logo]);
  return logo;
}

/** 종목 동그라미: 로고(백엔드 /insights/logo 가 받아 보관 → lib/stock-logo 로 가운데 정리)가 있으면 로고, 없으면 이름 첫 글자 */
function Avatar({ code, name, market, size = 30 }: { code: string; name: string; market?: SectorMarket; size?: number }) {
  const m = !market ? null : market === "kospi" || market === "kosdaq" ? market : "us";
  // 종목이 바뀌면 상태를 새로 (오른쪽 요약처럼 같은 자리에서 종목만 바뀌어도 앞 종목의 '없음' · 어두운 칸이 남지 않게)
  return <StockAvatar key={`${m}:${code}`} code={code} name={name} m={m} size={size} />;
}
function StockAvatar({ code, name, m, size }: { code: string; name: string; m: "kospi" | "kosdaq" | "us" | null; size: number }) {
  const logo = useStockLogo(code, m);
  if (logo === "loading") return <span className="ins-mv-avatar logo" style={{ width: size, height: size }} aria-hidden />;
  if (logo !== "none")
    return (
      <span
        className={`ins-mv-avatar logo ${logo.mode}`}
        style={{ width: size, height: size, ...(logo.mode === "tile" ? { background: logo.fill, borderColor: logo.fill } : null) }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 작은 로고(정리한 data URL), 서버가 이미 캐시 */}
        <img src={logo.url} alt="" width={size} height={size} />
      </span>
    );
  return (
    <span className="ins-mv-avatar" style={{ width: size, height: size, background: `hsl(${hue(code)} 55% 46%)`, fontSize: size * 0.42 }} aria-hidden>
      {name.replace(/^[^0-9A-Za-z가-힣]+/, "").slice(0, 1)}
    </span>
  );
}
const workshopHref = (r: Row, market: KrMarket) => `/workshop?symbol=${r.code}&name=${encodeURIComponent(r.name)}&market=${market === "kospi" ? "KOSPI" : "KOSDAQ"}`;

export default function MarketMovers({ onOpenUs }: { onOpenUs?: (t: UsChartTarget) => void }) {
  const [market, setMarket] = useState<SectorMarket>("kospi");
  const [tab, setTab] = useState<Tab>("amount");
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const us = isUsMarket(market);
  const kr = us ? null : (market as KrMarket);

  // 장중 20초 · 장 밖 5분, 서버가 아직 시세를 못 받아 비어 있으면 30초마다
  const sector = useLoad(`movers-${market}`, () => getSectorMap(market), (d) => (d?.marketOpen ? 20_000 : d && !d.sectors.length ? 30_000 : 300_000));
  const flows = useLoad(`movers-flows-${kr ?? "none"}`, () => (kr ? getFlows(kr) : Promise.resolve(null)), (d) => (d ? 60_000 : null));
  const currency = sector.data?.currency ?? (us ? "USD" : "KRW");

  // 섹터맵 종목 전체 → 코드별
  const all = useMemo(() => {
    const m = new Map<string, Row>();
    for (const s of sector.data?.sectors ?? [])
      for (const t of s.stocks) {
        const change = t.price - t.price / (1 + t.changeRate / 100);
        m.set(t.code, { code: t.code, name: t.name, industry: t.industry ?? s.name, price: t.price, change, changeRate: t.changeRate, volume: t.volume, amount: t.price * t.volume, marketCap: t.marketCap });
      }
    return m;
  }, [sector.data]);
  // 미국은 장이 닫혀 있으면 거래량이 거의 0 → 거래대금 · 거래량 순위는 의미가 없어 숨김
  const noVol = us && [...all.values()].filter((r) => r.volume > 1000).length < 20;
  const hidden = (t: (typeof TABS)[number]) => (us && !!t.kr) || (noVol && (t.key === "amount" || t.key === "volume"));
  const tabNow: Tab = TABS.some((t) => t.key === tab && !hidden(t)) ? tab : noVol ? "cap" : "amount";

  const ranked = useMemo<Row[]>(() => {
    const fk = FLOW_KEY[tabNow];
    if (fk) {
      const list: FlowRow[] = flows.data?.[fk] ?? [];
      return list.map((f) => ({ ...(all.get(f.code) ?? { code: f.code, name: f.name, industry: "", price: 0, change: 0, changeRate: 0, volume: 0, amount: 0, marketCap: 0 }), flow: f.amount }));
    }
    const rows = [...all.values()];
    const by: Record<string, (a: Row, b: Row) => number> = {
      amount: (a, b) => b.amount - a.amount,
      volume: (a, b) => b.volume - a.volume,
      up: (a, b) => b.changeRate - a.changeRate,
      down: (a, b) => a.changeRate - b.changeRate,
      cap: (a, b) => b.marketCap - a.marketCap,
    };
    return rows.sort(by[tabNow]).slice(0, 50);
  }, [all, flows.data, tabNow]);
  const shown = ranked.slice(0, more ? 50 : 20);

  // 국내는 보이는 종목 현재가를 공통 줄에서 계속 새로 (섹터맵보다 자주 · 전일 대비 금액도 키움 값 그대로)
  const { quotes } = useQuotes(kr ? shown.map((r) => r.code) : []);
  const live = (r: Row): Row => {
    const q = quotes[r.code];
    return q ? { ...r, price: q.price, change: q.change, changeRate: q.changeRate, volume: q.volume, amount: q.price * q.volume } : r;
  };

  const sel = shown.find((r) => r.code === picked) ?? shown[0];
  const wl = useWatchlist();
  /** 관심 종목에 저장하는 코드: 국내 6자리, 미국은 종목 검색 · 관심 종목과 같은 키움 표기 (BRK.B → BRKb) */
  const favCode = (r: Row) => (us ? kiwoomTicker(r.code) : r.code);
  /** 별을 누른 뒤 거래소를 찾는 중인 미국 종목 (두 번 눌리지 않게) */
  const [favBusy, setFavBusy] = useState<string | null>(null);
  const [favNote, setFavNote] = useState<string | null>(null);
  useEffect(() => {
    if (!favNote) return;
    const t = setTimeout(() => setFavNote(null), 3500);
    return () => clearTimeout(t);
  }, [favNote]);
  const toggleFav = async (r: Row) => {
    const code = favCode(r);
    if (wl.has(code)) return void wl.remove(code);
    if (wl.items.length >= wl.max) return setFavNote(`관심 종목은 ${wl.max}개까지 넣을 수 있어요`);
    if (kr) return void wl.add({ code, name: r.name, market: kr === "kospi" ? "KOSPI" : "KOSDAQ" });
    // 미국: 섹터맵 자료에는 거래소가 없어 종목 검색으로 찾는다 (관심 종목 시세는 "거래소:티커"로 받음)
    if (favBusy) return;
    setFavBusy(code);
    try {
      const hit = (await searchAllSymbols(code)).find((s) => s.country === "US" && s.code === code && s.exchange);
      if (hit) await wl.add({ code: hit.code, name: hit.name, market: hit.market, exchange: hit.exchange });
      else setFavNote(`${r.code} 는 아직 관심 종목에 넣을 수 없어요 (종목 목록에 없음)`);
    } catch {
      setFavNote("관심 종목에 넣지 못했어요. 잠시 뒤 다시 눌러 주세요");
    } finally {
      setFavBusy(null);
    }
  };
  const flowCol = !!FLOW_KEY[tabNow];

  return (
    <section className="ins-card ins-mv">
      <div className="ins-mv-head">
        <h2>오늘의 종목</h2>
        <div className="ins-seg" role="radiogroup" aria-label="시장">
          {MARKETS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={market === k} onClick={() => (setMarket(k), setPicked(null), setMore(false))}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="ins-mv-tabs" role="tablist" aria-label="순위 기준">
        {TABS.filter((t) => !hidden(t)).map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tabNow === t.key} onClick={() => (setTab(t.key), setPicked(null), setMore(false))}>
            {t.label}
          </button>
        ))}
      </div>
      {(favNote || wl.error) && (
        <p className="ins-missing" role="status">
          {favNote ?? wl.error}
        </p>
      )}

      <div className="ins-mv-body">
        <div className={`ins-mv-table${noVol ? " novol" : ""}${us ? " us" : ""}`}>
          {sector.error && !sector.data ? (
            <Failed message={sector.error} onRetry={sector.reload} height={420} />
          ) : !sector.data || (flowCol && !flows.data) ? (
            <div>
              <Loading height={420} />
              {us && <p className="ins-meta ins-mv-wait">미국 종목 시세를 모으는 중이에요. 처음엔 30초쯤 걸려요</p>}
            </div>
          ) : !all.size ? (
            // 서버가 아직 시세를 못 받아 종목이 없음 (예전엔 머리줄만 있는 빈 표)
            <Failed message={`${us ? "미국 " : ""}종목 시세를 아직 받지 못했어요 · 잠시 뒤 저절로 다시 불러와요`} onRetry={sector.reload} height={420} />
          ) : (
            <>
              <div className="ins-mv-row ins-mv-th">
                <span />
                <span>순위 · {sector.updatedAt ? `${hhmm(sector.updatedAt)} 기준` : ""}</span>
                <span>현재가</span>
                <span>전일 대비</span>
                {flowCol ? <span>{tabNow.endsWith("sell") ? "순매도" : "순매수"}</span> : <span className="opt vol">거래량</span>}
                <span className={flowCol ? "opt" : "vol"}>거래대금</span>
                <span className="opt">시가총액</span>
              </div>
              <ol>
                {shown.map((raw, i) => {
                  const r = live(raw);
                  const on = sel?.code === r.code;
                  return (
                    <li key={r.code} className={`ins-mv-row${on ? " on" : ""}`} onClick={() => setPicked(r.code)} {...memoAttr({ kind: "stock", code: r.code, name: r.name, note: `오늘의 종목 · ${TABS.find((t) => t.key === tabNow)?.label}` })}>
                      {/* 국내 · 미국 모두 별. 예전엔 미국 줄의 버튼을 hidden 으로 숨겼는데 Tailwind 가 display:none !important 로
                          칸에서 빼서 줄이 한 칸씩 밀렸다 (이름이 사라지고 시가총액이 거래대금 자리에, 시가총액 칸은 빔) */}
                      <button
                        type="button"
                        className={`fav${wl.has(favCode(r)) ? " on" : ""}`}
                        aria-label={`${r.name} 관심 종목`}
                        aria-pressed={wl.has(favCode(r))}
                        disabled={favBusy === favCode(r)}
                        data-memo-skip
                        onClick={(e) => (e.stopPropagation(), void toggleFav(r))}
                      >
                        {wl.has(favCode(r)) ? "★" : "☆"}
                      </button>
                      <span className="who">
                        <em>{i + 1}</em>
                        <Avatar code={r.code} name={r.name} market={market} />
                        {us ? (
                          // 미국: 티커 + 한글 이름 (검색 · 관심 종목과 같은 모양)
                          <span className="nm" title={`${r.code} · ${r.name}`}>
                            <b className="tk">{r.code}</b>
                            <small>{r.name}</small>
                          </span>
                        ) : (
                          <b title={r.name}>{r.name}</b>
                        )}
                      </span>
                      <span className="num">{r.price ? price(r.price, currency) : "—"}</span>
                      <span className={`num ${tone(r.changeRate)}`}>
                        {r.price ? (
                          <>
                            {r.change > 0 ? "▲" : r.change < 0 ? "▼" : ""}
                            {currency === "USD" ? Math.abs(r.change).toFixed(2) : num(Math.abs(r.change))} ({pct(r.changeRate)})
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      {flowCol ? <span className={`num ${tone(r.flow ?? 0)}`}>{eokOf(r.flow ?? 0)}</span> : <span className="num opt vol">{num(r.volume)}주</span>}
                      <span className={`num${flowCol ? " opt" : " vol"}`}>{r.amount ? money(r.amount, currency) : "—"}</span>
                      <span className="num opt">{r.marketCap ? money(r.marketCap, currency) : "—"}</span>
                    </li>
                  );
                })}
              </ol>
              {ranked.length > 20 && (
                <button type="button" className="ins-mv-more" onClick={() => setMore((v) => !v)}>
                  {more ? "20위까지만 보기" : `50위까지 더 보기`}
                </button>
              )}
            </>
          )}
        </div>
        {sel ? (
          <Detail key={`${market}:${sel.code}`} row={live(sel)} market={market} currency={currency} flows={flows.data} fav={wl.has(favCode(sel))} onFav={() => void toggleFav(sel)} onOpenUs={onOpenUs} />
        ) : (
          <aside className="ins-mv-detail" />
        )}
      </div>
    </section>
  );
}

/** 오른쪽: 고른 종목 일봉(최근 3개월) · 요약 · 외국인/기관 · 바로가기 */
function Detail({
  row,
  market,
  currency,
  flows,
  fav,
  onFav,
  onOpenUs,
}: {
  row: Row;
  market: SectorMarket;
  currency: "KRW" | "USD";
  flows: { foreignBuy: FlowRow[]; foreignSell: FlowRow[]; institutionBuy: FlowRow[]; institutionSell: FlowRow[] } | null | undefined;
  fav: boolean;
  onFav: () => void;
  onOpenUs?: (t: UsChartTarget) => void;
}) {
  const us = isUsMarket(market);
  const [bars, setBars] = useState<Bar[] | null>(null);
  useEffect(() => {
    let live = true;
    const p: Promise<Bar[]> = us
      ? getUsBars(kiwoomTicker(row.code), { limit: 300 }).then((r) => r.bars as Bar[]).catch(() => [])
      : loadDaily(row.code);
    void p.then((b) => live && setBars(b));
    return () => {
      live = false;
    };
  }, [row.code, us]);

  const year = (bars ?? []).slice(-250);
  const hi = year.length ? Math.max(...year.map((b) => b.high)) : 0;
  const lo = year.length ? Math.min(...year.map((b) => b.low)) : 0;
  const flowOf = (list?: FlowRow[]) => list?.find((f) => f.code === row.code)?.amount;
  const foreign = flowOf(flows?.foreignBuy) ?? flowOf(flows?.foreignSell);
  const inst = flowOf(flows?.institutionBuy) ?? flowOf(flows?.institutionSell);

  return (
    <aside className="ins-mv-detail" aria-label={`${row.name} 요약`}>
      <div className="ins-mv-dhead">
        <Avatar code={row.code} name={row.name} market={market} size={40} />
        <div>
          <strong>{row.name}</strong>
          <small>
            {us ? row.code : row.code} {row.industry && `· ${row.industry}`}
          </small>
        </div>
        <button type="button" className={`fav${fav ? " on" : ""}`} onClick={onFav} aria-label={fav ? "관심 종목에서 빼기" : "관심 종목에 추가"} aria-pressed={fav} title={fav ? "관심 종목에서 빼기" : "관심 종목에 추가"}>
          {fav ? "★" : "☆"}
        </button>
      </div>
      <p className="ins-mv-price">
        <b>{row.price ? price(row.price, currency) : "—"}</b>
        <span className={tone(row.changeRate)}>{pct(row.changeRate)}</span>
      </p>
      {/* 받은 일봉이 3개월(66거래일)보다 적으면 있는 만큼이라고 알려 줌 */}
      <p className="ins-mv-sub">{bars && bars.length > 0 && bars.length < 60 ? `일봉 · 받은 ${bars.length}거래일 (상장한 지 얼마 안 됐거나 일봉을 일부만 받았어요)` : "일봉 · 최근 3개월"}</p>
      {bars === null ? <Loading height={200} /> : bars.length ? <MiniCandles bars={bars.slice(-66)} /> : <div className="ins-state" style={{ height: 200 }}><p>차트를 불러오지 못했어요</p></div>}
      <dl className="ins-mv-facts">
        <div>
          <dt>거래량</dt>
          <dd>{num(row.volume)}주</dd>
        </div>
        <div>
          <dt>거래대금</dt>
          <dd>{row.amount ? money(row.amount, currency) : "—"}</dd>
        </div>
        <div>
          <dt>시가총액</dt>
          <dd>{row.marketCap ? money(row.marketCap, currency) : "—"}</dd>
        </div>
        <div>
          <dt>52주 최고 · 최저</dt>
          <dd>{hi ? `${price(hi, currency)} · ${price(lo, currency)}` : "—"}</dd>
        </div>
        {!us && (
          <>
            <div>
              <dt>외국인 오늘</dt>
              <dd className={tone(foreign ?? 0)}>{foreign !== undefined ? eokOf(foreign) : "상위 10 밖"}</dd>
            </div>
            <div>
              <dt>기관 오늘</dt>
              <dd className={tone(inst ?? 0)}>{inst !== undefined ? eokOf(inst) : "상위 10 밖"}</dd>
            </div>
          </>
        )}
      </dl>
      {us ? (
        <button type="button" className="ins-mv-go" onClick={() => onOpenUs?.({ code: kiwoomTicker(row.code), name: row.name })}>
          차트 크게 보기
        </button>
      ) : (
        <Link className="ins-mv-go" href={workshopHref(row, market as KrMarket)}>
          트레이딩 로그에서 차트 보기
        </Link>
      )}
    </aside>
  );
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function MiniCandles({ bars }: { bars: Bar[] }) {
  const box = useRef<HTMLDivElement>(null);
  const dark = useDark();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const up = cssVar("--c-up", "#1f9d55");
    const down = cssVar("--c-down", "#e03131");
    // 화면 맞춤(zoom)일 때 마우스 좌표 바로잡기 (lib/zoom-pointer.ts)
    const unfixZoom = fixZoomPointer(el);
    const c: IChartApi = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar("--c-surface", "#fff") }, textColor: cssVar("--c-faint", "#999"), fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--c-line", "#eee") } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: (t: number) => `${new Date(t * 1000).getUTCMonth() + 1}월` },
      crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { labelVisible: false } },
      handleScroll: false,
      handleScale: false,
    });
    const candle = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false, lastValueVisible: false });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });
    candle.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    const vol = c.addSeries(HistogramSeries, { priceScaleId: "v", priceLineVisible: false, lastValueVisible: false });
    c.priceScale("v").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: cssVar("--c-line-strong", "#ccc") })));
    // 봉이 몇 개뿐이면(갓 상장했거나 일봉을 조금만 받은 종목) 화면에 꽉 채우지 않고 보통 굵기로 오른쪽에 붙여 그림
    //   (봉 하나가 패널 전체를 덮어 차트가 아니라 색 상자처럼 보였음)
    if (bars.length < 20) c.timeScale().applyOptions({ barSpacing: 10, fixLeftEdge: false, rightOffset: 1 });
    else c.timeScale().fitContent();
    return () => {
      unfixZoom();
      c.remove();
    };
  }, [bars, dark]);
  return <div ref={box} className="ins-mv-chart" />;
}
