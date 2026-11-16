import SiteHeader from "../SiteHeader";

// 아카이브: 메뉴 자리만 먼저 둠 (지난 매매 기록·전략을 모아 볼 화면)
// 트레이더 화면(투자 정보 /insights)은 상단 FOR TRADE 메뉴로 옮김
export default function ArchivePage() {
  return (
    <main className="placeholder-page">
      <SiteHeader active="archive" />
      <section className="placeholder-card">
        <h1>아카이브</h1>
        <p>준비 중이에요</p>
      </section>
    </main>
  );
}
