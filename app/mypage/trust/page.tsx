"use client";
// 신뢰도 점수: 산출 로직·동의 API 가 생기기 전이라 평가 대기 상태만 보여 준다
import Link from "next/link";
import { Card, PageHead } from "../ui";

const PARTS = [
  ["사전·사후 기록 비율", "체결 전후에 남긴 메모 비율"],
  ["저장 이력", "기록을 고치지 않고 남긴 기간"],
  ["전략 평가", "공개 전략의 사후 성과"],
] as const;

export default function TrustPage() {
  return (
    <>
      <PageHead title="신뢰도 점수" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <strong className="mp-big-muted" style={{ margin: 0 }}>평가 대기</strong>
            <p className="mp-muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              점수를 계산하려면 활용 동의가 필요해요
            </p>
          </div>
          <Link className="mp-btn" href="/mypage/account/privacy">
            동의하러 가기
          </Link>
        </div>
      </Card>
      <Card title="점수 항목">
        <div className="mp-list">
          {PARTS.map(([name, desc]) => (
            <div key={name} style={{ minHeight: 62 }}>
              <strong style={{ fontWeight: 800 }}>{name}</strong>
              <span>{desc}</span>
              <span style={{ paddingRight: 24 }}>—</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
