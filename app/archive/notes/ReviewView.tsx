"use client";
// 내 노트 · 복기형 (2026-11-20): 내가 쓴 종목 전략(계획) vs 실제 매매
//   위: 숫자 요약(매매 · 계획 있던 비율 · 계획대로 끝낸 비율 · 이긴 비율) + 자주 반복되는 습관
//   가운데: 매매마다 계획 가격과 실제 가격, 지킨 것 · 어긴 것 (누르면 그때 쓴 노트를 오른쪽에)
//   아래: 종목 전략이 바뀐 흐름 (손절선을 내린 건 빨갛게)
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TradeRecord } from "../../../lib/records";
import { recentTrades } from "../../../lib/api/performance";
import { searchAllSymbols } from "../../../lib/market-data";
import { pairTrades, type MyRound } from "../../../lib/strategy-use";
import { habits, planChanges, reviewRounds, type RoundReview } from "../../../lib/self-review";
import { shortDate } from "./model";
import ReplayView from "./ReplayView";
import BeeLoader from "../../BeeLoader";

const won = (n: number | null) => (n === null ? "—" : n.toLocaleString("ko-KR", { maximumFractionDigits: n >= 1000 ? 0 : 2 }));
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export default function ReviewView({ records, stock, onOpenNote }: { records: TradeRecord[]; stock: string; onOpenNote: (id: string) => void }) {
  const [rounds, setRounds] = useState<MyRound[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    recentTrades()
      .then((t) => alive && setRounds(pairTrades(t)))
      .catch(() => alive && (setFailed(true), setRounds([])));
    return () => {
      alive = false;
    };
  }, []);

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
    const miss = [...new Set((rounds ?? []).map((r) => r.symbol))].filter((c) => !names.has(c) && !found[c]);
    if (!miss.length) return;
    let alive = true;
    Promise.all(miss.map((c) => searchAllSymbols(c).then((l) => [c, l.find((x) => x.code === c)?.name ?? c] as const).catch(() => [c, c] as const))).then((pairs) => alive && setFound((f) => ({ ...f, ...Object.fromEntries(pairs) })));
    return () => {
      alive = false;
    };
  }, [rounds, names]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (c: string) => names.get(c) ?? found[c] ?? c;
  const reviews = useMemo(() => (rounds ? reviewRounds(records, rounds, nameOf).filter((r) => stock === "all" || r.name === stock) : []), [rounds, records, stock, found]); // eslint-disable-line react-hooks/exhaustive-deps
  const codes = useMemo(() => [...new Set(records.flatMap((r) => (r.symbol ? [r.symbol] : r.target ? [r.target.code] : [])))].filter((c) => stock === "all" || nameOf(c) === stock), [records, stock]); // eslint-disable-line react-hooks/exhaustive-deps
  const changes = useMemo(() => planChanges(records, codes, nameOf), [records, codes]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => habits(reviews, changes), [reviews, changes]);
  // 매매 없이 계획만 남긴 종목 (기다린 기록)
  const traded = new Set(reviews.map((r) => r.round.symbol));
  const waiting = codes.filter((c) => !traded.has(c));

  if (!rounds) return <div className="mm-card mm-rv-empty"><BeeLoader size="sm" label="내 매매" /></div>;
  const closed = reviews.filter((r) => r.round.exit);
  const planned = reviews.filter((r) => r.plan).length;
  const kept = closed.filter((r) => r.plan && !r.flags.some((f) => f.bad)).length;
  const wins = closed.filter((r) => (r.round.ret ?? 0) > 0).length;
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  // 재생할 종목: 노트를 남겼거나 매매한 종목 (이름 기준으로 위의 '종목' 고르기와 맞춤)
  const replayStocks = [...new Set([...records.flatMap((r) => (r.symbol ? [r.symbol] : r.target ? [r.target.code] : [])), ...(rounds ?? []).map((r) => r.symbol)])].map((c) => ({ code: c, name: nameOf(c) }));
  const picked = stock === "all" ? undefined : replayStocks.find((x) => x.name === stock)?.code;

  return (
    <div className="mm-rv">
      {!!replayStocks.length && <ReplayView records={records} stocks={replayStocks} initial={picked} onOpenNote={onOpenNote} />}
      {failed && <p className="mm-card mm-rv-empty">로그인하고 증권사를 연결하면 실제 체결과 비교해요. 지금은 노트만 보여요.</p>}
      <section className="mm-rv-stats" aria-label="복기 요약">
        <div>
          <small>매매</small>
          <b>{reviews.length}번</b>
        </div>
        <div>
          <small title="산 날까지 쓴 노트에 매수 · 손절 · 목표 가격이 있던 매매">계획 있던 매매 ⓘ</small>
          <b>{rate(planned, reviews.length)}</b>
        </div>
        <div>
          <small title="끝난 매매 중 계획이 있었고, 늦은 손절 · 이른 익절 · 비싸게 산 것이 없는 매매">계획대로 끝냄 ⓘ</small>
          <b>{rate(kept, closed.length)}</b>
        </div>
        <div>
          <small>이긴 비율</small>
          <b>{rate(wins, closed.length)}</b>
        </div>
      </section>

      <section className="mm-card mm-rv-habits">
        <h2>자주 반복되는 습관</h2>
        {list.length ? (
          <ul>
            {list.map((h) => (
              <li key={h.text} className={h.bad ? "bad" : "good"}>
                {h.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mm-rv-muted">아직 복기할 매매가 없어요. 종목 전략에 매수 · 손절 · 목표 가격을 적고 매매하면 여기서 비교해요.</p>
        )}
      </section>

      <section className="mm-card mm-rv-rounds">
        <h2>매매마다 계획 vs 실제</h2>
        {!reviews.length ? (
          <p className="mm-rv-muted">{stock === "all" ? "체결된 매매가 없어요." : `${stock} 매매가 없어요.`}</p>
        ) : (
          <ul>
            {reviews.map((r) => (
              <RoundRow key={`${r.round.symbol}:${r.round.entry.d}`} r={r} onOpenNote={onOpenNote} />
            ))}
          </ul>
        )}
      </section>

      {!!changes.length && (
        <section className="mm-card mm-rv-changes">
          <h2>종목 전략이 바뀐 흐름</h2>
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

function RoundRow({ r, onOpenNote }: { r: RoundReview; onOpenNote: (id: string) => void }) {
  const { round, plan } = r;
  const bad = r.flags.filter((f) => f.bad).length;
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
    </li>
  );
}
