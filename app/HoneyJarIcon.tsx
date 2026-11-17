// 빠른 메모 아이콘: 꿀단지 + 꿀 뜨개 (선 아이콘, 색은 currentColor). 시안 이미지를 24 칸 선으로 다시 그림
export default function HoneyJarIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* 입구 */}
      <ellipse cx="11.5" cy="7" rx="6.5" ry="1.9" />
      {/* 목 · 몸통 */}
      <path d="M6.3 8.6c0 1-.6 1.6-1.1 2.2-.7.8-1.2 1.8-1.2 3.2v2.8c0 2.4 1.7 4.2 4 4.2h7c2.3 0 4-1.8 4-4.2V14c0-1.4-.5-2.4-1.2-3.2-.5-.6-1.1-1.2-1.1-2.2" />
      {/* 뜨개 손잡이 */}
      <path d="M17.6 2.6 11.6 14" />
      {/* 뜨개 머리 (홈 세 줄) */}
      <path d="M9.4 13.2l4.1 1.7M8.6 15.4l4.6 1.8M8.4 17.6l3.5 1.4" />
    </svg>
  );
}
