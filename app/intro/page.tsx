import type { Metadata } from "next";
import Intro from "./Intro";
import "./intro.css";

export const metadata: Metadata = { title: "TRACKIT — 당신의 투자를 위한 하나의 플랫폼", description: "차트분석부터 매매일지, 전략공부와 전략판매까지. 투자에 담긴 생각을 연결하세요." };
export default function Page() { return <Intro />; }
