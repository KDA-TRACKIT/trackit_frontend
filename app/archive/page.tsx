import { Suspense } from "react";
import ArchiveHub from "./ArchiveHub";
import "../marketplace/marketplace.css";
import "./archive.css";

// 아카이브 첫 화면 = 모든 기록 (목록 · 보드 · 차트). 내 전략 · 구매한 전략 · 전략 분석은 상단 메뉴에서
export default function ArchivePage() {
  return (
    <Suspense>
      <ArchiveHub />
    </Suspense>
  );
}
