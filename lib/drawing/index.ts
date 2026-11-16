// 드로잉 툴 등록. 아래 목록 순서가 왼쪽 도구 바 메뉴 순서다.
// 새 툴은 tools/에 정의를 만들고 여기 한 줄 추가하면 된다 (section = 메뉴 안 소제목).
import { registerTool } from "./registry";
import type { DrawingTool, PixelPoint } from "./types";
import { trendLine } from "./tools/trendline";
import { horizontalLine } from "./tools/horizontal-line";
import { fibRetracement } from "./tools/fib-retracement";
import { arrow, marker, rectangle, verticalLine } from "./tools/shapes";
import { priceRange } from "./tools/measure";
import { abcd, arrowDown, arrowUp, ellipse, extendedLine, fibExtension, horizontalRay, parallelChannel, ray, triangle } from "./tools/more";
import { andrewsPitchfork, crossLine, flatTopBottom, infoLine, modifiedSchiff, regression, schiffPitchfork, trendAngle } from "./tools/lines";
import { fibChannel, fibCircles, fibSpeedArcs, fibSpeedFan, fibTimeZone, fibTrendTime, gannBox, gannFan, gannSquare } from "./tools/fib-gann";
import {
  cyclicLines,
  cypher,
  elliottCorrection,
  elliottDouble,
  elliottImpulse,
  elliottTriangle,
  elliottTriple,
  headShoulders,
  sineLine,
  threeDrives,
  timeCycles,
  trianglePattern,
  xabcd,
} from "./tools/patterns";
import { anchoredVwap, dateRange, forecast, longPosition, priceRangeOnly, shortPosition, volumeProfile } from "./tools/forecast";
import {
  arc,
  arrowMarker,
  brush,
  calloutTool,
  circle,
  curve,
  doubleCurve,
  flagTool,
  highlighterFree,
  noteTool,
  path,
  pinTool,
  polyline,
  priceLabel,
  priceNote,
  rotatedRect,
  signpost,
  textTool,
} from "./tools/shapes-text";

/** 화면 끝까지 그리는 선은 기본 판정(점·선분) 대신 선 전체로 판정 */
const nearLine = (a: PixelPoint, b: PixelPoint, c: PixelPoint, ray: boolean) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const along = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len;
  if (ray && along < -6) return false;
  return Math.abs((c.x - a.x) * dy - (c.y - a.y) * dx) / len <= 9;
};
const hitHorizontal: DrawingTool["hitTest"] = (px, c) => Math.abs(c.y - px[0].y) <= 8;
const hitVertical: DrawingTool["hitTest"] = (px, c) => Math.abs(c.x - px[0].x) <= 8;

const TOOLS: [DrawingTool, Partial<DrawingTool>?][] = [
  // 라인·채널·피치포크
  [trendLine, { section: "라인" }],
  [ray, { section: "라인", hitTest: (px, c) => !!px[1] && nearLine(px[0], px[1], c, true) }],
  [infoLine],
  [extendedLine, { section: "라인", hitTest: (px, c) => !!px[1] && nearLine(px[0], px[1], c, false) }],
  [trendAngle],
  [horizontalLine, { section: "라인", hitTest: hitHorizontal }],
  [horizontalRay, { section: "라인", hitTest: (px, c) => c.x >= px[0].x - 8 && Math.abs(c.y - px[0].y) <= 8 }],
  [verticalLine, { section: "라인", hitTest: hitVertical }],
  [crossLine, { hitTest: (px, c) => Math.abs(c.y - px[0].y) <= 8 || Math.abs(c.x - px[0].x) <= 8 }],
  [parallelChannel, { section: "채널" }],
  [regression],
  [flatTopBottom],
  [andrewsPitchfork],
  [schiffPitchfork],
  [modifiedSchiff],
  // 피보나치·갠
  [fibRetracement, { section: "피보나치" }],
  [fibExtension, { label: "추세 기반 피보나치 확장", section: "피보나치" }],
  [fibChannel],
  [fibTimeZone],
  [fibSpeedFan],
  [fibTrendTime],
  [fibCircles],
  [fibSpeedArcs],
  [gannBox],
  [gannSquare],
  [gannFan],
  // 패턴·엘리엇·사이클
  [xabcd],
  [cypher],
  [headShoulders],
  [abcd, { section: "패턴" }],
  [trianglePattern],
  [threeDrives],
  [elliottImpulse],
  [elliottCorrection],
  [elliottTriangle],
  [elliottDouble],
  [elliottTriple],
  [cyclicLines],
  [timeCycles],
  [sineLine],
  // 예측·측정·거래량 기반
  [longPosition],
  [shortPosition],
  [forecast],
  [priceRangeOnly],
  [dateRange],
  [priceRange, { label: "날짜·가격 범위", section: "측정" }],
  [anchoredVwap],
  [volumeProfile],
  // 브러시
  [brush],
  [highlighterFree],
  // 화살표
  [arrowMarker],
  [arrow],
  [arrowUp],
  [arrowDown],
  [marker],
  // 도형
  [rectangle],
  [rotatedRect],
  [path],
  [circle],
  [ellipse, { label: "타원" }],
  [polyline],
  [triangle, { group: "shape" }],
  [arc],
  [curve],
  [doubleCurve],
  // 글
  [textTool],
  [noteTool],
  [priceNote],
  [pinTool],
  [calloutTool],
  [priceLabel],
  [flagTool],
  [signpost],
];

for (const [tool, patch] of TOOLS) registerTool(patch ? { ...tool, ...patch } : tool);

export * from "./registry";
export * from "./types";
