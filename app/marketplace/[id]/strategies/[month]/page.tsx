"use client";
// 월별 전략 보기: 매매 규칙 · 그 달 차트에 그은 선(지지선 · 채널 · 피보나치 · 엘리어트 파동 …) · 매수/매도 · 계획대로 했는지
//   전략 하나에는 매매 기록 여러 건 + 매매가 아닌 증시 메모 · 종목 노트도 들어감 → 날짜순 한 줄 기록으로
//   내용은 서버만 읽는 data/market-sim/{id}.json → /strategy-data/{id}/{달} 이 열람권을 확인하고 그 달 것만 보냄 (실제 일봉에 규칙을 돌린 결과, scripts/market-sim)
//   열람권으로 연 달이나 무료 첫 전략만 내용을 보여 주고, 아니면 잠금 + 열람권 버튼
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import SiteHeader from "../../../../SiteHeader";
import { opened, usePasses } from "../../../../../lib/purchases";
import { monthLabel, pct, strategiesOf, tone, traderById } from "../../../data";
import { CartButton, StrategyButton, useNotice } from "../../../parts";
import StrategyChart from "../../../StrategyChart";
import { GradeBadge } from "../../../GradeParts";
import { useDark, type SimDetail } from "../../../GuessFirst";
import { fetchStrategyMonth } from "../../../../../lib/strategy-data";
import { markFreeView } from "../../../../../lib/free-views";
import "../../../marketplace.css";

export default function StrategyView() {
  const { id, month } = useParams<{ id: string; month: string }>();
  const t = traderById(id);
  const passes = usePasses();
  const { notify, node } = useNotice();
  const dark = useDark();
  const [detail, setDetail] = useState<{ id: string; data: SimDetail | null } | null>(null);
  // 열람권으로 이 달을 열면 다시 받음 (서버가 열람권을 확인하고 그 달 것만 줌)
  const isOpen = !!t && opened(passes, t.id, month);
  const key = `${id}/${month}/${isOpen}`;

  useEffect(() => {
    let cancelled = false;
    fetchStrategyMonth(id, month)
      .then((data) => !cancelled && setDetail({ id: key, data }))
      .catch(() => !cancelled && setDetail({ id: key, data: null }));
    return () => {
      cancelled = true;
    };
  }, [id, month, key]);

  const list = t ? strategiesOf(t) : [];
  const s = list.find((x) => x.month === month);
  // 무료 전략을 열면 아카이브에 남김 (열람권 없이 본 것도)
  const freeKey = t && s?.free ? `${t.id}|${t.name}|${month}|${s.title}` : "";
  useEffect(() => {
    if (!freeKey) return;
    const [traderId, traderName, m, ...title] = freeKey.split("|");
    markFreeView({ traderId, traderName, month: m, title: title.join("|") });
  }, [freeKey]);
  if (!t || !s) {
    return (
      <main className="mk-page">
        <SiteHeader active="marketplace" />
        <div className="mk-wrap mk-narrow">
          <p className="mk-card mk-empty">
            전략을 찾을 수 없어요. <Link href={t ? `/marketplace/${t.id}` : "/marketplace"}>돌아가기</Link>
          </p>
        </div>
      </main>
    );
  }
  const unlocked = !!s.free || opened(passes, t.id, month);
  const m = detail?.id === key ? detail.data?.months.find((x) => x.month === month) : undefined;
  const loading = detail?.id !== key;
  const cur = (n: number) => (detail?.data?.market === "US" ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : `${n.toLocaleString("ko-KR")}원`);

  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap mk-narrow">
        <Link href={`/marketplace/${t.id}`} className="mk-back">
          ‹ <GradeBadge grade={t.grade?.grade} unrated={t.grade?.unrated} small /> {t.name}
        </Link>
        <section className="mk-card mk-sim-head">
          <small>
            {monthLabel(month)} 전략{s.free ? " · 무료" : ""}
          </small>
          <h1>{s.title}</h1>
          <p>{s.summary}</p>
          <div className="mk-sim-nums">
            <span>
              그 달 수익률 <b className={tone(s.ret)}>{pct(s.ret)}</b>
            </span>
            <span>
              계획대로 한 비율 <b>{s.follow}%</b>
            </span>
            {(detail?.data?.rule.name ?? t.rule?.name) && (
              <span>
                규칙 <b>{detail?.data?.rule.name ?? t.rule?.name}</b>
              </span>
            )}
          </div>
          {/* 원본은 그대로 보존, 정정 · 사후 해설은 따로 (이용 정책) */}
          <p className="mk-sim-origin">
            ✓ 최초 확정본 그대로 · 정정 0건 · <Link href="/marketplace/policy">이용 정책</Link>
          </p>
        </section>

        {!unlocked ? (
          <section className="mk-card mk-sim-lock">
            <strong>이 달 전략에 담긴 것 (구매 전 미리 보기)</strong>
            <ul className="mk-sim-peek">
              <li>
                <span>이 달에 진입한 매매</span>
                <b>{s.trades ?? 0}건</b>
              </li>
              <li>
                <span>다룬 종목</span>
                <b>{s.symbols?.length ? s.symbols.join(", ") : "매매 없음 (관찰 · 메모)"}</b>
              </li>
              {s.sample && (
                <li className="wide">
                  <span>전략 설명 샘플</span>
                  <b>“{s.sample}”</b>
                </li>
              )}
            </ul>
            <p>열면 차트에 그은 선, 진입 · 손절 · 목표 근거, 매매를 시간순으로, 계획대로 했는지까지 볼 수 있어요. 매매는 진입한 달 전략에 들어가요.</p>
            <div className="mk-buyrow">
              <CartButton trader={t} strategy={s} />
              <StrategyButton trader={t} strategy={s} className="mk-primary" notify={notify} />
            </div>
          </section>
        ) : loading ? (
          <p className="mk-card mk-empty">불러오는 중…</p>
        ) : !m || !detail?.data ? (
          <p className="mk-card mk-empty">이 달의 전략 내용을 불러오지 못했어요.</p>
        ) : (
          <>
            <section className="mk-card mk-sim-rule">
              <h2>매매 규칙 · {detail.data.rule.name}</h2>
              <p>{detail.data.rule.desc}</p>
              <small>매매 종목: {detail.data.symbols.map((x) => x.name).join(" · ")}</small>
            </section>

            <section className="mk-card mk-sim-chart-card">
              <h2>
                {m.symbol.name} <small>{monthLabel(month)} · 그은 선과 매수 · 매도</small>
              </h2>
              {m.candles.length ? <StrategyChart candles={m.candles} trades={m.trades} notes={m.notes} ind={m.ind} code={m.symbol.code} dark={dark} currency={detail.data.market === "US" ? "USD" : "KRW"} /> : <p className="mk-empty">차트 데이터가 없어요.</p>}
            </section>

            <section className="mk-card mk-sim-trades">
              <h2>
                이 달의 기록{" "}
                <small>
                  매매 {m.trades.length}건 · 종목 노트 {(m.notes ?? []).filter((n) => n.type === "stock").length}개 · 증시 메모 {(m.notes ?? []).filter((n) => n.type === "market").length}개
                </small>
              </h2>
              <ul>
                {[
                  ...m.trades.map((tr) => ({ d: tr.entry.d, k: `t-${tr.code}-${tr.entry.d}`, tr })),
                  ...(m.notes ?? []).map((n, x) => ({ d: n.d, k: `n-${x}`, n })),
                ]
                  .sort((a, b) => a.d.localeCompare(b.d))
                  .map((row) =>
                    "tr" in row && row.tr ? (
                      <li key={row.k} className={row.tr.followed ? "" : "broke"}>
                        <div className="who">
                          <i className="kind trade">매매</i>
                          <b>{row.tr.name}</b>
                          <em className={tone(row.tr.ret)}>{pct(row.tr.ret)}</em>
                          <span className={row.tr.followed ? "ok" : "no"}>{row.tr.followed ? "계획대로" : "계획과 다름"}</span>
                        </div>
                        <p>
                          <span>매수</span> {row.tr.entry.d} · {cur(row.tr.entry.px)} — {row.tr.entry.why}
                        </p>
                        <p>
                          <span>매도</span> {row.tr.exit.d} · {cur(row.tr.exit.px)} — {row.tr.exit.why}
                        </p>
                        {row.tr.lines.length > 0 && <small>그은 선: {[...new Set(row.tr.lines.map((l) => l.label))].join(" · ")}</small>}
                      </li>
                    ) : "n" in row && row.n ? (
                      <li key={row.k} className={`note ${row.n.type}`}>
                        <div className="who">
                          <i className={`kind ${row.n.type}`}>{row.n.type === "market" ? "증시 메모" : row.n.type === "carry" ? "이어진 보유" : "종목 노트"}</i>
                          {row.n.name && <b>{row.n.name}</b>}
                          <time>{row.n.d}</time>
                        </div>
                        <p className="text">{row.n.text}</p>
                        {row.n.lines?.length ? <small>그은 선: {row.n.lines.map((l) => l.label).join(" · ")}</small> : null}
                      </li>
                    ) : null,
                  )}
              </ul>
              {!m.trades.length && !(m.notes ?? []).length && <p className="mk-empty">이 달은 기록이 없어요.</p>}
            </section>
          </>
        )}
      </div>
      {node}
    </main>
  );
}
