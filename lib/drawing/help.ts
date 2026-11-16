// 드로잉 도구 설명 (도구 목록의 ⓘ 에 마우스를 올리면 보임). 무엇을 그리는지 + 어떻게 찍는지
import type { DrawingTool } from "./types";

const HELP: Record<string, string> = {
  // 라인
  trendline: "두 점을 이은 선. 지지·저항 추세를 표시합니다.",
  ray: "첫 점에서 두 번째 점 방향으로 끝없이 뻗는 선.",
  "extended-line": "두 점을 지나 양쪽으로 끝없이 뻗는 선.",
  "info-line": "두 점 사이 가격 변화·기간·각도를 함께 보여 주는 선.",
  "trend-angle": "추세선의 기울기를 각도로 보여 줍니다.",
  "horizontal-line": "한 가격대에 가로로 긋는 선. 지지·저항 가격 표시.",
  "horizontal-ray": "찍은 지점부터 오른쪽으로만 뻗는 가로선.",
  "vertical-line": "한 날짜에 세로로 긋는 선. 이벤트·발표일 표시.",
  "cross-line": "가로·세로선을 함께 그어 한 지점의 날짜와 가격을 표시.",
  // 채널
  "parallel-channel": "추세선과 나란한 선을 하나 더 그어 가격이 오가는 통로를 표시.",
  "regression-trend": "구간 종가의 회귀선과 표준편차 띠를 그립니다.",
  "flat-top-bottom": "한쪽은 기울어지고 한쪽은 수평인 채널.",
  pitchfork: "앤드류스 피치포크. 첫 점(시작)과 고점·저점으로 중앙선과 두 평행선을 그립니다.",
  "schiff-pitchfork": "시작점을 첫 두 점의 중간 가격으로 옮긴 피치포크. 완만한 추세에 맞습니다.",
  "modified-schiff": "시작점을 첫 두 점의 정중앙으로 옮긴 피치포크.",
  // 피보나치 · 갠
  "fib-retracement": "고점·저점 사이를 23.6·38.2·50·61.8·78.6% 되돌림 가격으로 나눕니다.",
  "fib-extension": "추세 두 점과 되돌림 한 점으로 목표가 확장 비율을 그립니다.",
  "fib-channel": "추세선에 나란한 피보나치 비율 선들.",
  "fib-time-zone": "1·2·3·5·8·13… 간격의 세로선으로 변곡 시점을 가늠합니다.",
  "fib-speed-fan": "시작점에서 피보나치 비율로 퍼지는 부채꼴 선.",
  "fib-trend-time": "추세 길이를 기준으로 피보나치 비율의 미래 시점을 표시.",
  "fib-circles": "중심에서 피보나치 비율 반지름의 원들.",
  "fib-speed-arcs": "시작점 기준 피보나치 비율의 호.",
  "gann-box": "구간을 가격·시간 비율로 나눈 격자 상자.",
  "gann-square": "가격과 시간이 1:1 이 되는 정사각 격자.",
  "gann-fan": "1×1, 1×2, 2×1 등 갠 각도로 퍼지는 선.",
  // 패턴
  xabcd: "하모닉 XABCD 패턴. 꼭짓점을 차례로 찍으면 구간 비율을 보여 줍니다.",
  cypher: "사이퍼 하모닉 패턴.",
  abcd: "AB=CD 패턴.",
  "head-shoulders": "헤드 앤 숄더(반전 패턴). 어깨·머리·넥라인",
  "triangle-pattern": "수렴하는 삼각형 패턴.",
  "three-drives": "쓰리 드라이브 패턴.",
  "elliott-impulse": "엘리엇 충격파 1-2-3-4-5.",
  "elliott-correction": "엘리엇 조정파 A-B-C.",
  "elliott-triangle": "엘리엇 삼각 조정 A-B-C-D-E.",
  "elliott-double": "엘리엇 이중 조합 W-X-Y.",
  "elliott-triple": "엘리엇 삼중 조합 W-X-Y-X-Z.",
  "cyclic-lines": "첫 두 점 간격으로 반복되는 세로선. 주기 확인용.",
  "time-cycles": "같은 간격으로 이어지는 반원으로 주기를 표시.",
  "sine-line": "두 점을 반주기로 하는 사인 곡선.",
  // 예측 · 측정
  "long-position": "롱 포지션. 진입 → 목표 → 손절 순으로 찍으면 수익률과 손익비를 보여 줍니다.",
  "short-position": "숏 포지션. 진입 → 목표 → 손절 순으로 찍으면 수익률과 손익비를 보여 줍니다.",
  forecast: "지금 가격에서 예상 가격까지의 경로와 변화율·기간.",
  "price-range": "두 점 사이 가격 변화와 기간을 함께 잽니다.",
  "price-range-only": "두 점 사이 가격 차이와 변화율만 잽니다.",
  "date-range": "두 점 사이 봉 개수와 기간을 잽니다.",
  "anchored-vwap": "찍은 날부터 계산한 거래량 가중 평균가(VWAP) 선.",
  "fixed-range-volume-profile": "고른 구간의 가격대별 거래량(매물대)과 최대 거래 가격(POC).",
  // 브러시 · 화살표
  brush: "누른 채 끌어서 자유롭게 그립니다.",
  highlighter: "누른 채 끌어서 반투명하게 칠합니다.",
  arrow: "두 점을 잇는 화살표.",
  "arrow-marker": "굵은 화살표로 방향을 강조.",
  "arrow-up": "위쪽 화살표 표시.",
  "arrow-down": "아래쪽 화살표 표시.",
  marker: "형광 마커 선.",
  // 도형
  rectangle: "두 꼭짓점으로 사각형 구간(박스권)을 표시.",
  "rotated-rectangle": "기울어진 사각형.",
  ellipse: "구간을 감싸는 타원.",
  circle: "중심과 반지름으로 원.",
  triangle: "세 꼭짓점을 잇는 삼각형.",
  arc: "세 점을 지나는 호.",
  curve: "조절점 하나로 휘는 곡선.",
  "double-curve": "S자 이중 곡선.",
  path: "여러 점을 이은 화살표 경로. 클릭으로 점을 찍고 더블클릭(또는 Enter)으로 끝.",
  polyline: "여러 점을 이은 꺾은선. 클릭으로 점을 찍고 더블클릭(또는 Enter)으로 끝.",
  // 텍스트 · 메모
  text: "차트 위에 글을 씁니다. 찍은 뒤 내용을 입력.",
  note: "한 지점에 붙는 메모. 찍은 뒤 내용을 입력.",
  callout: "말풍선. 가리킬 곳과 글 위치를 찍습니다.",
  pin: "핀으로 한 지점에 메모.",
  "price-note": "가격을 가리키는 메모.",
  "price-label": "찍은 가격을 라벨로 표시.",
  flag: "깃발로 지점 표시.",
  signpost: "안내판 모양으로 지점에 글 표시.",
};

/** 찍는 방법 (도구 정보에서) */
function howTo(tool: DrawingTool) {
  if (tool.mode === "free") return "누른 채 끌어서 그립니다.";
  if (tool.mode === "multi") return `클릭으로 점을 ${tool.pointCount}개 이상 찍고 더블클릭(또는 Enter)으로 끝냅니다.`;
  return `점 ${tool.pointCount}개를 찍어 그립니다.`;
}

/** 도구 설명 + 찍는 방법 */
export function toolHelp(tool: DrawingTool) {
  const about = HELP[tool.id];
  const how = howTo(tool);
  if (!about) return how;
  return about.includes("더블클릭") || about.includes("끌어서") ? about : `${about} ${how}`;
}
