// 좋아요 아이콘: 홈 로고(public/home/brand.png)와 같은 꿀단지 + 꿀 뜨개. 많을수록 꿀이 차오름 (0이면 빈 단지, max 이상이면 가득 차 넘쳐 흐름)
import { useId } from "react";

/** 개수 → 꿀 높이(0~1). 로그 눈금이라 처음 몇 개도 눈에 띄게 차고, max 에서 가득 */
export const honeyLevel = (n: number, max = 1000) => (n <= 0 ? 0 : Math.max(0.15, Math.min(1, Math.log1p(n) / Math.log1p(max))));

const BODY = "M7.3 9.2c0 1.4-2.3 2.4-2.3 5.1v3.2c0 2 1.6 3.5 3.6 3.5h6.8c2 0 3.6-1.5 3.6-3.5v-3.2c0-2.7-2.3-3.7-2.3-5.1z";
const LINE = "var(--honey-line, #b9770e)";
const HONEY = "var(--honey-fill, #f5b21a)";

export default function HoneyPot({ count = 0, max = 1000, level, size = 14, className = "" }: { count?: number; max?: number; /** 직접 높이를 줄 때 (켜짐/꺼짐 버튼은 1 / 0) */ level?: number; size?: number; className?: string }) {
  const id = useId();
  const lv = level ?? honeyLevel(count, max);
  const full = lv >= 0.85;
  const top = 21 - lv * 11.8; // 단지 몸통은 y 9.2 ~ 21
  return (
    <svg className={`honeypot ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ flex: "none", overflow: "visible" }}>
      <defs>
        <clipPath id={`${id}b`}>
          <path d={BODY} />
        </clipPath>
      </defs>
      {lv > 0 && (
        <g clipPath={`url(#${id}b)`}>
          <rect x="0" y={top} width="24" height="24" fill={HONEY} />
          <rect x="0" y={top} width="24" height="1.2" fill="var(--honey-top, #ffd45c)" />
        </g>
      )}
      <g fill="none" stroke={LINE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={BODY} />
        <ellipse cx="12" cy="7.6" rx="5.7" ry="1.6" fill={full ? HONEY : "none"} />
        {/* 꿀 뜨개: 비스듬한 막대 + 머리의 홈 세 줄 */}
        <path d="M16.9 2.4 12.6 11.4" strokeWidth="1.6" />
        <path d="M11.6 12.2l2.6 1M10.4 13.9l3.4 1.3M10 15.9l2.6 1" strokeWidth="1.4" />
      </g>
      {full && <path d="M8.2 8.9v2.3a1 1 0 0 0 2 0V9.1M14.6 9.1v1.2a.8.8 0 0 0 1.6 0V8.9" fill={HONEY} stroke={LINE} strokeWidth=".9" />}
    </svg>
  );
}
