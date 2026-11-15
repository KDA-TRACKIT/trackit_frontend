import SiteHeader from "../SiteHeader";

// 전략 쇼핑(마켓플레이스): 메뉴 자리만 먼저 둠 (무엇을 사고팔지 정해지면 채움)
export default function MarketplacePage() {
  return (
    <main className="placeholder-page">
      <SiteHeader active="marketplace" />
      <section className="placeholder-card">
        <h1>전략 쇼핑</h1>
        <p>준비 중이에요</p>
      </section>
    </main>
  );
}
