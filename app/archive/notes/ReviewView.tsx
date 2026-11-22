"use client";
// 내 노트 · 복기형 (2026-11-20): 내가 쓴 종목 전략(계획) vs 실제 매매
//   위: 숫자 요약(매매 · 계획을 세운 매매 · 계획 이행률 · 승률) + 자주 반복되는 습관
//     (2026-11-22 용어 통일: 계획 있던 매매 → 계획을 세운 매매, 계획대로 끝냄 → 계획 이행률, 이긴 비율 → 승률, N번 → N건 — 홈 · 전략 마켓과 같은 말로)
//   가운데: 매매마다 계획 가격과 실제 가격, 지킨 것 · 어긴 것 (누르면 그때 쓴 노트를 오른쪽에)
//     (2026-11-21) 매매마다 '계획대로 했다면' 결과(일봉으로 계산)와 차트(계획 선 + 실제 매수 · 매도)
//   그 아래: 종목 전략이 바뀐 흐름 (손절선을 내린 건 빨갛게) → 계획만 세우고 안 산 종목
//   맨 위: 복기 재생 (종목을 골라서)
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradeRecord } from "../../../lib/records";
import { recentTrades, type Trade } from "../../../lib/api/performance";
import { searchAllSymbols } from "../../../lib/market-data";
import { pairTrades } from "../../../lib/strategy-use";
import { habits, ifFollowed, planChanges, reviewRounds, type RoundReview, type WhatIf } from "../../../lib/self-review";
import type { Bar } from "../../../lib/interval";
import { barDate, loadDailyAny } from "../bars";
import RoundChart from "./RoundChart";
import { shortDate } from "./model";
import ReplayView from "./ReplayView";
import BeeLoader from "../../BeeLoader";

const won = (n: number | null) => (n === null ? "—" : n.toLocaleString("ko-KR", { maximumFractionDigits: n >= 1000 ? 0 : 2 }));
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const recordCode = (record: TradeRecord) => record.symbol || record.target?.code;

export default function ReviewView({ records, stock, from, onOpenNote }: { records: TradeRecord[]; stock: string; from: string; onOpenNote: (id: string) => void }) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    recentTrades()
      .then((t) => alive && setTrades(t))
      .catch(() => alive && (setFailed(true), setTrades([])));
    return () => {
      alive = false;
    };
  }, []);

  const rounds = useMemo(() => (trades ? pairTrades(trades) : []), [trades]);
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of records) {
      if (r.symbol && r.symbolName) m.set(r.symbol, r.symbolName);
      if (r.target) m.set(r.target.code, r.target.name);
    }
    return m;
  }, [records]);
  // 노트에 이름이 없는 종목(노트 없이 산 종목)은 종목 검색으로 이름을 찾음
  const [found, setFound] = useState<Record<string, string>>({});
  useEffect(() => {
    const miss = [...new Set(rounds.map((r) => r.symbol))].filter((c) => !names.has(c) && !Object.hasOwn(found, c));
    if (!miss.length) return;
    let alive = true;
    Promise.all(miss.map((c) => searchAllSymbols(c).then((l) => [c, l.find((x) => x.code === c)?.name ?? c] as const).catch(() => [c, c] as const))).then((pairs) => alive && setFound((f) => ({ ...f, ...Object.fromEntries(pairs) })));
    return () => {
      alive = false;
    };
  }, [rounds, names, found]);
  const nameOf = useCallback((c: string) => names.get(c) ?? found[c] ?? c, [names, found]);
  const selectedCodes = useMemo(
    () => new Set(records.filter((r) => (r.symbolName ?? r.target?.name) === stock).map(recordCode)),
    [records, stock],
  );
  const matchesStock = useCallback((code: string) => stock === "all" || selectedCodes.has(code) || nameOf(code) === stock, [stock, selectedCodes, nameOf]);
  const codes = useMemo(
    () => [...new Set(records.map(recordCode))].filter((code): code is string => code !== undefined && matchesStock(code)),
    [records, matchesStock],
  );
  // 청산한 매매는 매도일, 보유 중인 매매는 매수일로 기간을 거름. 그 전에 쓴 계획은 복기에 사용.
  const reviews = useMemo(() => {
    const visible = rounds.filter((r) => matchesStock(r.symbol) && (r.exit?.d ?? r.entry.d) >= from);
    return reviewRounds(records, visible, nameOf);
  }, [records, rounds, matchesStock, from, nameOf]);
  const changes = useMemo(() => planChanges(records, codes, nameOf).filter((c) => c.at.slice(0, 10) >= from), [records, codes, nameOf, from]);
  const list = useMemo(() => habits(reviews, changes), [reviews, changes]);
  // 매매한 종목의 일봉: '계획대로 했다면' 계산 · 매매 차트에 씀
  const barKey = [...new Set(reviews.map((r) => r.round.symbol))].sort().join(",");
  const [barsBy, setBarsBy] = useState<Record<string, Bar[]>>({});
  useEffect(() => {
    let alive = true;
    for (const c of barKey ? barKey.split(",") : []) void loadDailyAny(c).then((b) => alive && setBarsBy((m) => (m[c] === b ? m : { ...m, [c]: b })));
    return () => {
      alive = false;
    };
  }, [barKey]);
  const keyOf = (r: RoundReview) => `${r.round.symbol}:${r.round.entry.d}`;
  const whatIfs = useMemo(() => {
    const m = new Map<string, WhatIf>();
    for (const r of reviews) {
      const bars = barsBy[r.round.symbol];
      const w = bars?.length ? ifFollowed(r.round, r.plan, bars.map((b) => ({ d: barDate(b.time), open: b.open, high: b.high, low: b.low, close: b.close }))) : null;
      if (w) m.set(`${r.round.symbol}:${r.round.entry.d}`, w);
    }
    return m;
  }, [reviews, barsBy]);
  // 선택 기간에 노트를 남겼고 매매 이력이 없는 종목
  const traded = new Set(rounds.map((r) => r.symbol));
  const activeNoteCodes = new Set(records.filter((r) => r.date >= from).map(recordCode));
  const waiting = codes.filter((c) => activeNoteCodes.has(c) && !traded.has(c));

  if (!trades) return <div className="mm-card mm-rv-empty"><BeeLoader size="sm" label="내 매매" /></div>;
  const closed = reviews.filter((r) => r.round.exit);
  const planned = reviews.filter((r) => r.plan).length;
  const kept = closed.filter((r) => r.plan && !r.flags.some((f) => f.bad)).length;
  const wins = closed.filter((r) => (r.round.ret ?? 0) > 0).length;
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  // 계획대로 했다면 vs 실제 (둘 다 끝난 매매만 비교)
  const both = closed.flatMap((r) => {
    const w = whatIfs.get(keyOf(r));
    return w?.exit && r.round.ret !== null ? [{ plan: w.ret, real: r.round.ret }] : [];
  });
  const avgPlan = both.reduce((s, b) => s + b.plan, 0) / (both.length || 1);
  const avgReal = both.reduce((s, b) => s + b.real, 0) / (both.length || 1);

  const replayStocks = [...new Set([...codes, ...rounds.map((r) => r.symbol)])].filter(matchesStock).map((code) => ({ code, name: nameOf(code) }));

  return (
    <div className="mm-rv">
      {!!replayStocks.length && <ReplayView key={stock} records={records} trades={trades} stocks={replayStocks} onOpenNote={onOpenNote} />}
      {failed && <p className="mm-card mm-rv-empty">로그인하고 증권사를 연결하면 실제 체결과 비교해요. 지금은 노트만 보여요.</p>}
      <section className="mm-rv-stats" aria-label="복기 요약">
        <div>
          <small>매매</small>
          <b>{reviews.length}건</b>
        </div>
        <div>
          <small title="전체 매매 가운데, 사기 전에 쓴 노트에 매수 · 손절 · 목표 가격을 적어 둔 매매의 비율">계획을 세운 매매 ⓘ</small>
          <b>{rate(planned, reviews.length)}</b>
        </div>
        <div>
          <small title="끝난 매매 가운데, 계획을 세웠고 늦은 손절 · 이른 익절 · 비싸게 산 것 없이 계획대로 마친 매매의 비율">계획 이행률 ⓘ</small>
          <b>{rate(kept, closed.length)}</b>
        </div>
        <div>
          <small title="끝난 매매 가운데 수익으로 끝난 매매의 비율">승률 ⓘ</small>
          <b>{rate(wins, closed.length)}</b>
        </div>
      </section>

      <section className="mm-card mm-rv-habits">
        <h2>자주 반복되는 습관</h2>
        {both.length > 0 && (
          <p className="mm-rv-whatif-sum" title="끝난 매매 가운데 계획한 손절 · 목표를 그대로 지켰다면 어떻게 끝났을지 일봉으로 따라가 본 결과예요. 한 봉에 손절 · 목표가 다 닿으면 손절로 봐요.">
            끝난 매매 {both.length}건을 계획대로 했다면 평균 <b className={avgPlan >= 0 ? "gain" : "loss"}>{pct(avgPlan)}</b>, 실제로는 평균 <b className={avgReal >= 0 ? "gain" : "loss"}>{pct(avgReal)}</b>
            {Math.abs(avgPlan - avgReal) >= 0.05 && ` — 계획대로 한 쪽이 ${Math.abs(avgPlan - avgReal).toFixed(2)}%p ${avgPlan > avgReal ? "높았어요" : "낮았어요"}`} ⓘ
          </p>
        )}
        {list.length ? (
          <>
            {[true, false].map((bad) => {
              const part = list.filter((h) => h.bad === bad);
              return part.length ? (
                <div key={String(bad)} className="mm-rv-habit-group">
                  <h3>{bad ? "고칠 점" : "잘한 점"}</h3>
                  <ul>
                    {part.map((h) => (
                      <li key={h.text} className={h.bad ? "bad" : "good"}>
                        {h.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })}
          </>
        ) : (
          <p className="mm-rv-muted">아직 복기할 매매가 없어요. Note에 매수 · 손절 · 목표 가격을 적고 매매하면 여기서 비교해요.</p>
        )}
      </section>

      <section className="mm-card mm-rv-rounds">
        <h2>매매마다 계획 vs 실제</h2>
        {!reviews.length ? (
          <p className="mm-rv-muted">{stock === "all" && !from ? "체결된 매매가 없어요." : "선택한 조건에 해당하는 매매가 없어요."}</p>
        ) : (
          <ul>
            {reviews.map((r) => (
              <RoundRow key={keyOf(r)} r={r} bars={barsBy[r.round.symbol]} whatIf={whatIfs.get(keyOf(r)) ?? null} onOpenNote={onOpenNote} />
            ))}
          </ul>
        )}
      </section>

      {!!changes.length && (
        <section className="mm-card mm-rv-changes">
          <h2>계획이 바뀐 흐름</h2>
          <ul>
            {changes.slice(0, 20).map((c) => (
              <li key={`${c.symbol}:${c.at}:${c.field}`} className={c.bad ? "bad" : ""}>
                <time>{shortDate(c.at.slice(0, 10))}</time> <b>{c.name}</b> {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!waiting.length && (
        <section className="mm-card mm-rv-changes">
          <h2>계획만 세우고 안 산 종목</h2>
          <p className="mm-rv-muted">기다린 것도 판단이에요. 그때 계획한 가격까지 왔는지 차트에서 확인해 보세요.</p>
          <div className="mm-rv-chips">
            {waiting.slice(0, 12).map((c) => (
              <Link key={c} href={`/workshop?symbol=${encodeURIComponent(c)}&name=${encodeURIComponent(nameOf(c))}`}>
                {nameOf(c)}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RoundRow({ r, bars, whatIf, onOpenNote }: { r: RoundReview; bars: Bar[] | undefined; whatIf: WhatIf | null; onOpenNote: (id: string) => void }) {
  const { round, plan } = r;
  const bad = r.flags.filter((f) => f.bad).length;
  const [open, setOpen] = useState(false);
  return (
    <li className={bad ? "bad" : round.exit ? "good" : ""}>
      <div className="mm-rv-top">
        <b>{r.name}</b>
        <span>
          {shortDate(round.entry.d)} 매수 {won(round.entry.px)}
          {round.exit ? ` → ${shortDate(round.exit.d)} 매도 ${won(round.exit.px)}` : " · 보유 중"}
        </span>
        {round.ret !== null && <em className={round.ret > 0 ? "gain" : "loss"}>{pct(round.ret)}</em>}
      </div>
      {plan ? (
        <div className="mm-rv-plan">
          <span>계획</span> 매수 {won(plan.buy)} · 손절 {won(plan.stop)} · 목표 {won(plan.target)}
          <button type="button" onClick={() => onOpenNote(plan.recordId)}>
            그때 쓴 노트 ›
          </button>
        </div>
      ) : r.latest ? (
        <div className="mm-rv-plan">
          <span>지금 계획</span> 매수 {won(r.latest.buy)} · 손절 {won(r.latest.stop)} · 목표 {won(r.latest.target)}
          <button type="button" onClick={() => onOpenNote(r.latest!.recordId)}>
            노트 보기 ›
          </button>
        </div>
      ) : null}
      <ul className="mm-rv-flags">
        {r.flags.map((f) => (
          <li key={f.text} className={f.bad ? "bad" : "good"}>
            {f.bad ? "✕" : "✓"} {f.text}
          </li>
        ))}
      </ul>
      {whatIf && (
        <p className="mm-rv-whatif" title="실제로 산 가격에서 계획한 손절 · 목표를 그대로 지켰다면 어떻게 끝났을지 일봉으로 따라가 본 결과예요. 산 다음 거래일부터 보고, 한 봉에 손절 · 목표가 다 닿으면 손절로 봐요.">
          <span>계획대로 했다면</span>
          {whatIf.exit ? (
            <>
              {shortDate(whatIf.exit.d)} {whatIf.why === "target" ? "목표" : "손절"} {won(whatIf.exit.px)}에 나와 <b className={whatIf.ret >= 0 ? "gain" : "loss"}>{pct(whatIf.ret)}</b>
            </>
          ) : (
            <>
              아직 손절 · 목표에 닿지 않았어요 ({shortDate(whatIf.lastD)} 종가 기준 <b className={whatIf.ret >= 0 ? "gain" : "loss"}>{pct(whatIf.ret)}</b>)
            </>
          )}
          {round.ret !== null && whatIf.exit && (
            <em>
              실제 {pct(round.ret)}
              {Math.abs(round.ret - whatIf.ret) >= 0.05 && ` — 계획대로 했을 때보다 ${Math.abs(round.ret - whatIf.ret).toFixed(2)}%p ${round.ret > whatIf.ret ? "높았어요" : "낮았어요"}`}
            </em>
          )}
        </p>
      )}
      <button type="button" className="mm-rv-chart-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "차트 접기" : "차트로 보기"}
      </button>
      {open && (bars ? <RoundChart r={r} bars={bars} whatIf={whatIf} /> : <div className="mm-rv-chart is-empty"><BeeLoader size="sm" /></div>)}
    </li>
  );
}
