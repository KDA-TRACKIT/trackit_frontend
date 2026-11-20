// 꿀벌 로딩 (2026-11-20): 꿀벌이 누운 8자(∞)로 날아다니고 아래에 "Loading" + 점이 차례로 깜빡임
//   size: lg(화면 가운데 · 페이지 로딩) / sm(카드 안 · 칸 로딩). label 을 주면 Loading 아래에 한 줄 더
//   움직임을 줄이도록 설정한 사람(prefers-reduced-motion)에겐 꿀벌이 제자리에서 살짝만 흔들림
import "./bee-loader.css";

// 누운 8자 경로 (가로 120 · 세로 48 상자 안, 가운데에서 시작해 오른쪽 고리 → 왼쪽 고리)
const PATH = "M60,24 C60,4 108,4 108,24 C108,44 60,44 60,24 C60,4 12,4 12,24 C12,44 60,44 60,24";

export default function BeeLoader({ size = "lg", label }: { size?: "lg" | "sm"; label?: string }) {
  return (
    <div className={`bee-loader ${size}`} role="status" aria-live="polite" aria-label={label ? `Loading · ${label}` : "Loading"}>
      <div className="bee-loader-track">
        <svg viewBox="0 0 120 48" aria-hidden="true">
          <path d={PATH} />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bee-loader-bee" src="/images/home-bee.png" alt="" style={{ offsetPath: `path("${PATH}")` }} />
      </div>
      <p className="bee-loader-text">
        Loading
        <span aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </p>
      {label && <small className="bee-loader-label">{label}</small>}
    </div>
  );
}
