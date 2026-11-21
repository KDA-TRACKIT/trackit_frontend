"use client";
// 전략 보기 (전략 마켓에서 열 때) — 화면은 전략보관함과 같은 StrategyDetail (2026-11-21 통일)
//   경로마다 다른 건 상단 메뉴(전략 마켓)와 뒤로 가기(‹ 트레이더 이름)뿐
//   key = 전략 번호(s1 …). 예전 달(YYYY-MM) 주소면 그 달이 들어 있는 전략을 그 달 칩을 고른 채로 엶
import { useParams } from "next/navigation";
import StrategyDetail from "../../../StrategyDetail";

export default function StrategyView() {
  const { id, key } = useParams<{ id: string; key: string }>();
  return <StrategyDetail key={`${id}/${key}`} entry="market" traderId={id} strategyKey={key} />;
}
