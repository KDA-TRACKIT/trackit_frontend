// 드로잉 도구 목록 아이콘: 도구가 그리는 기본 모양을 20×20 으로 (트레이딩뷰 메뉴처럼 이름 왼쪽)
import type { ReactNode } from "react";

/** 점 (선 끝 손잡이) */
const D = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.6} fill="currentColor" stroke="none" />;
const L = ({ d }: { d: string }) => <path d={d} />;
/** 꺾은선 + 꼭짓점 점 */
const Zig = ({ pts }: { pts: [number, number][] }) => (
  <>
    <polyline points={pts.map((p) => p.join(",")).join(" ")} />
    {pts.map(([x, y], i) => (
      <D key={i} x={x} y={y} />
    ))}
  </>
);
/** 가로선 여러 개 (피보나치·갠 단계) */
const Rungs = ({ ys, x1 = 3, x2 = 17 }: { ys: number[]; x1?: number; x2?: number }) => (
  <>
    {ys.map((y) => (
      <path key={y} d={`M${x1} ${y}H${x2}`} />
    ))}
  </>
);
const Fan = ({ ends }: { ends: [number, number][] }) => (
  <>
    {ends.map(([x, y]) => (
      <path key={`${x}-${y}`} d={`M3 17L${x} ${y}`} />
    ))}
    <D x={3} y={17} />
  </>
);

const GLYPHS: Record<string, ReactNode> = {
  // 라인
  trendline: (
    <>
      <L d="M4 16L16 4" />
      <D x={4} y={16} />
      <D x={16} y={4} />
    </>
  ),
  ray: (
    <>
      <L d="M4 16L19 1" />
      <D x={4} y={16} />
      <D x={10} y={10} />
    </>
  ),
  "extended-line": (
    <>
      <L d="M1 19L19 1" />
      <D x={7} y={13} />
      <D x={13} y={7} />
    </>
  ),
  "info-line": (
    <>
      <L d="M4 15L16 5" />
      <D x={4} y={15} />
      <D x={16} y={5} />
      <rect x={10} y={13} width={8} height={5} rx={1} />
    </>
  ),
  "trend-angle": (
    <>
      <L d="M3 16L16 5M3 16H17" />
      <L d="M9 16a6 6 0 0 0-1.4-3.9" />
      <D x={3} y={16} />
    </>
  ),
  "horizontal-line": (
    <>
      <L d="M1 10H19" />
      <D x={10} y={10} />
    </>
  ),
  "horizontal-ray": (
    <>
      <L d="M6 10H19" />
      <D x={6} y={10} />
    </>
  ),
  "vertical-line": (
    <>
      <L d="M10 1V19" />
      <D x={10} y={10} />
    </>
  ),
  "cross-line": (
    <>
      <L d="M10 1V19M1 10H19" />
      <D x={10} y={10} />
    </>
  ),
  // 채널 · 피치포크
  "parallel-channel": (
    <>
      <L d="M2 13L14 3M6 17L18 7" />
      <D x={2} y={13} />
      <D x={14} y={3} />
      <D x={18} y={7} />
    </>
  ),
  "regression-trend": (
    <>
      <L d="M2 12L18 4" />
      <path d="M2 8L18 0M2 16L18 8" strokeDasharray="2 2" />
    </>
  ),
  "flat-top-bottom": (
    <>
      <L d="M2 4H18M2 16L18 8" />
      <D x={2} y={16} />
      <D x={18} y={8} />
    </>
  ),
  pitchfork: (
    <>
      <L d="M2 10L18 10M8 5L18 5M8 15L18 15M8 5V15" />
      <D x={2} y={10} />
      <D x={8} y={5} />
      <D x={8} y={15} />
    </>
  ),
  "schiff-pitchfork": (
    <>
      <L d="M2 13L18 8M8 4L18 2M8 15L18 13M8 4V15" />
      <D x={2} y={13} />
      <D x={8} y={4} />
      <D x={8} y={15} />
    </>
  ),
  "modified-schiff": (
    <>
      <L d="M5 12L18 8M8 4L18 1M8 16L18 13M8 4V16" />
      <D x={5} y={12} />
      <D x={8} y={4} />
      <D x={8} y={16} />
    </>
  ),
  // 피보나치 · 갠
  "fib-retracement": (
    <>
      <Rungs ys={[3, 7, 10, 13, 17]} />
      <path d="M3 17L17 3" strokeDasharray="2 2" />
    </>
  ),
  "fib-extension": (
    <>
      <Rungs ys={[2, 6, 10]} x1={8} />
      <Zig pts={[[2, 16], [8, 8], [12, 14]]} />
    </>
  ),
  "fib-channel": (
    <>
      <L d="M2 14L14 4M4 17L16 7M6 19L18 10" />
    </>
  ),
  "fib-time-zone": <path d="M3 2V18M5 2V18M8 2V18M12 2V18M18 2V18" />,
  "fib-speed-fan": <Fan ends={[[18, 3], [18, 7], [18, 11], [18, 15]]} />,
  "fib-trend-time": (
    <>
      <path d="M9 2V18M13 2V18M18 2V18" />
      <Zig pts={[[2, 15], [6, 7], [9, 12]]} />
    </>
  ),
  "fib-circles": (
    <>
      <circle cx={10} cy={10} r={3} />
      <circle cx={10} cy={10} r={6} />
      <circle cx={10} cy={10} r={9} />
    </>
  ),
  "fib-speed-arcs": (
    <>
      <path d="M3 17a5 5 0 0 1 5-5M3 17a9 9 0 0 1 9-9M3 17a14 14 0 0 1 14-14" />
      <D x={3} y={17} />
    </>
  ),
  "gann-box": (
    <>
      <rect x={2} y={3} width={16} height={14} />
      <path d="M2 8H18M2 12H18M7 3V17M13 3V17" strokeOpacity={0.6} />
    </>
  ),
  "gann-square": (
    <>
      <rect x={3} y={3} width={14} height={14} />
      <path d="M3 17L17 3M3 3L17 17" strokeOpacity={0.6} />
    </>
  ),
  "gann-fan": <Fan ends={[[18, 2], [18, 9], [18, 14], [11, 2], [7, 2]]} />,
  // 패턴 · 엘리엇 · 사이클
  xabcd: (
    <>
      <path d="M2 15L6 4L10 12L14 6L18 16" />
      <path d="M2 15L10 12L18 16M6 4L14 6" strokeOpacity={0.4} />
    </>
  ),
  cypher: <Zig pts={[[2, 16], [6, 5], [9, 11], [14, 2], [18, 13]]} />,
  abcd: <Zig pts={[[2, 15], [7, 5], [12, 11], [18, 2]]} />,
  "head-shoulders": (
    <>
      <path d="M1 15L4 8L6 12L10 3L14 12L16 8L19 15" />
      <path d="M2 12H18" strokeDasharray="2 2" />
    </>
  ),
  "triangle-pattern": (
    <>
      <path d="M2 3L18 9M2 17L18 11" />
      <Zig pts={[[2, 3], [6, 15], [10, 6], [14, 13]]} />
    </>
  ),
  "three-drives": <Zig pts={[[1, 17], [4, 11], [7, 14], [11, 7], [14, 10], [18, 3]]} />,
  "elliott-impulse": <Zig pts={[[1, 17], [4, 10], [7, 13], [11, 4], [14, 8], [18, 2]]} />,
  "elliott-correction": <Zig pts={[[2, 3], [7, 13], [11, 7], [18, 17]]} />,
  "elliott-triangle": <Zig pts={[[1, 4], [5, 16], [9, 6], [12, 14], [15, 8], [18, 12]]} />,
  "elliott-double": <Zig pts={[[2, 4], [7, 12], [11, 8], [18, 17]]} />,
  "elliott-triple": <Zig pts={[[1, 3], [5, 10], [8, 7], [11, 13], [14, 10], [18, 17]]} />,
  "cyclic-lines": <path d="M3 2V18M8 2V18M13 2V18M18 2V18" />,
  "time-cycles": <path d="M1 15a4 4 0 0 1 8 0a4 4 0 0 1 8 0" />,
  "sine-line": <path d="M1 10C4 2 6 2 8 10S12 18 15 10S18 4 19 6" />,
  // 예측 · 측정
  "long-position": (
    <>
      <rect x={3} y={3} width={14} height={7} fill="rgba(8,153,129,.25)" stroke="none" />
      <rect x={3} y={10} width={14} height={6} fill="rgba(242,54,69,.22)" stroke="none" />
      <L d="M3 10H17" />
    </>
  ),
  "short-position": (
    <>
      <rect x={3} y={3} width={14} height={6} fill="rgba(242,54,69,.22)" stroke="none" />
      <rect x={3} y={9} width={14} height={8} fill="rgba(8,153,129,.25)" stroke="none" />
      <L d="M3 9H17" />
    </>
  ),
  forecast: (
    <>
      <L d="M2 14L9 12" />
      <path d="M9 12L17 4" strokeDasharray="2 2" />
      <circle cx={17} cy={4} r={2} />
    </>
  ),
  "price-range": (
    <>
      <rect x={3} y={4} width={14} height={12} strokeOpacity={0.5} />
      <L d="M10 4V16M7 7l3-3 3 3" />
    </>
  ),
  "price-range-only": <L d="M10 3V17M6 3H14M6 17H14M7 6l3-3 3 3" />,
  "date-range": <L d="M3 10H17M3 6V14M17 6V14M14 7l3 3-3 3" />,
  "anchored-vwap": (
    <>
      <path d="M3 15C7 14 9 9 17 7" />
      <D x={3} y={15} />
    </>
  ),
  "fixed-range-volume-profile": (
    <>
      <path d="M3 2V18" />
      <rect x={3} y={3} width={6} height={3} fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect x={3} y={7} width={12} height={3} fill="currentColor" fillOpacity={0.55} stroke="none" />
      <rect x={3} y={11} width={9} height={3} fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect x={3} y={15} width={4} height={2} fill="currentColor" fillOpacity={0.35} stroke="none" />
    </>
  ),
  // 브러시 · 화살표
  brush: <path d="M2 14C5 8 8 16 11 9S16 5 18 7" strokeWidth={1.8} />,
  highlighter: <path d="M2 13C6 9 10 14 18 7" strokeWidth={5} strokeOpacity={0.35} />,
  arrow: <L d="M3 17L16 4M9 4H16V11" />,
  "arrow-marker": <path d="M3 13L11 5L9.5 3.5H17V11L15.5 9.5L7.5 17.5Z" fill="currentColor" fillOpacity={0.25} />,
  "arrow-up": <path d="M10 3L16 10H12.5V17H7.5V10H4Z" fill="rgba(8,153,129,.35)" />,
  "arrow-down": <path d="M10 17L16 10H12.5V3H7.5V10H4Z" fill="rgba(242,54,69,.3)" />,
  marker: <path d="M2 12L18 8" strokeWidth={4} strokeOpacity={0.35} strokeLinecap="round" />,
  // 도형
  rectangle: <rect x={3} y={5} width={14} height={10} />,
  "rotated-rectangle": <path d="M3 12L11 3L17 8L9 17Z" />,
  ellipse: <ellipse cx={10} cy={10} rx={8} ry={5} />,
  circle: <circle cx={10} cy={10} r={7} />,
  triangle: <path d="M10 3L18 16H2Z" />,
  arc: <path d="M2 15Q10 0 18 15" />,
  curve: <path d="M2 16C5 2 13 2 18 12" />,
  "double-curve": <path d="M1 12C4 2 8 2 10 10S16 18 19 8" />,
  path: (
    <>
      <polyline points="2,15 7,8 12,12" />
      <L d="M12 12L18 4M14 4H18V8" />
    </>
  ),
  polyline: <Zig pts={[[2, 15], [7, 6], [12, 12], [18, 4]]} />,
  // 글 · 주석
  text: <path d="M4 4H16M10 4V17" strokeWidth={1.8} />,
  note: (
    <>
      <path d="M3 3H17V13L13 17H3Z" />
      <path d="M6 7H14M6 10H11" />
    </>
  ),
  callout: (
    <>
      <path d="M2 3H18V12H9L5 16V12H2Z" />
      <path d="M5 6.5H15M5 9H11" />
    </>
  ),
  pin: (
    <>
      <path d="M10 18V11" />
      <circle cx={10} cy={7} r={4} />
    </>
  ),
  "price-note": (
    <>
      <path d="M2 14H8" />
      <rect x={8} y={9} width={10} height={9} rx={1} />
      <D x={2} y={14} />
    </>
  ),
  "price-label": <path d="M2 10L6 5H18V15H6Z" />,
  flag: <path d="M5 18V2M5 3H16L13 7L16 11H5" />,
  signpost: (
    <>
      <path d="M10 18V9" />
      <path d="M4 3H15L18 6L15 9H4Z" />
    </>
  ),
};

export default function ToolGlyph({ id }: { id: string }) {
  return (
    <svg className="ws-tool-glyph" viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {GLYPHS[id] ?? <path d="M4 16L16 4" />}
    </svg>
  );
}
