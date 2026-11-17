// 트레이더 프로필 일러스트 (사진이 없을 때): 트레이더 id 로 피부 · 머리 · 옷 · 안경 · 배경을 골라 그린 원형 얼굴
//   같은 트레이더는 늘 같은 얼굴. 외부 이미지 없이 SVG 로만
const BG = ["#e9d7e2", "#d9d6ee", "#d6e4f0", "#e4e9d6", "#f0e1d2", "#d8e8e4"];
const SKIN = ["#f6d7c3", "#eac0a2", "#d9a37f", "#b9805a", "#8d5a3b"];
const HAIR = ["#2b2523", "#3d2a1f", "#5a3a26", "#1f2433", "#6b6f78", "#8a5a2b"];
const SHIRT = ["#2f3d5c", "#58607a", "#3f5e5a", "#6d4c5f", "#2b2f36", "#7a6a55"];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export default function TraderAvatar({ seed, size = 40 }: { seed: string; size?: number }) {
  const h = hash(seed);
  const pick = <T,>(list: T[], shift: number) => list[(h >>> shift) % list.length];
  const bg = pick(BG, 0);
  const skin = pick(SKIN, 3);
  const hair = pick(HAIR, 7);
  const shirt = pick(SHIRT, 11);
  const style = (h >>> 15) % 3; // 0 짧은 머리 · 1 옆으로 넘긴 머리 · 2 긴 머리
  const glasses = ((h >>> 18) & 3) === 0;
  return (
    <svg className="trader-face" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <clipPath id={`tf-${seed}`}>
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>
      <g clipPath={`url(#tf-${seed})`}>
        <rect width="40" height="40" fill={bg} />
        {style === 2 && <path d="M10 18c0-8 4.5-12 10-12s10 4 10 12v12H10z" fill={hair} />}
        {/* 몸 · 목 */}
        <path d="M5 41c1-8 7-11.5 15-11.5S34 33 35 41z" fill={shirt} />
        <path d="M16.5 26h7v5.5c-1 1.3-2.2 2-3.5 2s-2.5-.7-3.5-2z" fill={skin} />
        <path d="M16 30.5l4 4 4-4" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" />
        {/* 얼굴 */}
        <ellipse cx="20" cy="19" rx="7.2" ry="8.2" fill={skin} />
        <ellipse cx="12.9" cy="19.6" rx="1.3" ry="1.9" fill={skin} />
        <ellipse cx="27.1" cy="19.6" rx="1.3" ry="1.9" fill={skin} />
        {/* 머리 */}
        {style === 0 && <path d="M12.6 17.5c-.6-6 3-9.3 7.4-9.3s8 3.3 7.4 9.3c-1.6-3-4-4.3-7.4-4.3s-5.8 1.3-7.4 4.3z" fill={hair} />}
        {style === 1 && <path d="M12.5 18.5c-1-6.6 2.6-10.3 7.8-10.3 4.6 0 8 3.2 7.3 9.6-2.3-2.4-6.6-3.6-11.4-3.2-1.6.9-2.8 2.1-3.7 3.9z" fill={hair} />}
        {style === 2 && <path d="M12.4 19.5c-.8-7.3 3-11.3 7.6-11.3s8.4 4 7.6 11.3c-1.7-4.2-4.6-6.4-7.6-6.4s-5.9 2.2-7.6 6.4z" fill={hair} />}
        {/* 눈 · 입 */}
        <circle cx="17.2" cy="19.6" r=".85" fill="#2b2523" />
        <circle cx="22.8" cy="19.6" r=".85" fill="#2b2523" />
        <path d="M18.2 23.4c1.1.8 2.5.8 3.6 0" fill="none" stroke="#8a4b3c" strokeWidth=".9" strokeLinecap="round" />
        {glasses && (
          <g fill="none" stroke="#3a3330" strokeWidth=".8">
            <circle cx="17.2" cy="19.6" r="2.2" />
            <circle cx="22.8" cy="19.6" r="2.2" />
            <path d="M19.4 19.6h1.2" />
          </g>
        )}
      </g>
    </svg>
  );
}
