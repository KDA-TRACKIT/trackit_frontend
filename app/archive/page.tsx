import Link from "next/link";
import SiteHeader from "../SiteHeader";

// 아카이브: 메뉴 자리만 먼저 둠 (지난 매매 기록·전략을 모아 볼 화면)
// 트레이더 화면(투자 정보 /insights)은 정식 메뉴가 생기기 전까지 여기서 들어감
export default function ArchivePage() {
  return (
    <main className="placeholder-page">
      <SiteHeader active="archive" />
      <section className="placeholder-card">
        <h1>아카이브</h1>
        <p>준비 중이에요</p>
      </section>
      <section className="placeholder-card archive-entry">
        <h2>트레이더 화면</h2>
        <p>섹터·지수 맵과 거시경제 지표를 한눈에</p>
        <div className="archive-entry-links">
          <Link href="/insights">트레이더 화면 열기</Link>
        </div>
      </section>
    </main>
  );
}
