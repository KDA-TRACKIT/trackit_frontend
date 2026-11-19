"use client";
// 활동 이력: 매매·메모 요약 + 최근 기록
import Link from "next/link";
import { classify, dateLabel } from "../../../lib/records";
import { newestFirst, useActivity, isBuy, isSell } from "../data";
import { Card, Empty, PageHead, Stat, Table } from "../ui";

const KIND = { pre: "사전 노트", post: "사후 노트", pending: "체결 대기", thought: "노트" } as const;

export default function ActivityPage() {
  const { records, trades, symbols } = useActivity();
  const recent = newestFirst(records).slice(0, 10);
  return (
    <>
      <PageHead title="활동 이력" />
      <Card>
        <div className="mp-stats">
          <Stat label="총 매매" value={trades.length} unit="회" />
          <Stat label="작성한 노트" value={records.length} unit="건" />
          <Stat label="거래 종목" value={symbols.length} unit="개" />
        </div>
      </Card>
      <Card title="최근 활동" meta={records.length || undefined} action={<Link className="mp-link" href="/mypage/activity/trades">거래 기록 ›</Link>}>
        {recent.length > 0 && (
          <Table cols={["날짜", "구분", "종목", "노트"]}>
            {recent.map((r) => (
              <div className="mp-tr" key={r.id}>
                <span className="num">{dateLabel(r.date)}</span>
                <span>
                  {isBuy(r.side) ? <em className="buy">매수</em> : isSell(r.side) ? <em className="sell">매도</em> : null} {KIND[classify(r)]}
                </span>
                <span>{r.symbolName ?? r.symbol ?? r.topic ?? "—"}</span>
                <span className="clip">{r.text}</span>
              </div>
            ))}
          </Table>
        )}
        {recent.length === 0 && (
          <Empty text="아직 기록이 없어요">
            <Link className="mp-btn primary" href="/workshop">
              트레이딩 로그 열기
            </Link>
          </Empty>
        )}
      </Card>
    </>
  );
}
