"use client";
// 매매 중 아래쪽: 기업 정보 (시가총액·밸류에이션·실적·52주 범위). 백엔드가 키움 ka10001로 조회
import { useEffect, useState } from "react";
import { fetchCompany, type CompanyInfo } from "../../lib/market-data";

const n = (v: number | null, digits = 0) => (v === null ? "—" : v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }));

/** 억원 → 1,213조 1,028억 */
function eok(v: number | null) {
  if (v === null) return "—";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const jo = Math.floor(abs / 10000);
  const rest = Math.round(abs % 10000);
  if (!jo) return `${sign}${rest.toLocaleString("ko-KR")}억`;
  return `${sign}${jo.toLocaleString("ko-KR")}조${rest ? ` ${rest.toLocaleString("ko-KR")}억` : ""}`;
}

export default function CompanyPanel({ code, price }: { code: string; price: number | null }) {
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetchCompany(code, ac.signal)
      .then(setInfo)
      .catch(() => {
        if (!ac.signal.aborted) setFailed(true);
      });
    return () => ac.abort();
  }, [code]);

  if (!info) {
    return (
      <section className="ws-company" aria-label="기업 정보">
        <h2>기업 정보</h2>
        <p className="ws-company-msg">{failed ? "기업 정보를 불러오지 못했어요." : "불러오는 중…"}</p>
      </section>
    );
  }

  // 52주 범위 안에서 현재가 위치
  const pos = price !== null && info.high250 && info.low250 && info.high250 > info.low250 ? Math.min(100, Math.max(0, ((price - info.low250) / (info.high250 - info.low250)) * 100)) : null;

  return (
    <section className="ws-company" aria-label="기업 정보">
      <header>
        <h2>기업 정보</h2>
        <small>
          {info.name} · {info.code}
          {info.settlementMonth && ` · ${Number(info.settlementMonth)}월 결산`} · 키움 {info.asOf ? `${info.asOf.slice(4, 6)}.${info.asOf.slice(6, 8)} 기준 (하루 한 번 갱신)` : "기준"}
        </small>
      </header>

      <div className="ws-company-grid">
        <dl>
          <dt>시가총액</dt>
          <dd>{eok(info.marketCap)}</dd>
          <dt>상장주식수</dt>
          <dd>{info.listedShares === null ? "—" : `${n(Math.round(info.listedShares / 10))}만 주`}</dd>
          <dt>유통비율</dt>
          <dd>{n(info.floatRate, 1)}%</dd>
          <dt>외국인 소진율</dt>
          <dd>{n(info.foreignRate, 2)}%</dd>
        </dl>
        <dl>
          <dt>PER</dt>
          <dd>{n(info.per, 2)}배</dd>
          <dt>PBR</dt>
          <dd>{n(info.pbr, 2)}배</dd>
          <dt>EPS</dt>
          <dd>{n(info.eps)}원</dd>
          <dt>BPS</dt>
          <dd>{n(info.bps)}원</dd>
          <dt>ROE</dt>
          <dd>{n(info.roe, 1)}%</dd>
        </dl>
        <dl>
          <dt>매출액</dt>
          <dd>{eok(info.sales)}</dd>
          <dt>영업이익</dt>
          <dd>{eok(info.operatingProfit)}</dd>
          <dt>당기순이익</dt>
          <dd>{eok(info.netIncome)}</dd>
          <dt>영업이익률</dt>
          <dd>{info.sales && info.operatingProfit !== null ? `${((info.operatingProfit / info.sales) * 100).toFixed(1)}%` : "—"}</dd>
        </dl>
        <div className="ws-company-range">
          <h3>52주 범위</h3>
          <div className="ws-range-bar">
            <i style={{ left: `${pos ?? 0}%`, visibility: pos === null ? "hidden" : "visible" }} />
          </div>
          <div className="ws-range-ends">
            <span>
              <b className="down">{n(info.low250)}</b>
              <small>{info.low250Date?.replaceAll("-", ".")}</small>
            </span>
            <span>
              <b className="up">{n(info.high250)}</b>
              <small>{info.high250Date?.replaceAll("-", ".")}</small>
            </span>
          </div>
          <p>
            오늘 상한가 <b className="up">{n(info.upperLimit)}</b> · 하한가 <b className="down">{n(info.lowerLimit)}</b>
          </p>
        </div>
      </div>
    </section>
  );
}
