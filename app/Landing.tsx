// 시작 화면 (로그인 전 랜딩). 스타일은 landing.css
import Link from "next/link";
import SiteHeader from "./SiteHeader";
import "./landing.css";

const STEPS = [
  ["01", "먼저, 전략을 살펴봅니다", "트레이더의 투자 전략과 매매 방식을 확인하고, 주요 특징을 이해합니다."],
  ["02", "그다음, 전략을 비교합니다", "수익률과 거래 기록, 참고 지표를 비교해 나에게 맞는 전략을 찾아봅니다."],
  ["03", "마지막으로, 전략을 선택합니다", "충분히 검토한 전략을 선택하고, 내 투자 판단의 기준으로 활용합니다."],
] as const;

const BARS = [80, 116, 150, 190, 66, 116, 156, 194];

export default function Landing() {
  return (
    <main className="landing">
      {/* 다른 화면과 같은 상단 바 (로고·오른쪽 버튼 위치와 크기 동일), 색만 랜딩의 검은 바탕에 맞춤. 메뉴는 아직 안 둠 */}
      <SiteHeader
        tone="dark"
        menu={false}
        right={
          <Link href="/signup" className="gnb-chip">
            시작하기 <span aria-hidden>↗</span>
          </Link>
        }
      />

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">TRADE WITH A STRATEGY.</p>
          <span className="bar" aria-hidden />
          <h1>감으로 투자하던 시대는 지났다.</h1>
          <h2>이제는 전략을 보고, 비교하고, 선택할 시간.</h2>
          <p className="lead">전략을 살펴보고, 비교하고, 나에게 맞는 투자 방식을 찾아보세요.</p>
          <a href="#steps" className="scroll">
            SCROLL TO EXPLORE <span aria-hidden>↓</span>
          </a>
        </div>
        <div className="landing-art" aria-hidden>
          <span className="ring r1" />
          <span className="ring r2" />
          <div className="bars">
            {BARS.map((h, i) => (
              <span key={i} style={{ height: h, marginTop: i % 2 ? 14 : 0 }} />
            ))}
          </div>
          <div className="card">
            <small>FROM INSTINCT</small>
            <strong>TO STRATEGY</strong>
          </div>
        </div>
      </section>

      <section id="steps" className="landing-steps">
        <h2>투자는 감이 아니라, 기준에서 시작됩니다.</h2>
        <p>살펴보고, 비교하고, 선택하는 세 단계로 나에게 맞는 전략을 찾아보세요.</p>
        <ol>
          {STEPS.map(([no, title, desc]) => (
            <li key={no}>
              <span className="check" aria-hidden>
                ✓
              </span>
              <div>
                <small>{no}</small>
                <strong>{title}</strong>
                <p>{desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="tail">시작하기 전에, 전략을 보는 기준부터 만들어 보세요.</p>
        <Link href="/signup" className="landing-cta">
          시작하기
        </Link>
      </section>
      <footer className="landing-foot" />
    </main>
  );
}
