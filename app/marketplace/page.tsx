import SiteHeader from "../SiteHeader";

// 마켓플레이스: 메뉴 자리만 먼저 둠 (무엇을 사고팔지 정해지면 채움)
export default function MarketplacePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f6f6f6", fontFamily: 'Pretendard,"Noto Sans KR",sans-serif' }}>
      <SiteHeader active="marketplace" />
      <section
        style={{
          width: "min(1312px, calc(100% - 48px))",
          margin: "40px auto",
          padding: "56px 32px",
          border: "1px solid #e0e0e0",
          borderRadius: 16,
          background: "#fff",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#141414" }}>마켓플레이스</h1>
        <p style={{ margin: "12px 0 0", color: "#7a7a7a", fontSize: 14 }}>준비 중이에요.</p>
      </section>
    </main>
  );
}
