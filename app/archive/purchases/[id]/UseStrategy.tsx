"use client";
// 구독한 전략 활용하기 (구독한 전략 화면 아래. 2026-11-22: 열람권이 없어져 "산 전략" → "구독한 전략", 달 수를 전략 수로 세던 것 고침): 내 차트에 겹치기 · 같은 상황 알림 · 복기 비교 · 이 트레이더라면?
//   계산은 lib/strategy-use.ts. 트레이더가 실제로 한 매매 · 노트만 근거로 씀 (지어낸 말 · 수익 예측 없음)
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchBars, searchAllSymbols, type UsExchange } from "../../../../lib/market-data";
import { strategiesOf, traderById } from "../../../marketplace/data";
import { fetchStrategyMonth } from "../../../../lib/strategy-data";
import { recentTrades } from "../../../../lib/api/performance";
import { useWatchlist } from "../../../insights/useWatchlist";
import type { SimDetail, SimMonth } from "../../../marketplace/GuessFirst";
import type { Bar } from "../../../../lib/mock/workshop";
import {
  addHits,
  bestCase,
  closeness,
  describe,
  entryCases,
  pairTrades,
  readAlerts,
  readHits,
  setAlert,
  situationAt,
  statsOf,
  traderRounds,
  type AlertHit,
  type EntryCase,
  type MyRound,
} from "../../../../lib/strategy-use";
import BeeLoader from "../../../BeeLoader";

type Tab = "alert" | "review" | "ask";
const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: "alert", label: "같은 상황 알림", desc: "트레이더가 실제로 산 날과 비슷한 상황의 관심 종목을 찾아요" },
  { key: "review", label: "내 매매와 비교", desc: "같은 기간 내 매매와 트레이더 매매를 나란히 봐요" },
  { key: "ask", label: "이 트레이더라면?", desc: "내 종목 지금 상황과 가장 비슷했던 트레이더의 실제 매매를 보여 줘요" },
];
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const sign = (n: number, k = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(k)}%`;

/** 일봉 (미국 종목은 거래소를 몰라 나스닥 → 뉴욕 순으로) */
async function dailyBars(code: string, market: string, exchange?: UsExchange): Promise<Bar[]> {
  if (market !== "US") return (await fetchBars(code, "1d", undefined, 400)).bars;
  for (const ex of exchange ? [exchange] : (["ND", "NY", "NA"] as UsExchange[])) {
    const bars = await fetchBars(code, "1d", undefined, 400, ex)
      .then((r) => r.bars)
      .catch(() => [] as Bar[]);
    if (bars.length) return bars;
  }
  return [];
}

export default function UseStrategy({ traderId, traderName, months, current }: { traderId: string; traderName: string; months: string[]; current: string }) {
  const [tab, setTab] = useState<Tab>("alert");
  // 연 달 전부 (활용은 한 달이 아니라 산 전략 전체로)
  const [all, setAll] = useState<SimDetail[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(months.map((m) => fetchStrategyMonth(traderId, m).catch(() => null))).then((list) => alive && setAll(list.filter((x): x is SimDetail => !!x)));
    return () => {
      alive = false;
    };
  }, [traderId, months]);
  const market = all?.[0]?.market ?? "KR";
  const simMonths: SimMonth[] = useMemo(() => (all ?? []).flatMap((d) => d.months), [all]);
  // 전략 수 = 볼 수 있는 달이 들어 있는 전략 (전략은 판매자가 끊은 기간이라 달 수와 다름)
  const trader = traderById(traderId);
  const strategyCount = trader ? strategiesOf(trader).filter((s) => s.months.some((m) => months.includes(m))).length : months.length;
  const tradeCount = simMonths.reduce((s, m) => s + m.trades.length, 0);

  // 트레이더가 산 날 상황 (알림 · 이 트레이더라면? 에서 같이 씀)
  const [cases, setCases] = useState<EntryCase[] | null>(null);
  const needCases = tab === "alert" || tab === "ask";
  useEffect(() => {
    if (!needCases || cases || !all) return;
    let alive = true;
    entryCases(simMonths, (c) => dailyBars(c, market)).then((x) => alive && setCases(x));
    return () => {
      alive = false;
    };
  }, [needCases, cases, all, simMonths, market]);

  return (
    <section className="mk-card su-wrap" aria-label="구독한 전략 활용하기">
      <div className="su-head">
        <h2>구독한 전략 활용하기</h2>
        <small>
          구독한 전략 {strategyCount}개 · 실제 매매 {tradeCount}건을 근거로 써요
        </small>
      </div>
      <div className="su-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="su-desc">{TABS.find((t) => t.key === tab)!.desc}</p>
      {!all ? (
        <BeeLoader size="sm" label="구독한 전략" />
      ) : tab === "alert" ? (
        <Alert traderId={traderId} traderName={traderName} cases={cases} market={market} />
      ) : tab === "review" ? (
        <Review detail={all} traderName={traderName} />
      ) : (
        <Ask traderName={traderName} cases={cases} months={simMonths} market={market} />
      )}
      <p className="su-note">과거 매매를 보여 줄 뿐, 앞으로의 수익을 약속하지 않아요. 판단과 주문은 직접 하세요.</p>
    </section>
  );
}

function Alert({ traderId, traderName, cases, market }: { traderId: string; traderName: string; cases: EntryCase[] | null; market: string }) {
  const { items } = useWatchlist();
  const [on, setOn] = useState(false);
  const [min, setMin] = useState(75);
  const [hits, setHits] = useState<AlertHit[]>([]);
  const [rows, setRows] = useState<{ code: string; name: string; score: number; today: string; c: EntryCase }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => {
      const r = readAlerts().find((x) => x.traderId === traderId);
      setOn(!!r);
      if (r) setMin(r.min);
      setHits(readHits().filter((h) => h.traderId === traderId));
    };
    sync();
    window.addEventListener("trackit:strategy-alerts", sync);
    return () => window.removeEventListener("trackit:strategy-alerts", sync);
  }, [traderId]);
  // 국내 트레이더면 국내 관심 종목, 미국이면 미국 관심 종목만
  const pool = items.filter((w) => (market === "US" ? !!w.exchange : !w.exchange));

  async function scan() {
    if (!cases?.length) return;
    setRows(null);
    setMsg(null);
    const out: NonNullable<typeof rows> = [];
    for (const w of pool) {
      const bars = await dailyBars(w.code, market, w.exchange).catch(() => [] as Bar[]);
      const s = situationAt(bars, bars.length - 1);
      if (!s) continue;
      const best = bestCase(s, cases);
      if (best) out.push({ code: w.code, name: w.name, score: best.score, today: describe(s), c: best.c });
    }
    out.sort((a, b) => b.score - a.score);
    setRows(out);
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const found = out.filter((r) => r.score >= min);
    if (on && found.length) {
      const n = addHits(found.map((r) => ({ id: `${traderId}:${r.code}:${today}`, traderId, traderName, code: r.code, name: r.name, score: r.score, caseDate: r.c.trade.entry.d, caseName: r.c.trade.name, at: new Date().toISOString() })));
      setMsg(n ? `새로 ${n}개를 알림에 남겼어요 (상단 종).` : "이미 알림에 있는 자리예요.");
    }
  }

  if (!cases) return <p className="su-empty">트레이더가 산 날의 상황을 계산하는 중…</p>;
  if (!cases.length) return <p className="su-empty">상황을 계산할 수 있는 매매가 없어요.</p>;
  return (
    <>
      <div className="su-alert-bar">
        <label className="su-switch">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              setAlert({ traderId, traderName, min }, e.target.checked);
              setOn(e.target.checked);
            }}
          />
          <span>비슷한 자리가 나오면 알림</span>
        </label>
        <label className="su-min">
          비슷한 정도
          <select
            value={min}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMin(v);
              if (on) setAlert({ traderId, traderName, min: v }, true);
            }}
          >
            {[65, 75, 85].map((v) => (
              <option key={v} value={v}>
                {v}점 이상
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="mk-soft" onClick={scan} disabled={!pool.length}>
          관심 종목 {pool.length}개 지금 확인
        </button>
      </div>
      {!pool.length && (
        <p className="su-empty">
          {market === "US" ? "미국" : "국내"} 관심 종목이 없어요. <Link href="/insights">증시 정보</Link>에서 ★ 로 추가하세요.
        </p>
      )}
      {msg && <p className="su-msg">{msg}</p>}
      {rows && (
        <ul className="su-rows">
          {rows.map((r) => (
            <li key={r.code} className={r.score >= min ? "hit" : ""}>
              <div>
                <strong>{r.name}</strong> <b className="su-score">{r.score}점</b>
                <small>오늘: {r.today}</small>
                <small>
                  비슷한 매매: {r.c.trade.name} {md(r.c.trade.entry.d)} 매수 — {r.c.trade.entry.why} → {sign(r.c.trade.ret)}
                </small>
              </div>
              <Link className="mk-soft" href={`/workshop?symbol=${encodeURIComponent(r.code)}&name=${encodeURIComponent(r.name)}`}>
                차트 보기
              </Link>
            </li>
          ))}
          {!rows.length && <li className="su-empty">상황을 계산할 수 있는 관심 종목이 없어요 (일봉 60개 이상 필요).</li>}
        </ul>
      )}
      {!!hits.length && (
        <div className="su-hits">
          <h3>지난 알림</h3>
          <ul>
            {hits.slice(0, 5).map((h) => (
              <li key={h.id}>
                {md(h.at.slice(0, 10))} · {h.name} {h.score}점 <small>({h.caseName} {md(h.caseDate)} 매수와 비슷)</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Review({ detail, traderName }: { detail: SimDetail[]; traderName: string }) {
  const [mine, setMine] = useState<MyRound[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    recentTrades()
      .then((t) => alive && setMine(pairTrades(t)))
      .catch(() => alive && (setErr(true), setMine([])));
    return () => {
      alive = false;
    };
  }, []);
  const theirs = detail.flatMap((d) => traderRounds(d));
  const months = new Set(detail.flatMap((d) => d.months.map((m) => m.month)));
  const myIn = (mine ?? []).filter((r) => months.has(r.entry.d.slice(0, 7)));
  // 기간은 달을 하나씩 늘어놓지 않고 처음 ~ 끝으로 (47개월이면 한 줄이 넘어감)
  const sorted = [...months].sort();
  const span = sorted.length ? (sorted.length === 1 ? sorted[0].replace("-", ".") : `${sorted[0].replace("-", ".")} ~ ${sorted[sorted.length - 1].replace("-", ".")}`) : "";
  const a = statsOf(theirs.map((t) => ({ ret: t.ret, days: t.days })));
  const b = statsOf(myIn);
  const stopRate = theirs.length ? Math.round((theirs.filter((t) => t.followed).length / theirs.length) * 100) : null;
  const same = myIn.filter((r) => theirs.some((t) => t.code === r.symbol));
  const fmt = (v: number | null, f: (n: number) => string) => (v === null ? "—" : f(v));
  const rows: [string, string, string][] = [
    ["매매 수", `${a.n}건`, `${b.n}건`],
    ["승률", fmt(a.winRate, (n) => `${n.toFixed(0)}%`), fmt(b.winRate, (n) => `${n.toFixed(0)}%`)],
    ["평균 수익률", fmt(a.avgRet, (n) => sign(n, 2)), fmt(b.avgRet, (n) => sign(n, 2))],
    ["평균 보유", fmt(a.avgDays, (n) => `${n.toFixed(1)}일`), fmt(b.avgDays, (n) => `${n.toFixed(1)}일`)],
    ["가장 큰 손실", fmt(a.worst, (n) => sign(n, 2)), fmt(b.worst, (n) => sign(n, 2))],
  ];
  const tips: string[] = [];
  if (a.avgDays !== null && b.avgDays !== null && b.avgDays < a.avgDays * 0.5) tips.push(`${traderName}님보다 훨씬 빨리 팔았어요 (평균 ${b.avgDays.toFixed(1)}일 vs ${a.avgDays.toFixed(1)}일).`);
  if (a.worst !== null && b.worst !== null && b.worst < a.worst - 2) tips.push(`가장 큰 손실이 ${traderName}님보다 ${(a.worst - b.worst).toFixed(1)}%p 커요. 손절선을 먼저 정해 보세요.`);
  if (stopRate !== null) tips.push(`${traderName}님은 매매 ${stopRate}%를 계획대로(손절 · 목표) 끝냈어요.`);
  return (
    <>
      {mine === null ? (
        <BeeLoader size="sm" label="내 체결" />
      ) : (
        <>
          {err && <p className="su-msg">로그인하면 내 체결과 비교할 수 있어요.</p>}
          <table className="su-table">
            <thead>
              <tr>
                <th>구독한 전략 기간</th>
                <th>{traderName}</th>
                <th>나</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, x, y]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{x}</td>
                  <td>{y}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!!same.length && (
            <div className="su-hits">
              <h3>같은 종목을 둘 다 매매했어요</h3>
              <ul>
                {same.map((r) => {
                  const t = theirs.find((x) => x.code === r.symbol)!;
                  return (
                    <li key={`${r.symbol}:${r.entry.d}`}>
                      {t.name}: {traderName} {md(t.entry.d)} 매수 → {md(t.exit.d)} {sign(t.ret, 2)} · 나 {md(r.entry.d)} 매수 → {r.exit ? `${md(r.exit.d)} ${sign(r.ret!, 2)}` : "보유 중"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {!myIn.length && <p className="su-empty">구독한 전략 기간({span})에 내 매매가 없어요.</p>}
          {!!tips.length && (
            <ul className="su-tips">
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function Ask({ traderName, cases, months, market }: { traderName: string; cases: EntryCase[] | null; months: SimMonth[]; market: string }) {
  const { items } = useWatchlist();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ name: string; today: string; picks: { c: EntryCase; score: number }[]; notes: { d: string; text: string }[] } | { error: string } | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || !cases) return;
    setBusy(true);
    setAnswer(null);
    try {
      const w = items.find((x) => x.code === text.toUpperCase() || x.name === text);
      const sym = w ?? (await searchAllSymbols(text)).find((s) => (market === "US" ? !!s.exchange : !s.exchange));
      if (!sym) return setAnswer({ error: `'${text}' 종목을 찾지 못했어요.` });
      const bars = await dailyBars(sym.code, market, sym.exchange);
      const s = situationAt(bars, bars.length - 1);
      if (!s) return setAnswer({ error: `${sym.name}은 일봉이 모자라 상황을 계산할 수 없어요.` });
      const picks = cases
        .map((c) => ({ c, score: closeness(s, c.situation) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      // 같은 종목에 남긴 노트가 있으면 같이
      const notes = months.flatMap((m) => (m.notes ?? []).filter((n) => n.code === sym.code && n.type !== "carry").map((n) => ({ d: n.d, text: n.text }))).sort((a, b) => b.d.localeCompare(a.d));
      setAnswer({ name: sym.name, today: describe(s), picks, notes });
    } catch {
      setAnswer({ error: "시세를 불러오지 못했어요. 잠시 뒤 다시 해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  if (!cases) return <p className="su-empty">트레이더가 산 날의 상황을 계산하는 중…</p>;
  const won = answer && "picks" in answer ? answer.picks.filter((p) => p.c.trade.ret > 0).length : 0;
  return (
    <>
      <form className="su-ask" onSubmit={ask}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목 이름이나 코드 (예: 삼성전자)" aria-label="물어볼 종목" list="su-ask-list" />
        <datalist id="su-ask-list">
          {items.map((w) => (
            <option key={w.code} value={w.name} />
          ))}
        </datalist>
        <button type="submit" className="mk-primary" disabled={busy || !q.trim()}>
          {busy ? "찾는 중…" : `${traderName}님이라면?`}
        </button>
      </form>
      {answer && "error" in answer && <p className="su-msg">{answer.error}</p>}
      {answer && "picks" in answer && (
        <div className="su-answer">
          <p>
            <strong>{answer.name}</strong> 지금: {answer.today}
          </p>
          {answer.picks[0] && answer.picks[0].score < 40 ? (
            <p>
              <b>{traderName}님은 이런 상황에서 산 적이 없어요.</b> 기록으로 보면 지금은 지켜보는 자리예요. 아래는 그나마 가까웠던 매매예요.
            </p>
          ) : (
            <p>
              {traderName}님이 이와 가장 비슷한 상황에서 한 매매 {answer.picks.length}건 중 <b>{won}건</b>이 수익으로 끝났어요.
              {answer.picks[0] && answer.picks[0].score < 60 && " (아주 비슷한 자리는 없었어요. 참고만 하세요.)"}
            </p>
          )}
          <ol>
            {answer.picks.map(({ c, score }) => (
              <li key={`${c.trade.code}:${c.trade.entry.d}`}>
                <div>
                  <b className="su-score">{score}점</b> {c.trade.name} · {md(c.trade.entry.d)} 매수 {c.trade.entry.px.toLocaleString("ko-KR")}
                </div>
                <q>{c.trade.entry.why}</q>
                <small>
                  그날 상황: {describe(c.situation)} → {md(c.trade.exit.d)} {c.trade.exit.why} ({sign(c.trade.ret, 2)})
                </small>
              </li>
            ))}
          </ol>
          {!!answer.notes.length && (
            <div className="su-hits">
              <h3>
                {traderName}님이 {answer.name}에 남긴 노트
              </h3>
              <ul>
                {answer.notes.map((n) => (
                  <li key={n.d + n.text}>
                    <time>{n.d.slice(2, 4)}.{md(n.d)}</time> {n.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
