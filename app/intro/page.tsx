import type { Metadata } from "next";
import Intro from "./Intro";

export const metadata: Metadata = { title: "TRACKIT — 매매를 기록하고, 전략을 사고팔다", description: "차트 분석부터 매매 기록, 트레이더 구독과 전략 판매까지 TRACKIT에서 이어가세요." };
export default function Page() { return <Intro />; }
