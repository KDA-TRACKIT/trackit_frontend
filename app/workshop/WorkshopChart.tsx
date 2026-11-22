"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  MismatchDirection,
  createChart,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { INSTANCE_PALETTE, getIndicator, instanceLabel, type IndicatorDef, type IndicatorInstance, type OutputDef } from "../../lib/indicators";
import IndicatorPicker from "./IndicatorPicker";
import type { AvgPrice } from "../../hooks/useAvgPrice";
import ColorSwatches from "./ColorSwatches";
import Image from "next/image";
import { Bell, BellRing, ChevronRight, Eye, EyeOff, GripVertical, ListTree, Lock, LockOpen, Magnet, MoreHorizontal } from "lucide-react";
import { alertLineOf, canAlert, putAlert, removeAlert, sameLine, useAlerts } from "../../lib/api/alerts";
import { errorMessage } from "../../lib/api/client";
import { getDrawPrefs, removeDrawTemplate, saveDrawTemplate, setDrawPref, useDrawPrefs, useDrawTemplates } from "../../lib/drawing/prefs";
import { useEffect, useMemo, useRef, useState } from "react";
import { getTool, toolsByGroup, type Drawing, type DrawingPoint, type DrawingTool, type ToolGroup } from "../../lib/drawing";
import { DrawingLayer, fromChartTime, toChartTime } from "../../lib/drawing/render/lwc-adapter";
import { toolHelp } from "../../lib/drawing/help";
import { INK_TOOLS } from "../../lib/drawing/tools/shapes-text";
import { straightenStroke } from "../../lib/drawing/straighten";
import ToolGlyph from "./ToolGlyph";
import { buildScenariosFor, businessDaysBetween, lineValueAt, type Scenario, type ScenarioBase, type ScenarioName, type UserDrawing } from "../../lib/workspace/scenarios";
import { type Bar, type ChartNote, type Interval } from "../../lib/mock/workshop";
import { PRESET_INTERVALS, UNIT_LABEL, UNIT_MAX, intervalLabel, isDailyLike, isSeconds, makeInterval, parseInterval, type IntervalUnit } from "../../lib/interval";
import { fetchDailyNews, fetchNewsDays, newsDays, type NewsArticle } from "../../lib/api/news";
import { fetchFlows, type FlowDay } from "../../lib/market-data";
import { readUserStorage, userStorageKey } from "../../lib/supabase-browser";
import { uuid } from "../../lib/uuid";
import { fixZoomPointer } from "../../lib/zoom-pointer";
import BeeLoader from "../BeeLoader";

/** 캔들 색: 양봉 초록 · 음봉 빨강 (거래량·MACD 막대도 같은 색) */
const UP = "#089981";
const DOWN = "#f23645";
const UP_BAR = "rgba(8,153,129,0.45)";
const DOWN_BAR = "rgba(242,54,69,0.45)";
const DRAW_STYLE = { color: "#2962ff", width: 1.5 };

// ---------- 시나리오 (반투명 미래 캔들) ----------
// 고른 시나리오도 반투명 (실제 봉과 헷갈리지 않게)
const SCENARIO_ALPHA = { idle: 0.2, hover: 0.55, picked: 0.45 };
const scenarioColors = (alpha: number) => {
  const up = `rgba(8,153,129,${alpha})`;
  const down = `rgba(242,54,69,${alpha})`;
  return { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down };
};
const KST_SEC = 9 * 3600;
/** 일봉 시각(KST 자정 epoch 초) ↔ "YYYY-MM-DD" */
const ymdOf = (t: number) => new Date((t + KST_SEC) * 1000).toISOString().slice(0, 10);
const epochOf = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / 1000 - KST_SEC;
/** 시나리오 기준이 되는 드로잉 → 기준 종류 */
const BASE_KIND: Record<string, "hline" | "line" | "channel" | "regression" | "flat" | "box" | "long" | "short" | "fib"> = {
  "horizontal-line": "hline",
  "horizontal-ray": "hline",
  trendline: "line",
  ray: "line",
  "extended-line": "line",
  "parallel-channel": "channel",
  "regression-trend": "regression",
  "flat-top-bottom": "flat",
  rectangle: "box",
  "long-position": "long",
  "short-position": "short",
  "fib-retracement": "fib",
};
const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** 드로잉 하나 → 시나리오 기준 (점이 모자라면 null) */
function scenarioBaseOf(d: Drawing, bars: Bar[]): ScenarioBase | null {
  const kind = d.toolId ? BASE_KIND[d.toolId] : undefined;
  if (!kind) return null;
  const pts = d.points.map((p) => ({ time: ymdOf(p.time), price: Number(p.price) }));
  const key = `${d.toolId}:${pts.map((p) => `${p.time}:${p.price}`).join(",")}`;
  const lineOf = (a: (typeof pts)[number], b: (typeof pts)[number]): UserDrawing => ({ type: "LINE", payload: { v: 1, source: "USER", points: [a, b] } });
  const need = (n: number) => pts.length >= n;
  switch (kind) {
    case "hline":
      return need(1) ? { kind: "line", key, at: () => pts[0].price } : null;
    case "line": {
      if (!need(2)) return null;
      const line = lineOf(pts[0], pts[1]);
      return { kind: "line", key, at: (t) => lineValueAt(line, t) };
    }
    case "channel": {
      // 두 점 = 한쪽 선, 세 번째 점 = 평행선까지의 가격 간격
      if (!need(3)) return null;
      const line = lineOf(pts[0], pts[1]);
      const off = pts[2].price - lineValueAt(line, pts[2].time);
      return { kind: "band", key, label: "채널", upper: (t) => lineValueAt(line, t) + Math.max(0, off), lower: (t) => lineValueAt(line, t) + Math.min(0, off) };
    }
    case "flat": {
      // 기울어진 선(점 2개) + 수평선(세 번째 점 가격)
      if (!need(3)) return null;
      const line = lineOf(pts[0], pts[1]);
      const flat = pts[2].price;
      return { kind: "band", key, label: "채널", upper: (t) => Math.max(lineValueAt(line, t), flat), lower: (t) => Math.min(lineValueAt(line, t), flat) };
    }
    case "regression": {
      // 도구와 같은 계산: 구간 종가를 봉 순서로 선형 회귀, ±표준편차 2배. 미래는 영업일 수만큼 봉 순서를 늘린다
      if (!need(2)) return null;
      const [t1, t2] = [d.points[0].time, d.points[1].time].sort((x, y) => x - y);
      const inRange = bars.filter((b) => b.time >= t1 && b.time <= t2);
      if (inRange.length < 2) return null;
      const n = inRange.length;
      const mx = (n - 1) / 2;
      const my = inRange.reduce((sum, b) => sum + b.close, 0) / n;
      let sxy = 0;
      let sxx = 0;
      inRange.forEach((b, i) => {
        sxy += (i - mx) * (b.close - my);
        sxx += (i - mx) ** 2;
      });
      const slope = sxx ? sxy / sxx : 0;
      const at = (i: number) => my + slope * (i - mx);
      const sd = Math.sqrt(inRange.reduce((sum, b, i) => sum + (b.close - at(i)) ** 2, 0) / n);
      const firstIdx = bars.indexOf(inRange[0]);
      const lastBar = bars[bars.length - 1];
      const idxOf = (t: string) => bars.length - 1 - firstIdx + businessDaysBetween(ymdOf(lastBar.time), t);
      return { kind: "band", key, label: "회귀 채널", upper: (t) => at(idxOf(t)) + 2 * sd, lower: (t) => at(idxOf(t)) - 2 * sd };
    }
    case "box": {
      if (!need(2)) return null;
      const hi = Math.max(pts[0].price, pts[1].price);
      const lo = Math.min(pts[0].price, pts[1].price);
      return { kind: "band", key, label: "박스", upper: () => hi, lower: () => lo };
    }
    case "long":
    case "short":
      // 진입 → 목표 → 손절
      return need(3) ? { kind: "position", key, side: kind === "long" ? "LONG" : "SHORT", entry: pts[0].price, target: pts[1].price, stop: pts[2].price } : null;
    case "fib": {
      if (!need(2)) return null;
      const [a, b] = pts;
      return { kind: "fib", key, levels: FIB_RATIOS.map((ratio) => ({ ratio, price: b.price + (a.price - b.price) * ratio })) };
    }
  }
}

/** 가장 최근에 그린, 시나리오 기준이 될 수 있는 드로잉 */
function latestScenarioBase(list: Drawing[], bars: Bar[]): { base: ScenarioBase; label: string } | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const base = scenarioBaseOf(list[i], bars);
    if (base) return { base, label: getTool(list[i].toolId)?.label ?? "드로잉" };
  }
  return null;
}

// 아이콘은 피그마 작업실 프레임(38:184)에서 잘라낸 SVG (public/icons)
// 왼쪽 도구 줄. 도형·화살표는 한 묶음, 글·주석(T)은 위쪽 "차트 노트" 메뉴로 옮김
const TOOL_GROUPS: { key: ToolGroup; label: string; icon: string; members: ToolGroup[] }[] = [
  { key: "line", label: "라인·채널·피치포크", icon: "/icons/line.svg", members: ["line"] },
  { key: "fib", label: "피보나치·갠", icon: "/icons/fib.svg", members: ["fib"] },
  { key: "pattern", label: "패턴·엘리엇·사이클", icon: "/icons/pattern.svg", members: ["pattern"] },
  { key: "measure", label: "예측·측정·거래량", icon: "/icons/measure.svg", members: ["measure"] },
  { key: "brush", label: "펜·지우개", icon: "/icons/brush.svg", members: ["brush"] },
  { key: "shape", label: "도형·화살표", icon: "/icons/shape.svg", members: ["shape", "arrow"] },
];
/** 묶음 안에서 소제목이 없는 도구에 붙일 소제목 */
const MEMBER_SECTION: Partial<Record<ToolGroup, string>> = { shape: "도형", arrow: "화살표" };
/** 한 도구 줄 버튼에 들어가는 도구들 (묶음이면 소제목을 붙여 이어 붙임) */
function groupTools(key: ToolGroup): DrawingTool[] {
  const g = TOOL_GROUPS.find((x) => x.key === key);
  if (!g) return toolsByGroup(key);
  if (g.members.length === 1) return toolsByGroup(key);
  return g.members.flatMap((m) => toolsByGroup(m).map((t) => (t.section ? t : { ...t, section: MEMBER_SECTION[m] })));
}
/** 도구가 속한 도구 줄 버튼 (글·주석은 차트 노트 메뉴라 없음) */
const groupKeyOf = (group: ToolGroup | undefined) => TOOL_GROUPS.find((g) => group && g.members.includes(group))?.key ?? null;

const RANGES: { label: string; days: number | "ytd" | "all" }[] = [
  { label: "1일", days: 1 },
  { label: "5일", days: 5 },
  { label: "1개월", days: 30 },
  { label: "3개월", days: 90 },
  { label: "6개월", days: 180 },
  { label: "연초 이후", days: "ytd" },
  { label: "1년", days: 365 },
  { label: "전체", days: "all" },
];

const won = (value: number) => value.toLocaleString("ko-KR");
/** 봉을 바꿨을 때 마지막 봉이 놓일 가로 위치 (0 = 왼쪽 끝, 1 = 오른쪽 끝) */
const LAST_BAR_AT = 0.65;
/** 실시간으로 봉을 쌓는 동안(초봉 등) 고정해 둘 화면 칸 수 */
/** 실시간 체결 중 지표 재계산 간격 (ms) */
const IND_LIVE_MS = 1000;
const GROW_SLOTS = 150;

export type RoleTag = { keys: string[]; price: number; role: "지지" | "저항" | null; trade: string };
const TAG_COLOR: Record<string, string> = { 지지: "#1f9d55", 저항: "#e5484d", 매수: "#2f6fde", 매도: "#f08c00", 목표: "#7048e8", 손절: "#495057" };
const tagTitle = (t: RoleTag) => t.trade || t.role || "";

type Props = {
  bars: Bar[];
  interval: Interval;
  onIntervalChange: (interval: Interval) => void;
  /** 보유 평균 단가 (있으면 차트에 점선으로) */
  avgPrice?: AvgPrice | null;
  onDrawingsChange?: (drawings: Drawing[]) => void;
  /** 밖(차트 노트의 선 목록)에서 선을 지울 수 있게 지우기 함수를 넘겨 줌 */
  registerRemove?: (remove: (ids: string[]) => void) => void;
  /** 바깥에서 드로잉 더하기 (산 전략의 선을 내 드로잉으로 가져오기). 되돌리기로 뺄 수 있게 commit */
  registerAdd?: (add: (drawings: Drawing[]) => void) => void;
  /** 산 전략 겹치기: 내 드로잉이 아닌 보기용 가격선 (저장 · AI 분석에 안 들어감) */
  overlayLines?: { price: number; title: string }[];
  /** 그은 선의 지지 · 저항 태그 (평단가처럼 가격 축 옆에). 누르면 바꾸기 · 지우기. keys = 이 태그로 묶인 선(가까운 피보 레벨 등) */
  /** 시세가 늦으면 차트 이름 옆에 (예: "10분 지연", "휴장") */
  delay?: string | null;
  roleTags?: RoleTag[];
  /** 고른 것: 지지 · 저항 · 매수 · 매도 · 목표 · 손절 · 없음(지우기) */
  onRoleChange?: (tag: RoleTag, choice: string) => void;
  /** 산 전략 겹치기: 기울어진 선(추세선 · 채널 위아래). 봉 시각 사이를 이어 그림 (보기용, 저장 안 함) */
  overlaySegments?: { title: string; a: { time: number; price: number }; b: { time: number; price: number }; extend?: boolean }[];
  /** 저장 확인 창에 보여 줄 차트 그림: 지금 차트(드로잉 포함)를 찍고 선 가격마다 지지 · 저항 라벨을 얹어 PNG 로 */
  /** 저장 확인 창 차트 그림. range = 보일 봉 구간(논리 번호), 없으면 드로잉 전체가 들어가게. 쓴 구간도 같이 돌려줌 */
  registerSnapshot?: (snap: (marks: { price: number; text: string; color: string }[], range?: { from: number; to: number }) => Promise<{ image: string; from: number; to: number } | null>) => void;
  /** 저장본에서 불러온 드로잉. key가 바뀔 때만 차트에 넣는다 (실행 취소 기록도 비움) */
  loadedDrawings?: { key: string; drawings: Drawing[] };
  notes: ChartNote[];
  /** 종목·간격이 바뀔 때만 바뀌는 값. 같으면 실시간 갱신으로 보고 마지막 봉만 고친다 (확대 상태 유지) */
  dataKey: string;
  symbolCode: string;
  symbolName: string;
  market: string;
  /** 시세 코드 (국내 "005930" · 미국 "ND:AAPL"). 추세선 얼러트가 이 코드의 현재가로 확인함. 없으면 종목 코드 */
  quoteCode?: string;
  /** 가격 단위: 국내 원(정수) · 미국 달러(센트까지). 기본 KRW */
  currency?: "KRW" | "USD";
  /** 봉이 없을 때 차트 가운데 안내 */
  emptyMessage?: string;
  onAddNote: (note: { time: number; price: number; text: string }) => void;
  /** 기록으로 저장: 드로잉·메모를 저장하고 AI 가 차트 메모로 정리 */
  onSave?: () => void;
  saving?: boolean;
  /** 뉴스 창의 'AI 노트에 인용' (일봉에서 뉴스 있는 날을 축에 표시하고, 읽은 뉴스를 노트로) */
  onQuoteNews?: (text: string) => void;
  /** 고른 시나리오 (없거나 닫으면 null) → AI 분석 · 저장에 같이 들어감 */
  onScenarioPick?: (picked: (Scenario & { base: string }) | null) => void;
  /** 바깥(AI 노트의 선 목록)에서 마우스를 올린 드로잉 → 차트에서 강조 */
  highlightId?: string | null;
  /** 전체 화면일 때 오른쪽에 붙는 칸 (종목 검색) */
  fullscreenSide?: React.ReactNode;
};

/** 노트 입력창을 띄울 위치(차트 영역 기준 px)와 데이터 좌표 */
type NoteDraft = { x: number; y: number; time: number; price: number };

/** 날짜 축 위에 띄우는 뉴스 버튼 / 열린 뉴스 */
/** axis: 날짜 축 높이(px) — 버튼을 축 바로 위에 붙인다 */
type AxisHover = { x: number; bar: Bar; axis: number; width: number };
type NewsView = { x: number; bar: Bar; axis: number; width: number; status: "loading" | "done" | "error"; items: NewsArticle[] };

/** 봉 시각 → KST 날짜 YYYY-MM-DD */
function kstDay(time: number) {
  return new Date((time + 9 * 3600) * 1000).toISOString().slice(0, 10);
}

/** 올린 지표 목록 (브라우저에 저장). 처음엔 거래량만 */
const INDICATOR_STORE = "trackit:indicators:v2";
/** 평단 선 표시 on/off */
const AVG_STORE = "trackit:show-avg-price";
const SMART_DRAW_STORE = "trackit:smart-draw";
/** 획 끝에서 이만큼(ms) 멈추면 더 삐뚤어도 직선으로 */
const HOLD_SNAP_MS = 450;
/** 이만큼(px) 안에서 누르고 떼면 클릭으로 본다 (손떨림·펜 흔들림 허용). 넘으면 끌어서 그리기 */
const CLICK_SLOP = 10;
/** 스마트 그리기 꺼짐: 이만큼 넘게 움직이면 클릭이 아니라 차트 끌기 */
const PLAIN_CLICK_SLOP = 4;
/** 다점 도구(경로 등): 이 시간(ms) 안에 같은 자리를 또 누르면 완성 */
const DOUBLE_TAP_MS = 400;
const DEFAULT_INSTANCES: IndicatorInstance[] = [{ uid: "volume", id: "volume", params: { ma: 20 }, visible: true }];

/**
 * 예전에 이동평균을 하나씩(기간 1개) 올려 둔 것은 한 묶음(기간 4개)으로 합친다.
 * 예: MA20, MA60 따로 → 묶음 하나 (20, 60, 0, 0)
 */
function mergeOldMovingAverages(list: IndicatorInstance[]): IndicatorInstance[] {
  const old = list.filter((i) => i.id === "sma" && typeof i.params.period === "number");
  if (!old.length) return list;
  const periods = old.map((i) => i.params.period).slice(0, 4);
  const colors = old.map((i, k) => i.colors?.[0] ?? ["#f59f00", "#e03131", "#2f9e44", "#7048e8"][k]).slice(0, 4);
  while (periods.length < 4) periods.push(0);
  while (colors.length < 4) colors.push(["#f59f00", "#e03131", "#2f9e44", "#7048e8"][colors.length]);
  const merged: IndicatorInstance = {
    uid: old[0].uid,
    id: "sma",
    params: Object.fromEntries(periods.map((p, k) => [`p${k + 1}`, p])),
    visible: old.some((i) => i.visible),
    colors,
  };
  return list.flatMap((i) => (i === old[0] ? [merged] : old.includes(i) ? [] : [i]));
}

function loadInstances(): IndicatorInstance[] {
  try {
    const saved = JSON.parse(readUserStorage(INDICATOR_STORE) ?? "");
    if (Array.isArray(saved)) return mergeOldMovingAverages((saved as IndicatorInstance[]).filter((i) => i && typeof i.uid === "string" && getIndicator(i.id)));
  } catch {
    // 처음이면 기본값
  }
  return DEFAULT_INSTANCES;
}

/** 차트 높이는 평소 640px 고정 (보조 창 2개까지 한 화면 안에). 보조 창은 약 100px 씩, 가격 창이 나머지.
 *  전체화면에서는 창 높이를 쓰고 보조 창이 많으면 나눠 쓴다 */
const BASE_CHART_PX = 640;
const SUB_PANE_PX = 100;
const MIN_MAIN_PX = 300;
/** 툴바(38)·기간 줄(45)·시간 축(약 28)을 뺀 그래프 영역 */
const CHART_CHROME_PX = 111;

/** 보조 창 왼쪽 위 한 줄 범례: 지표 이름 + 선마다 값(선 색) */
type PaneLegend = { uid: string; top: number; name: string; items: { label: string; color: string; value: string }[] };

/**
 * 선 단순화 (Ramer–Douglas–Peucker): 이웃을 잇는 직선에서 eps(px) 안쪽인 점을 뺀다. 남길 점의 번호(처음·끝 포함)
 * 붓질처럼 점이 수백 개인 선을 모양 그대로 수십 개로 줄인다
 */
function simplifyIndexes(pts: { x: number; y: number }[], eps: number): number[] {
  if (pts.length <= 2) return pts.map((_, i) => i);
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = pts[b].x - pts[a].x;
    const dy = pts[b].y - pts[a].y;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let farDist = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i].x - pts[a].x) - dx * (pts[i].y - pts[a].y)) / len;
      if (d > farDist) {
        far = i;
        farDist = d;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  return keep.flatMap((k, i) => (k ? [i] : []));
}

/** 차트 시각(toChartTime)으로 봉 찾기. 봉은 시간순이라 이분 탐색 (십자선 움직일 때마다 불림) */
function barAt(bars: Bar[], chartTime: number): Bar | null {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = toChartTime(bars[mid].time) as number;
    if (t === chartTime) return bars[mid];
    if (t < chartTime) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/** 평소에 보이는 보조 창 최대 개수 (전체화면에서는 전부) */
const MAX_SUB_PANES = 2;

/** 지금 그릴 지표: 수급 지표는 일봉에서만, 보조 창은 평소 2개까지 (목록 앞에서부터) */
function visibleIndicators(list: IndicatorInstance[], interval: string, fullscreen: boolean) {
  let subs = 0;
  return list.filter((i) => {
    const def = getIndicator(i.id);
    if (!i.visible || !def) return false;
    if (def.data === "flows" && interval !== "1d") return false;
    if (def.placement !== "separate") return true;
    subs += 1;
    return fullscreen || subs <= MAX_SUB_PANES;
  });
}

/** 메인 창 : 보조 창 1개 높이 비율. total = 차트 전체 높이 (전체화면이면 창 높이) */
function mainPaneRatio(subs: number, total?: number) {
  if (!subs) return 1;
  const area = (total ?? BASE_CHART_PX) - CHART_CHROME_PX;
  const mainMax = total ? Math.max(BASE_CHART_PX - CHART_CHROME_PX, area * 0.55) : BASE_CHART_PX - CHART_CHROME_PX;
  const main = Math.max(MIN_MAIN_PX, Math.min(mainMax, area - subs * SUB_PANE_PX));
  return main / Math.max(1, (area - main) / subs);
}

/** 지표 눈금 숫자: 큰 값은 천 단위 쉼표, 작은 값은 소수 */
const fmtIndicator = (v: number) => (Math.abs(v) >= 1000 ? won(Math.round(v)) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const usd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 축·범례 가격 */
const pxText = (v: number, cur: "KRW" | "USD") => (cur === "USD" ? usd(v) : won(Math.round(v)));
/** 드로잉 점 가격 반올림: 원은 1원, 달러는 1센트 */
const roundPx = (v: number, cur: "KRW" | "USD") => (cur === "USD" ? Math.round(v * 100) / 100 : Math.round(v));
const fmtVolume = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${won(Math.round(v / 1e4))}만` : won(Math.round(v)));

export default function WorkshopChart({ quoteCode, bars, interval, onIntervalChange, avgPrice, onDrawingsChange, registerRemove, registerAdd, overlayLines, delay, roleTags, onRoleChange, overlaySegments, registerSnapshot, loadedDrawings, notes, onAddNote, onSave, saving, dataKey, symbolCode, symbolName, market, currency = "KRW", emptyMessage, highlightId, onQuoteNews, fullscreenSide, onScenarioPick }: Props) {
  /** 차트를 한 번만 만들어서, 그 안의 콜백은 지금 단위를 ref 로 읽는다 */
  const currencyRef = useRef(currency);
  currencyRef.current = currency;
  /** 지금 주기 (드로잉의 인터벌 가시성 판정) */
  const intervalNowRef = useRef<string>(interval);
  intervalNowRef.current = interval;
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const layerRef = useRef<DrawingLayer | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // 차트 이벤트 핸들러가 항상 최신 값을 보도록 ref로도 들고 있는다
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const activeToolRef = useRef<string | null>(null);
  const pendingRef = useRef<DrawingPoint[]>([]);
  // 클릭 연결(useEffect [dataKey])에서 최신 봉 · 콜백을 읽기 위한 ref
  const barsRef = useRef(bars);
  barsRef.current = bars;
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  onDrawingsChangeRef.current = onDrawingsChange;
  /** Shift + 클릭 빠른 측정: 시작점 · 고정 여부 (저장 안 함) */
  const measureRef = useRef<{ start: DrawingPoint; fixed: boolean; x: number; y: number } | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [instances, setInstances] = useState<IndicatorInstance[]>(loadInstances);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 드로잉 편집 툴바에서 펼친 메뉴 */
  const [editMenu, setEditMenu] = useState<"color" | "width" | "dash" | "more" | null>(null);
  /** 더보기(⋯) 안에서 펼친 항목 */
  const [moreSub, setMoreSub] = useState<"template" | "order" | "intervals" | null>(null);
  // 그리기 설정 (자석 · 모두 감추기 · 모두 잠금) · 스타일 템플릿 — 이 브라우저에 저장 (lib/drawing/prefs)
  const drawPrefs = useDrawPrefs();
  const templates = useDrawTemplates();
  // 추세선 얼러트 (lib/api/alerts): 이 종목에 켜 둔 것. 선에 현재가가 닿으면 종 알림
  const alerts = useAlerts();
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const seenDrawingIds = useRef(new Set<string>());
  /** 객체 트리: 그린 것 목록 (고르기 · 감추기 · 잠금 · 삭제) */
  const [treeOpen, setTreeOpen] = useState(false);
  /** 선택 막대를 손잡이로 끌어 옮긴 거리 (차트를 가리지 않게) */
  const [barOffset, setBarOffset] = useState({ x: 0, y: 0 });
  /** 평균 단가 선 */
  const avgLineRef = useRef<IPriceLine | null>(null);
  const lastClose = bars[bars.length - 1]?.close;
  /** 평단 선 보이기 (툴바 "평단" 버튼, 사용자별로 이 브라우저에 저장) */
  const [showAvg, setShowAvg] = useState(() => readUserStorage(AVG_STORE) !== "off");
  function toggleAvg() {
    setShowAvg((on) => {
      localStorage.setItem(userStorageKey(AVG_STORE), on ? "off" : "on");
      return !on;
    });
  }
  /**
   * 스마트 그리기 (차트 노트 옆 스위치, 기본 끔). 끄면 원래 그리기 방식 그대로.
   * 켜면: 누름·놓음으로 점 찍기(조금 흔들려도 클릭), 누른 채 끌어 선 긋기, 도구를 든 동안 기존 드로잉 안 고름,
   *       브러시·형광펜의 거의 곧은 획은 직선으로 (끝에서 멈추면 더 삐뚤어도)
   */
  const [smartDraw, setSmartDraw] = useState(() => readUserStorage(SMART_DRAW_STORE) === "on");
  const smartRef = useRef(smartDraw);
  useEffect(() => {
    smartRef.current = smartDraw;
  }, [smartDraw]);
  function toggleSmartDraw() {
    setSmartDraw((on) => {
      localStorage.setItem(userStorageKey(SMART_DRAW_STORE), on ? "off" : "on");
      return !on;
    });
  }
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    if (!avgPrice || !showAvg) {
      if (avgLineRef.current) candle.removePriceLine(avgLineRef.current);
      avgLineRef.current = null;
      return;
    }
    const pct = lastClose ? ((lastClose - avgPrice.price) / avgPrice.price) * 100 : null;
    const options = {
      price: avgPrice.price,
      color: "#344d7d",
      lineWidth: 1 as const,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      axisLabelColor: "#344d7d",
      axisLabelTextColor: "#fff",
      title: `평단가${avgPrice.source === "모의" ? "(모의)" : ""}${pct === null ? "" : ` ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}`,
    };
    if (avgLineRef.current) avgLineRef.current.applyOptions(options);
    else avgLineRef.current = candle.createPriceLine(options);
  }, [avgPrice, lastClose, showAvg]);

  // 산 전략 겹치기 선 (보라 점선, 축에 가격)
  const overlayRef = useRef<IPriceLine[]>([]);
  const overlaySig = JSON.stringify(overlayLines ?? []);
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    for (const l of overlayRef.current) candle.removePriceLine(l);
    overlayRef.current = (overlayLines ?? []).map((l) =>
      candle.createPriceLine({ price: l.price, color: "#8b5cf6", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, axisLabelColor: "#8b5cf6", axisLabelTextColor: "#fff", title: l.title }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlaySig, dataKey, lastClose === undefined]);

  // 지지 · 저항 태그 (2026-11-22): 평단가처럼 가격 축 옆에 '지지' · '저항' (선은 드로잉이 그리므로 선은 안 그림)
  const roleLinesRef = useRef<IPriceLine[]>([]);
  const roleTagsRef = useRef(roleTags ?? []);
  const onRoleChangeRef = useRef(onRoleChange);
  // 가격은 정수로 줄여 비교 (기울어진 선은 시세마다 값이 조금씩 바뀌어 태그를 계속 다시 만들던 것)
  const roleSig = JSON.stringify((roleTags ?? []).map((t) => [Math.round(t.price * 100) / 100, tagTitle(t)]));
  const [roleMenu, setRoleMenu] = useState<{ tag: RoleTag; x: number; y: number } | null>(null);
  useEffect(() => {
    roleTagsRef.current = roleTags ?? [];
    onRoleChangeRef.current = onRoleChange;
  });
  // 태그를 누르면 작은 메뉴 (차트의 다른 클릭 처리보다 먼저 받음: 바깥 요소의 캡처 단계)
  useEffect(() => {
    const container = containerRef.current;
    const host = container?.parentElement;
    if (!container || !host) return;
    const hit = (e: PointerEvent) => {
      const chart = chartRef.current;
      const candle = candleRef.current;
      if (!chart || !candle || !roleTagsRef.current.length) return null;
      // 화면 배율(CSS zoom)이 걸려 있으면 마우스 좌표와 차트 좌표의 단위가 달라서 둘 다 맞춰 봄
      const rect = container.getBoundingClientRect();
      const scale = rect.width ? container.clientWidth / rect.width : 1;
      const paneW = chart.timeScale().width();
      for (const k of scale === 1 ? [1] : [1, scale]) {
        const x = (e.clientX - rect.left) * k;
        const y = (e.clientY - rect.top) * k;
        if (x < paneW - 56 || x > container.clientWidth) continue;
        let best: { tag: (typeof roleTagsRef.current)[number]; d: number } | null = null;
        for (const tag of roleTagsRef.current) {
          const ty = candle.priceToCoordinate(tag.price);
          if (ty === null) continue;
          const d = Math.abs(ty - y);
          if (d <= 10 && (!best || d < best.d)) best = { tag, d };
        }
        if (best) return { tag: best.tag, x, y };
      }
      return null;
    };
    // 태그를 누른 한 번은 끝까지 태그가 받음 (드로잉 도구가 켜져 있으면 놓을 때 점이 찍혀서)
    let swallow = false;
    const onDown = (e: PointerEvent) => {
      const h = hit(e);
      swallow = false;
      if (!h) return;
      swallow = true;
      e.stopPropagation();
      e.preventDefault();
      setRoleMenu({ tag: h.tag, x: h.x, y: h.y });
    };
    const eat = (e: Event) => {
      if (!swallow) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.type === "click") swallow = false;
    };
    const onMove = (e: PointerEvent) => {
      container.style.cursor = hit(e) ? "pointer" : "";
    };
    const later = ["pointerup", "mousedown", "mouseup", "click"] as const;
    host.addEventListener("pointerdown", onDown, true);
    for (const t of later) host.addEventListener(t, eat, true);
    host.addEventListener("pointermove", onMove);
    return () => {
      host.removeEventListener("pointerdown", onDown, true);
      for (const t of later) host.removeEventListener(t, eat, true);
      host.removeEventListener("pointermove", onMove);
    };
  }, []);
  useEffect(() => {
    if (!roleMenu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest(".ws-role-menu")) return;
      setRoleMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [roleMenu]);

  // 기울어진 겹치기 선: 봉마다 그 시각의 선 가격 (봉 밖 시각은 만들지 않아 차트 시간축이 안 흔들림)
  const segRef = useRef<ISeriesApi<"Line">[]>([]);
  const segSig = JSON.stringify(overlaySegments ?? []);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const sr of segRef.current) {
      try {
        chart.removeSeries(sr);
      } catch {
        // 차트를 새로 만들었으면 이미 없음
      }
    }
    segRef.current = [];
    const list = barsRef.current;
    if (!list.length) return;
    const last = list[list.length - 1].time;
    for (const seg of overlaySegments ?? []) {
      const [a, b] = seg.a.time <= seg.b.time ? [seg.a, seg.b] : [seg.b, seg.a];
      if (b.time === a.time) continue;
      const slope = (b.price - a.price) / (b.time - a.time);
      const end = seg.extend ? last : Math.min(b.time, last);
      const data = list.filter((x) => x.time >= a.time && x.time <= end).map((x) => ({ time: x.time as Time, value: a.price + slope * (x.time - a.time) }));
      if (data.length < 2) continue;
      const sr = chart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, title: seg.title, crosshairMarkerVisible: false });
      sr.setData(data);
      segRef.current.push(sr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segSig, dataKey, bars.length]);

  /** 시나리오: 만든 시점의 종목·간격(dataKey) 에서만 보인다 */
  const [scenarioState, setScenarioState] = useState<{ key: string; base: string; list: Scenario[] } | null>(null);
  const scenarios = useMemo(() => (scenarioState?.key === dataKey ? scenarioState.list : []), [scenarioState, dataKey]);
  const [scenarioPick, setScenarioPick] = useState<ScenarioName | null>(null);
  const [scenarioHover, setScenarioHover] = useState<{ name: ScenarioName; x: number; y: number } | null>(null);
  const [scenarioMsg, setScenarioMsg] = useState<string | null>(null);
  const scenarioRef = useRef<{ list: Scenario[]; pick: ScenarioName | null }>({ list: [], pick: null });
  useEffect(() => {
    scenarioRef.current = { list: scenarios, pick: scenarioPick };
  });
  const scenarioSeriesRef = useRef(new Map<ScenarioName, ISeriesApi<"Candlestick">>());

  /** 시나리오 보기: 버튼을 눌렀을 때만, 가장 최근 수평선·추세선 기준으로 미래 5영업일 3묶음 */
  function showScenarios() {
    selectTool(null);
    if (interval !== "1d") return setScenarioMsg("시나리오는 1일봉에서 볼 수 있어요.");
    const found = latestScenarioBase(drawingsRef.current, bars);
    if (!found) return setScenarioMsg("기준이 될 선·박스·포지션을 먼저 그려 주세요");
    const dayBars = bars.map((b) => ({ time: ymdOf(b.time), open: b.open, high: b.high, low: b.low, close: b.close }));
    const list = buildScenariosFor(dayBars, found.base);
    if (!list.length) return setScenarioMsg("봉이 부족해 시나리오를 만들 수 없어요.");
    setScenarioState({ key: dataKey, base: found.label, list });
    setScenarioPick(null);
    setScenarioMsg(null);
  }
  function closeScenarios() {
    setScenarioState(null);
    setScenarioPick(null);
    setScenarioHover(null);
  }

  // 시나리오 캔들: 시나리오마다 시리즈 하나. 고르면 고른 것만 남긴다
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = scenarioSeriesRef.current;
    for (const sc of scenarios) {
      if (scenarioPick && sc.name !== scenarioPick) continue;
      const series = chart.addSeries(CandlestickSeries, {
        ...scenarioColors(scenarioPick ? SCENARIO_ALPHA.picked : SCENARIO_ALPHA.idle),
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(sc.candles.map((c) => ({ time: epochOf(c.time) as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
      map.set(sc.name, series);
    }
    return () => {
      map.forEach((series) => {
        try {
          chart.removeSeries(series);
        } catch {
          // 차트가 먼저 정리된 경우
        }
      });
      map.clear();
    };
  }, [scenarios, scenarioPick]);
  // 고른 시나리오를 화면(작업실)에 알림 → AI 분석 후 저장에 반영
  const onScenarioPickRef = useRef(onScenarioPick);
  useEffect(() => {
    onScenarioPickRef.current = onScenarioPick;
  });
  const pickedScenario = scenarioPick ? scenarios.find((s) => s.name === scenarioPick) : undefined;
  const pickedBase = scenarioState?.base ?? "";
  useEffect(() => {
    onScenarioPickRef.current?.(pickedScenario ? { ...pickedScenario, base: pickedBase } : null);
  }, [pickedScenario, pickedBase]);
  // 마우스가 올라간 시나리오만 진하게
  const hoverName = scenarioHover?.name ?? null;
  useEffect(() => {
    if (scenarioPick) return;
    scenarioSeriesRef.current.forEach((series, name) => series.applyOptions(scenarioColors(name === hoverName ? SCENARIO_ALPHA.hover : SCENARIO_ALPHA.idle)));
  }, [hoverName, scenarioPick, scenarios]);

  /** 드로잉 도구 설명 말풍선 (목록 밖으로 보이게 화면 기준 위치) */
  const [toolTip, setToolTip] = useState<{ text: string; x: number; y: number } | null>(null);
  /** 봉 간격 직접 설정 창 */
  const [customOpen, setCustomOpen] = useState(false);
  /** 수급 지표용 일별 데이터 (종목별, 필요할 때만 받음) */
  const [flows, setFlows] = useState<{ code: string; map: Map<number, FlowDay> } | null>(null);
  // 국내 ↔ 미국 종목으로 바꾸면 가격 축 형식(원 정수 · 달러 센트)도 바꾼다
  useEffect(() => {
    candleRef.current?.applyOptions({ priceFormat: { type: "custom", minMove: currency === "USD" ? 0.01 : 1, formatter: (price: number) => pxText(price, currencyRef.current) } });
  }, [currency]);
  // 수급(개인·외국인·기관)은 국내만
  const needsFlows = currency === "KRW" && interval === "1d" && instances.some((i) => i.visible && (getIndicator(i.id)?.data === "flows" || getIndicator(i.id)?.optionalData === "flows"));
  /** 올린 지표별 시리즈 (출력 선마다 하나) */
  const indSeriesRef = useRef(new Map<string, ISeriesApi<SeriesType>[]>());
  /** 지표 실시간 갱신 판정용: 지난번에 그린 데이터 key·봉 수 */
  const indShownRef = useRef<{ key: string; len: number; flows: unknown } | null>(null);
  /** 실시간 체결 때 지표 재계산을 1초에 한 번으로 묶는다 (지표는 매번 전체 봉을 다시 계산해서 무겁다) */
  const indLiveRef = useRef<{ at: number; instances: unknown; timer: ReturnType<typeof setTimeout> | null }>({ at: 0, instances: null, timer: null });
  const [indTick, setIndTick] = useState(0);
  /** 보조 창마다 왼쪽 위에 띄우는 범례 (눈금 이름표 대신, 차트가 덜 복잡하게) */
  const [paneLegends, setPaneLegends] = useState<PaneLegend[]>([]);
  const paneLegendSigRef = useRef("");
  const instancesRef = useRef(instances);
  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);
  const drawingsRef = useRef<Drawing[]>([]);
  const [past, setPast] = useState<Drawing[][]>([]);
  const [future, setFuture] = useState<Drawing[][]>([]);
  const [openGroup, setOpenGroup] = useState<ToolGroup | "trash" | null>(null);
  /** 도구 줄 묶음마다 마지막에 쓴 도구. 묶음 버튼을 누르면 바로 그 도구 (저장 안 함: 새로고침하면 처음처럼) */
  const [lastTool, setLastTool] = useState<Partial<Record<ToolGroup, string>>>({});
  // 차트 노트 메뉴 (차트 노트 + 글·주석 도구). 메뉴 밖을 누르면 닫는다
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const noteMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!noteMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (noteMenuRef.current?.contains(e.target as Node)) return;
      setNoteMenuOpen(false);
      setToolTip(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [noteMenuOpen]);

  // 드로잉 도구 펼침 메뉴는 도구 줄 밖을 누르면 닫는다
  const drawToolsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: PointerEvent) => {
      if (drawToolsRef.current?.contains(e.target as Node)) return;
      setOpenGroup(null);
      setToolTip(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openGroup]);

  /** 눌러서 고른 드로잉 (색·굵기·삭제·이동) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // AI 노트 선 목록에서 마우스를 올리면 그 선을 강조 (떼면 해제)
  useEffect(() => {
    if (highlightId === undefined) return;
    layerRef.current?.setHovered(highlightId);
  }, [highlightId]);
  /** 지금 툴로 찍은 점 수 (안내 문구용) */
  const [pendingCount, setPendingCount] = useState(0);
  const [hovered, setHovered] = useState<Bar | null>(null);
  const [axisHover, setAxisHover] = useState<AxisHover | null>(null);
  const [news, setNews] = useState<NewsView | null>(null);
  /** 날짜 축 위 '뉴스 있는 날' 점 (일봉만). 화면에 보이는 것만, 스크롤 · 확대하면 다시 계산 */
  // 백엔드에 뉴스를 모아 둔 날 (등락 큰 날과 합쳐 점을 찍음)
  const [storedNewsDays, setStoredNewsDays] = useState<Set<string>>(new Set());
  // 실시간 시세로 마지막 봉만 바뀔 때는 다시 묻지 않게 (종목 · 주기 · 봉 개수가 바뀔 때만)
  const newsBarsRef = useRef(bars);
  newsBarsRef.current = bars;
  const newsKey = interval === "1d" && bars.length >= 2 ? `${symbolCode}:${bars.length}:${bars[0].time}` : "";
  useEffect(() => {
    const bars = newsBarsRef.current;
    if (!newsKey) return;
    const ac = new AbortController();
    const from = kstDay(bars[0].time);
    const to = kstDay(bars[bars.length - 1].time);
    // 1) 이미 모아 둔 날 바로 → 2) 등락 큰 날 · 최근 닷새 중 아직 안 모은 날을 백엔드가 찾아 본 뒤 다시
    // 인터넷 기사 검색은 최근 1년 반 정도만 의미가 있어서 그 안에서만 후보를 고른다
    const since = bars[bars.length - 1].time - 548 * 86_400; // 봉 time 은 초
    const big = [...newsDays(bars)].filter((t) => t >= since).map((t) => {
      const i = bars.findIndex((b) => b.time === t);
      return { day: kstDay(t), move: i > 0 ? Math.abs(bars[i].close / bars[i - 1].close - 1) : 0 };
    });
    const check = [...new Set([...bars.slice(-5).map((b) => kstDay(b.time)), ...big.sort((a, b) => b.move - a.move).slice(0, 25).map((d) => d.day)])];
    fetchNewsDays(symbolCode, from, to, ac.signal)
      .then(setStoredNewsDays)
      .then(() => fetchNewsDays(symbolCode, from, to, ac.signal, check, symbolName))
      .then((days) => days && setStoredNewsDays(days))
      .catch(() => {});
    return () => ac.abort();
  }, [newsKey, symbolCode, symbolName]);
  const [newsMarks, setNewsMarks] = useState<{ x: number; bar: Bar; axis: number; width: number }[]>([]);
  const newsAbortRef = useRef<AbortController | null>(null);
  // 뉴스 창이 떠 있을 때 바깥(뉴스 원 말고)을 누르면 닫는다
  const newsPanelRef = useRef<HTMLElement | null>(null);
  const newsOpen = !!news;
  useEffect(() => {
    if (!newsOpen) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (newsPanelRef.current?.contains(t as Node) || t?.closest?.(".ws-news-mark")) return;
      newsAbortRef.current?.abort();
      setNews(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [newsOpen]);
  /** 전체 화면: 차트가 브라우저 창을 덮는다 (가능하면 모니터 전체 화면도 같이) */
  const [fullscreen, setFullscreen] = useState(false);
  // 차트 노트 모드: 켜면 차트를 클릭한 지점에 메모 입력창이 뜬다
  const [noteMode, setNoteMode] = useState(false);
  const noteModeRef = useRef(false);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [noteInput, setNoteInput] = useState("");
  /** 텍스트·노트·말풍선 같은 툴: 점을 다 찍은 뒤 글을 받는 입력창 */
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; drawing: Drawing; editing?: boolean } | null>(null);
  const [textInput, setTextInput] = useState("");

  const last = bars[bars.length - 1] as Bar | undefined;
  const legendBar = hovered ?? last;
  const legendPrev = legendBar ? (bars[bars.indexOf(legendBar) - 1] ?? legendBar) : undefined;
  const loadedKeyRef = useRef<string | null>(null);
  const shownRef = useRef<Bar[]>([]);
  const markerKeyRef = useRef<{ notes: unknown; len: number; first: number } | null>(null);

  // 차트 생성 (한 번)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // 화면 맞춤(zoom)일 때 마우스 좌표 바로잡기 (lib/zoom-pointer.ts)
    const unfixZoom = fixZoomPointer(container);
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#555",
        fontSize: 11,
        // 숫자는 폭이 고정된(tabular) 글꼴에서 → 가격 축의 현재가·평단가·십자선 칸 크기가 같다. 한글은 Pretendard
        fontFamily: "'Segoe UI', 'Helvetica Neue', Pretendard, 'Noto Sans KR', sans-serif",
        attributionLogo: false,
        // 아래 보조 창 사이 구분선 (회색). 끌어서 창 높이를 바꿀 수 있다
        panes: { separatorColor: "#b8bec7", separatorHoverColor: "rgba(52, 77, 125, 0.25)", enableResize: true },
      },
      grid: { vertLines: { color: "#f0f0f0" }, horzLines: { color: "#f0f0f0" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, minimumWidth: 78 },
      // minBarSpacing: 1985년부터 1만 개 넘는 일봉도 "전체"에서 한 화면에 들어오게
      timeScale: { borderVisible: false, rightOffset: 4, minBarSpacing: 0.02 },
      localization: {
        locale: "ko-KR",
        // 차트 시각은 KST 벽시계 값이므로 UTC 기준으로 읽으면 KST가 나온다
        timeFormatter: (time: Time) => {
          const d = new Date((time as number) * 1000);
          const pad = (n: number) => String(n).padStart(2, "0");
          const date = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
          return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? date : `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        },
      },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceLineColor: "#787b86",
      priceLineStyle: LineStyle.Dashed,
      priceFormat: { type: "custom", minMove: currencyRef.current === "USD" ? 0.01 : 1, formatter: (price: number) => pxText(price, currencyRef.current) },
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.2, bottom: 0.24 } });

    const layer = new DrawingLayer();
    candle.attachPrimitive(layer);
    markersRef.current = createSeriesMarkers(candle, []);
    // 새 차트는 비어 있으므로 다음 데이터 반영은 전체 setData로 (개발 모드 재마운트·핫리로드 대비)
    loadedKeyRef.current = null;
    shownRef.current = [];
    layer.setDrawings(drawingsRef.current);
    layer.setVisibility(intervalNowRef.current, getDrawPrefs().hideAll);
    const resizeObserver = new ResizeObserver(() => refreshPaneLegends());
    resizeObserver.observe(container);

    chartRef.current = chart;
    candleRef.current = candle;
    // (단위가 바뀌면 아래 효과가 priceFormat 을 다시 넣는다)
    // 새 차트에는 지표 시리즈가 없다 → 아래 지표 effect가 다시 만든다
    indSeriesRef.current.clear();
    indShownRef.current = null;
    layerRef.current = layer;

    return () => {
      resizeObserver.disconnect();
      unfixZoom();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      roleLinesRef.current = [];
      layerRef.current = null;
      markersRef.current = null;
    };
  }, []);
  // 지지 · 저항 태그 가격선 (차트를 만든 뒤에 돌아야 해서 여기)
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    // 있는 가격선은 고치기만 (지웠다 새로 만들면 그리는 중 클릭이 씹힘), 모자라면 만들고 남으면 지움
    const tags = roleTags ?? [];
    const lines = roleLinesRef.current;
    tags.forEach((t, i) => {
      const color = TAG_COLOR[tagTitle(t)] ?? "#495057";
      const opts = { price: t.price, color, lineVisible: false, axisLabelVisible: true, axisLabelColor: color, axisLabelTextColor: "#fff", title: tagTitle(t) };
      if (lines[i]) lines[i].applyOptions(opts);
      else lines[i] = candle.createPriceLine(opts);
    });
    for (const l of lines.splice(tags.length)) candle.removePriceLine(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleSig, dataKey, lastClose === undefined]);

  // 화면 테마(라이트/다크)에 맞춰 차트 바탕·글자·격자 색을 바꾼다. <html data-theme> 이 바뀌면 바로 따라간다
  useEffect(() => {
    const apply = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      chartRef.current?.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: dark ? "#161a21" : "#ffffff" },
          textColor: dark ? "#9098a7" : "#555",
          panes: { separatorColor: dark ? "#353c4a" : "#b8bec7", separatorHoverColor: dark ? "rgba(124, 155, 224, 0.3)" : "rgba(52, 77, 125, 0.25)" },
        },
        grid: { vertLines: { color: dark ? "#20252e" : "#f0f0f0" }, horzLines: { color: dark ? "#20252e" : "#f0f0f0" } },
        crosshair: { vertLine: { color: dark ? "#687183" : "#9598a1", labelBackgroundColor: dark ? "#353c4a" : "#131722" }, horzLine: { color: dark ? "#687183" : "#9598a1", labelBackgroundColor: dark ? "#353c4a" : "#131722" } },
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // 차트 노트를 캔들 위 마커로 표시. 분봉에선 노트 시각 이전의 가장 가까운 봉에 붙인다
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers || bars.length === 0) return;
    // 실시간 체결로 마지막 봉 값만 바뀐 경우는 붙일 봉이 그대로라 건너뛴다 (노트마다 전체 봉을 훑어서)
    const key = { notes, len: bars.length, first: bars[0].time };
    const prevKey = markerKeyRef.current;
    if (prevKey && prevKey.notes === key.notes && prevKey.len === key.len && prevKey.first === key.first) return;
    markerKeyRef.current = key;
    const items = notes
      .map((note) => {
        let target: Bar | undefined;
        for (const bar of bars) if (bar.time <= note.time) target = bar;
        return target ? { time: toChartTime(target.time), position: "aboveBar" as const, shape: "arrowDown" as const, color: "#344d7d", text: "노트" } : null;
      })
      .filter((m) => m !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));
    markers.setMarkers(items);
  }, [notes, bars]);

  // 데이터 반영: 종목·간격이 바뀌면 전체 교체, 실시간 갱신이면 바뀐 끝부분만 update
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;
    const toCandle = (b: Bar) => ({ time: toChartTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close });
    layerRef.current?.setBars(bars);
    const prev = shownRef.current;
    // 끝에 봉이 붙기만 했을 때만 update. 앞쪽이 밀리거나(가장 오래된 봉이 빠지고 새 봉) 다시 받아 시각이 달라지면 전체 교체
    //   (update 에 마지막보다 이른 시각을 주면 lightweight-charts 가 "Cannot update oldest data" 로 멈춘다)
    const live =
      loadedKeyRef.current === dataKey &&
      prev.length > 0 &&
      bars.length >= prev.length &&
      bars.length - prev.length <= 2 &&
      bars[prev.length - 1]?.time === prev[prev.length - 1].time &&
      bars[0]?.time === prev[0].time;
    shownRef.current = bars;
    // 봉이 아직 적을 때(초봉처럼 실시간으로 쌓는 중)는 칸 수를 고정해 오른쪽부터 채운다.
    // fitContent 로 두면 첫 봉 몇 개가 화면 폭을 다 차지해, 새 봉마다 옆으로 밀리며 앞 봉이 안 보였다
    const growing = (n: number) => n > 0 && n < GROW_SLOTS;
    const showGrowing = () => chart.timeScale().setVisibleLogicalRange({ from: bars.length - GROW_SLOTS, to: bars.length + 4 });
    if (live) {
      try {
        for (let i = Math.max(0, prev.length - 1); i < bars.length; i++) {
          candle.update(toCandle(bars[i]));
        }
        if (bars.length > prev.length && growing(bars.length)) showGrowing();
        return;
      } catch {
        // 순서가 어긋났으면 아래에서 전체 교체
      }
    }
    candle.setData(bars.map(toCandle));
    loadedKeyRef.current = bars.length > 0 ? dataKey : null;
    const intraday = !isDailyLike(interval);
    chart.applyOptions({
      timeScale: {
        timeVisible: intraday,
        secondsVisible: isSeconds(interval),
        tickMarkFormatter: (time: Time, tickType: number) => {
          const d = new Date((time as number) * 1000);
          const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(d.getUTCDate()).padStart(2, "0");
          // 0 = 해 바뀜, 1 = 달 바뀜 (lightweight-charts TickMarkType). 수십 년치 일봉에서 연도가 보이게
          if (!intraday && tickType === 0) return String(d.getUTCFullYear());
          if (!intraday && tickType === 1) return `${d.getUTCFullYear()}.${mm}`;
          if (!intraday || (d.getUTCHours() === 9 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)) return `${mm}.${dd}`;
          if (isSeconds(interval)) return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
          return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        },
      },
    });
    // 봉이 많으면 최근 것만 보이게 (나머지는 스크롤·축소로). 다 넣으면 캔들이 실처럼 가늘어진다
    // 간격을 바꾼 직후엔 지표 시리즈에 이전 간격 데이터가 남아 있어 봉 번호(logical)로 맞추면 엉뚱한 곳을 보여 준다.
    // → 지표까지 바뀐 다음 프레임에, 번호가 아니라 시각으로 최근 구간을 맞춘다
    const shown = isDailyLike(interval) ? 120 : 150;
    if (!bars.length) return;
    const from = toChartTime(bars[Math.max(0, bars.length - shown)].time);
    const to = toChartTime(bars[bars.length - 1].time);
    const frame = requestAnimationFrame(() => {
      const ts = chartRef.current?.timeScale();
      if (!ts) return;
      try {
        candleRef.current?.priceScale().applyOptions({ autoScale: true });
        if (bars.length > shown + 30) {
          // 마지막 봉의 번호를 시각으로 찾아(지표 시리즈가 섞여 있어도 정확), 그 봉이 가운데 살짝 오른쪽에 오게
          const last = ts.timeToIndex(to, true);
          if (last !== null) ts.setVisibleLogicalRange({ from: last - shown * LAST_BAR_AT, to: last + shown * (1 - LAST_BAR_AT) });
          else ts.setVisibleRange({ from, to });
        } else if (isSeconds(interval) && growing(bars.length)) showGrowing();
        else ts.fitContent();
      } catch {
        // 차트가 정리된 경우
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [bars, interval, dataKey]);

  // 오른쪽 가격 축 위에서 휠 = 그 칸의 가격 범위만 늘이고 줄임 (차트 위 휠은 그대로 시간 확대·축소)
  // 마우스가 있는 가격을 중심으로. 가격 축을 두 번 누르면 자동 범위로 돌아감 (라이브러리 기본)
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;
    const onWheel = (e: WheelEvent) => {
      const box = container.getBoundingClientRect();
      for (const pane of chart.panes()) {
        const el = pane.getHTMLElement();
        const series = pane.getSeries()[0];
        if (!el || !series) continue;
        const r = el.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom) continue;
        const scale = series.priceScale();
        const axisLeft = box.right - scale.width();
        if (e.clientX < axisLeft) return; // 차트 위면 원래 동작
        const range = scale.getVisibleRange();
        if (!range || e.deltaY === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const at = series.coordinateToPrice(e.clientY - r.top);
        const center = at === null ? (range.from + range.to) / 2 : Number(at);
        const f = e.deltaY > 0 ? 1.12 : 1 / 1.12; // 아래로 굴리면 범위가 넓어져 캔들이 작아짐
        scale.setAutoScale(false);
        scale.setVisibleRange({ from: center - (center - range.from) * f, to: center + (range.to - center) * f });
        return;
      }
    };
    // 차트보다 먼저 받아야 시간 축 확대가 같이 일어나지 않는다
    container.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => container.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  // 클릭으로 점 찍기, 마우스 이동으로 미리보기·범례
  //   실시간 시세로 봉이 바뀔 때마다 이 연결을 다시 하면, 누름과 놓음 사이에 시세가 들어온 경우 누른 자리(press)가 사라져
  //   "한 번 클릭했는데 점이 안 찍히는" 일이 생겼다 → 종목 · 간격(dataKey)이 바뀔 때만 다시 연결하고, 봉은 ref 로 읽는다
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const container = containerRef.current;
    if (!chart || !candle || !container) return;

    const pointAt = (x: number, y: number): DrawingPoint | null => {
      if (x > chart.paneSize().width || y > chart.paneSize(0).height) return null; // 가격 축·보조 창 위 클릭은 무시
      // 마지막 봉 뒤(미래)도 봉 간격으로 시각을 늘려 잡는다 (예측·포지션 툴)
      const time = layerRef.current?.xToTime(x) ?? null;
      const raw = candle.coordinateToPrice(y);
      if (time === null || raw === null) return null;
      // 자석: 그 봉의 시가 · 고가 · 저가 · 종가 가까이면 그 값에 붙임
      const price = getDrawPrefs().magnet ? (layerRef.current?.magnetPrice(time, raw) ?? raw) : raw;
      return { time, price: String(roundPx(price, currencyRef.current)) };
    };
    /** 펜 · 지우개: 봉에 맞추지 않은 그 자리 그대로의 점 */
    const pointAtExact = (x: number, y: number): DrawingPoint | null => {
      if (x > chart.paneSize().width || y > chart.paneSize(0).height) return null;
      const time = layerRef.current?.xToTimeExact(x) ?? null;
      const price = candle.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time, price: String(price) };
    };
    const localXY = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const currentTool = () => (activeToolRef.current ? getTool(activeToolRef.current) : undefined);

    // 라이브러리의 subscribeClick은 500ms 안의 두 번째 클릭을 더블클릭 판정으로 돌려
    // 두 점이 떨어져 있으면 아무 이벤트도 보내지 않는다 → 빠르게 찍으면 끝점이 사라짐.
    // 그래서 브라우저 click을 직접 받고, 끌어서 이동(팬)한 경우만 걸러낸다.
    let down: { x: number; y: number } | null = null;
    /** 드로잉 끌기: 손잡이(handle)면 그 점만, 아니면 전체 이동 */
    let drag: { id: string; handle: number | null; startX: number; startY: number; orig: Drawing; moved: boolean } | null = null;
    /** 드로잉을 누른 직후의 click 은 선택 해제로 보지 않는다 */
    let skipClick = false;

    // 캡처 단계에서 먼저 받아, 드로잉을 누른 경우엔 차트가 끌기(이동)를 시작하지 않게 막는다
    /** 그리기 도구를 골라 둔 상태라도, 아직 점을 찍기 전이면 기존 드로잉을 눌러 고를 수 있다 (트레이딩뷰처럼) */
    /** 이 위치의 시나리오: 그 봉의 (고가+저가)/2 가 마우스 가격과 가장 가까운 것 */
    const scenarioAt = (x: number, y: number): ScenarioName | null => {
      const { list, pick } = scenarioRef.current;
      if (pick || !list.length || activeToolRef.current || noteModeRef.current) return null;
      const t = chart.timeScale().coordinateToTime(x);
      const price = candleRef.current?.coordinateToPrice(y) ?? null;
      if (t === null || price === null) return null;
      const ymd = ymdOf(t as number);
      let best: { name: ScenarioName; dist: number } | null = null;
      for (const sc of list) {
        const c = sc.candles.find((k) => k.time === ymd);
        if (!c) continue;
        const dist = Math.abs((c.high + c.low) / 2 - price);
        if (!best || dist < best.dist) best = { name: sc.name, dist };
      }
      return best?.name ?? null;
    };
    let lastScenarioHover: ScenarioName | null = null;
    const hoverScenario = (x: number, y: number) => {
      const name = scenarioAt(x, y);
      if (name === lastScenarioHover) return name;
      lastScenarioHover = name;
      const sc = name ? scenarioRef.current.list.find((k) => k.name === name) : null;
      const end = sc?.candles[sc.candles.length - 1];
      const ex = end ? chart.timeScale().timeToCoordinate(epochOf(end.time) as Time) : null;
      const ey = end ? (candleRef.current?.priceToCoordinate(end.close) ?? null) : null;
      setScenarioHover(name && ex !== null && ey !== null ? { name, x: ex, y: ey } : null);
      return name;
    };

    // 기존 드로잉 고르기 · 옮기기: 도구가 없을 때, 또는 도구를 들고 있어도 아직 첫 점을 안 찍었을 때.
    // 첫 점을 찍은 뒤엔 누름은 항상 "다음 점" (다른 드로잉 위를 눌러도 고르지 않고 점이 찍힌다)
    // 스마트 켜짐: 도구를 든 동안엔 기존 드로잉을 안 고름 (그리려다 옆 선이 잡히지 않게). 꺼짐: 원래대로 점 찍기 전이면 고름
    const canPick = () => !noteModeRef.current && (!activeToolRef.current || (!smartRef.current && pendingRef.current.length === 0));
    const handleCaptureDown = (event: PointerEvent) => {
      if (!canPick() || event.button !== 0) return;
      const layer = layerRef.current;
      if (!layer) return;
      const { x, y } = localXY(event);
      // 반투명 시나리오 캔들은 누르는 순간 바로 고른다 (기준선 드로잉이 겹쳐 있어도 시나리오가 먼저)
      const scenario = scenarioAt(x, y);
      if (scenario) {
        event.stopPropagation();
        setScenarioPick(scenario);
        setScenarioHover(null);
        lastScenarioHover = null;
        skipClick = true;
        return;
      }
      const sel = layer.selected();
      const handle = sel ? layer.handleAt(sel, x, y) : null;
      const id = handle !== null ? sel : layer.drawingAt(x, y);
      const orig = id ? drawingsRef.current.find((d) => d.id === id) : undefined;
      if (!id || !orig) return;
      event.stopPropagation();
      // 잠근 드로잉: 고르기만 (선택 막대에서 풀 수 있게), 끌어서 옮기지 않음
      if (orig.locked || getDrawPrefs().lockAll) {
        selectDrawing(id);
        skipClick = true;
        return;
      }
      // 도구는 그대로 들고 있는다 (빈 곳을 누르면 바로 새로 그림)
      selectDrawing(id);
      skipClick = true;
      drag = { id, handle, startX: x, startY: y, orig, moved: false };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // 포인터가 이미 사라진 경우
      }
    };
    const blockWhileDragging = (event: Event) => {
      if (drag) event.stopPropagation();
    };
    // 툴 없이 마우스를 올리면: 드로잉 위 → 손가락 커서 + 옅은 손잡이, 고른 드로잉의 점 위 → 이동 커서
    const handleHover = (event: PointerEvent) => {
      const layer = layerRef.current;
      if (!layer || drag || !canPick()) {
        if (layer && !drag) layer.setHovered(null);
        return;
      }
      const { x, y } = localXY(event);
      const sel = layer.selected();
      const selLocked = !!sel && (getDrawPrefs().lockAll || !!drawingsRef.current.find((d) => d.id === sel)?.locked);
      const onHandle = sel && !selLocked ? layer.handleAt(sel, x, y) !== null : false;
      const id = onHandle ? sel : layer.drawingAt(x, y);
      layer.setHovered(id);
      if (!id && hoverScenario(x, y)) {
        container.style.cursor = "pointer";
        return;
      }
      // 도구를 고른 상태에선 빈 곳은 십자 커서(CSS) 그대로
      container.style.cursor = onHandle ? "move" : id ? "pointer" : "";
    };
    const handleLeave = () => {
      layerRef.current?.setHovered(null);
      container.style.cursor = "";
    };

    const handleDragMove = (event: PointerEvent) => {
      const layer = layerRef.current;
      if (!drag || !layer) return;
      const { x, y } = localXY(event);
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      const cur = drag;
      const points = cur.orig.points.map((p, i) => {
        if (cur.handle !== null && i !== cur.handle) return p;
        const px0 = layer.timeToX(p.time);
        const py0 = layer.priceToY(Number(p.price));
        if (px0 === null || py0 === null) return p;
        const time = layer.xToTime(px0 + dx);
        const price = layer.yToPrice(py0 + dy);
        return time === null || price === null ? p : { time, price: String(roundPx(price, currencyRef.current)) };
      });
      apply(drawingsRef.current.map((d) => (d.id === cur.id ? { ...cur.orig, points } : d)));
    };
    const handleDragUp = () => {
      if (!drag) return;
      const done = drag;
      drag = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      if (done.moved) {
        // 실행 취소로 옮기기 전 자리로 돌아가게
        const before = drawingsRef.current.map((d) => (d.id === done.id ? done.orig : d));
        setPast((p) => [...p, before]);
        setFuture([]);
      }
    };
    /** 브러시: 누른 채 끄는 동안 모은 점 */
    let stroke: DrawingPoint[] | null = null;
    /** 붓질한 점의 화면 좌표 (끝날 때 모양을 유지한 채 점 수를 줄이는 데 씀) */
    let strokeXY: { x: number; y: number }[] = [];
    let lastXY: { x: number; y: number } | null = null;
    /** 점 찍는 도구로 누른 자리 (놓을 때 점을 찍거나, 끌었으면 선을 완성) */
    let press: { x: number; y: number; point: DrawingPoint; dragging: boolean } | null = null;
    /** 바로 전에 찍은 점 (다점 도구의 더블클릭 판정) */
    let lastTap: { t: number; x: number; y: number } | null = null;

    /** 점 하나 찍기. 다 모이면 드로잉 완성 */
    const placePoint = (tool: DrawingTool, point: DrawingPoint, x: number, y: number) => {
      if (tool.mode === "multi") {
        const now = performance.now();
        const double = lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) <= CLICK_SLOP;
        lastTap = { t: now, x, y };
        // 두 번 빠르게 누르면 점을 더하지 않고 끝낸다
        if (double) {
          lastTap = null;
          if (pendingRef.current.length >= tool.pointCount) finishPending();
          return;
        }
        pendingRef.current = [...pendingRef.current, point];
        setPendingCount(pendingRef.current.length);
        return;
      }
      const points = [...pendingRef.current, point];
      if (points.length < tool.pointCount) {
        pendingRef.current = points;
        setPendingCount(points.length);
        return;
      }
      pendingRef.current = [];
      setPendingCount(0);
      layerRef.current?.setPreview(null);
      finish(tool, points, { x, y });
    };
    const releasePress = () => {
      press = null;
      chart.applyOptions({ handleScroll: true });
    };

    /** 획 끝에서 멈춰 직선으로 맞춘 두 끝점 (다시 움직이면 풀림) */
    let held: [{ x: number; y: number }, { x: number; y: number }] | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    const clearHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
    };

    /** 직선으로 바꿀 때 쓸 툴: 브러시 → 추세선(끝점을 끌어 고칠 수 있음), 형광펜 → 곧은 형광펜 */
    const straightToolOf = (tool: DrawingTool) => (tool.id === "brush" ? getTool("trendline") : tool);
    /** 화면 좌표 두 점 → 차트 좌표 (차트 칸 안으로 살짝 당겨서) */
    const endpointsToPoints = (ends: [{ x: number; y: number }, { x: number; y: number }]) => {
      const w = chart.paneSize().width - 1;
      const h = chart.paneSize(0).height - 1;
      const pts = ends.map((p) => pointAt(Math.min(Math.max(p.x, 0), w), Math.min(Math.max(p.y, 0), h)));
      return pts[0] && pts[1] ? [pts[0], pts[1]] : null;
    };
    const previewStraight = (tool: DrawingTool, ends: [{ x: number; y: number }, { x: number; y: number }]) => {
      const target = straightToolOf(tool);
      const points = endpointsToPoints(ends);
      if (!target || !points) return false;
      layerRef.current?.setPreview({ id: "preview", toolId: target.id, schemaVersion: target.schemaVersion, points, style: DRAW_STYLE });
      return true;
    };

    /** 지우개: 누른 동안 지운 결과 (놓을 때 실행 취소 기록 한 번) */
    let erasing: { before: Drawing[]; changed: boolean } | null = null;
    const ERASE_PX = 10;
    /**
     * 지우개 원(반지름 ERASE_PX) 안에 든 잉크만 지움. 선분이 원을 지나가면 원 가장자리에서 정확히 끊어
     * 원 밖 부분은 그대로 남기고, 가운데를 지우면 두 획으로 나눔
     */
    const eraseAt = (x: number, y: number) => {
      const layer = layerRef.current;
      if (!layer || !erasing) return;
      const R = ERASE_PX;
      const inside = (p: { x: number; y: number }) => Math.hypot(p.x - x, p.y - y) < R;
      /** 선분 a→b 중 원 안에 드는 구간 [t1, t2] (없으면 null) */
      const cut = (a: { x: number; y: number }, b: { x: number; y: number }): [number, number] | null => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const fx = a.x - x;
        const fy = a.y - y;
        const A = dx * dx + dy * dy;
        if (!A) return inside(a) ? [0, 1] : null;
        const B = 2 * (fx * dx + fy * dy);
        const C = fx * fx + fy * fy - R * R;
        const disc = B * B - 4 * A * C;
        if (disc <= 0) return null;
        const sq = Math.sqrt(disc);
        const t1 = Math.max(0, (-B - sq) / (2 * A));
        const t2 = Math.min(1, (-B + sq) / (2 * A));
        return t1 < t2 ? [t1, t2] : null;
      };
      const at = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => pointAtExact(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      let changed = false;
      const next: Drawing[] = [];
      for (const d of drawingsRef.current) {
        const px = INK_TOOLS.has(d.toolId) ? layer.toPixels(d) : null;
        if (!px || !px.some((p, k) => inside(p) || (k > 0 && cut(px[k - 1], p)))) {
          next.push(d);
          continue;
        }
        changed = true;
        const runs: DrawingPoint[][] = [];
        let run: DrawingPoint[] = inside(px[0]) ? [] : [d.points[0]];
        for (let k = 1; k < px.length; k++) {
          const c = cut(px[k - 1], px[k]);
          if (!c) {
            if (run.length || !inside(px[k])) run.push(d.points[k]);
            continue;
          }
          const [t1, t2] = c;
          if (t1 > 0) {
            const e = at(px[k - 1], px[k], t1);
            if (e) run.push(e);
          }
          if (run.length >= 2) runs.push(run);
          run = [];
          if (t2 < 1) {
            const s0 = at(px[k - 1], px[k], t2);
            run = s0 ? [s0, d.points[k]] : [d.points[k]];
          }
        }
        if (run.length >= 2) runs.push(run);
        runs.forEach((r, k) => next.push({ ...d, id: k === 0 ? d.id : uuid(), points: r }));
      }
      if (!changed) return;
      erasing.changed = true;
      apply(next);
    };

    const handlePointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
      const tool = currentTool();
      if (!tool || event.button !== 0) return;
      if (tool.id === "eraser") {
        const { x, y } = localXY(event);
        erasing = { before: drawingsRef.current, changed: false };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        try {
          container.setPointerCapture(event.pointerId);
        } catch {
          // 포인터가 이미 사라진 경우
        }
        eraseAt(x, y);
        return;
      }
      // 드로잉을 고른 채로 빈 곳을 누르면: 고른 것만 풀고 새로 그리지 않음 (다음 누름부터 그림)
      if (layerRef.current?.selected() && pendingRef.current.length === 0) {
        selectDrawing(null);
        return;
      }
      if (tool.mode !== "free") {
        // 점 찍는 도구: 누른 자리를 기억하고, 누르는 동안 차트가 움직이지 않게 (손떨림으로 클릭이 끌기가 되어 점이 안 찍히던 것)
        //   예전엔 스마트 그리기를 끄면 브라우저 click 에서 찍었는데, 조금만 움직여도 차트가 끌려 클릭이 사라졌다
        const { x, y } = localXY(event);
        const point = pointAt(x, y);
        if (!point) return;
        if (layerRef.current?.selected()) selectDrawing(null); // 새로 그리기 시작하면 고른 드로잉은 풀기
        press = { x, y, point, dragging: false };
        // 스마트 꺼짐(원래 방식): 끌면 차트가 움직이고 점은 안 찍힘 → 차트를 잠그지 않음
        if (!smartRef.current) return;
        chart.applyOptions({ handleScroll: false });
        try {
          container.setPointerCapture(event.pointerId);
        } catch {
          // 포인터가 이미 사라진 경우
        }
        return;
      }
      const { x, y } = localXY(event);
      const point = tool.id === "pen" ? pointAtExact(x, y) : pointAt(x, y);
      if (!point) return;
      stroke = [point];
      strokeXY = [{ x, y }];
      lastXY = { x, y };
      held = null;
      clearHold();
      try {
        container.setPointerCapture(event.pointerId); // 차트 밖으로 끌어도 끝까지 받게
      } catch {
        // 포인터가 이미 사라진 경우 (캡처 없이 진행)
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      const tool = currentTool();
      if (erasing) {
        const { x, y } = localXY(event);
        eraseAt(x, y);
        return;
      }
      if (press && tool && tool.mode !== "free") {
        // 누른 채 끌기: 첫 점에서 커서까지 미리 보기 (놓으면 그 자리가 끝점)
        const { x, y } = localXY(event);
        if (!smartRef.current) {
          // 원래 방식: 조금이라도 끌면 차트 이동 (점 안 찍음)
          if (Math.hypot(x - press.x, y - press.y) > PLAIN_CLICK_SLOP) press = null;
          return;
        }
        if (!press.dragging && Math.hypot(x - press.x, y - press.y) <= CLICK_SLOP) return;
        if (pendingRef.current.length > 0 || tool.pointCount < 2 || tool.mode === "multi") return;
        press.dragging = true;
        const point = pointAt(x, y);
        if (point) layerRef.current?.setPreview({ id: "preview", toolId: tool.id, schemaVersion: tool.schemaVersion, points: [press.point, point], style: DRAW_STYLE });
        return;
      }
      if (!stroke || !tool) return;
      const { x, y } = localXY(event);
      // 펜은 손그림 그대로 남기려고 더 촘촘히 (뾰족한 꺾임이 뭉개지지 않게)
      const exact = tool.id === "pen";
      if (lastXY && Math.hypot(x - lastXY.x, y - lastXY.y) < (exact ? 1.5 : 3)) return;
      const point = exact ? pointAtExact(x, y) : pointAt(x, y);
      if (!point) return;
      stroke.push(point);
      strokeXY.push({ x, y });
      lastXY = { x, y };
      held = null; // 멈춰서 맞춘 뒤 다시 움직이면 손그림으로 돌아감
      layerRef.current?.setPreview({ id: "preview", toolId: tool.id, schemaVersion: tool.schemaVersion, points: stroke, style: DRAW_STYLE });
      // 끝에서 잠깐 멈추면 직선으로 맞춰 미리 보여 준다
      clearHold();
      if (smartRef.current && !exact) {
        holdTimer = setTimeout(() => {
          const t = currentTool();
          if (!stroke || !t) return;
          const ends = straightenStroke(strokeXY, "hold");
          if (ends && previewStraight(t, ends)) held = ends;
        }, HOLD_SNAP_MS);
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      const tool = currentTool();
      clearHold();
      if (erasing) {
        const e = erasing;
        erasing = null;
        chart.applyOptions({ handleScroll: true, handleScale: true });
        if (e.changed) {
          // 문지른 한 번 = 실행 취소 한 번
          setPast((p) => [...p, e.before]);
          setFuture([]);
        }
        return;
      }
      if (press) {
        const p = press;
        releasePress();
        if (!tool || tool.mode === "free") return;
        if (p.dragging) {
          // 누른 채 끌어서 놓음: 누른 자리 → 놓은 자리
          const { x, y } = localXY(event);
          const end = pointAt(Math.min(Math.max(x, 0), chart.paneSize().width - 1), Math.min(Math.max(y, 0), chart.paneSize(0).height - 1));
          layerRef.current?.setPreview(null);
          if (!end) return;
          placePoint(tool, p.point, p.x, p.y);
          placePoint(tool, end, x, y);
          return;
        }
        // 클릭 (조금 흔들려도): 누른 자리에 점
        placePoint(tool, p.point, p.x, p.y);
        return;
      }
      if (!stroke || !tool) return;
      // 거의 곧은 획(또는 끝에서 멈춰 맞춘 획)은 직선 두 점으로
      // 펜은 직선으로 바꾸지 않음
      const ends = smartRef.current && tool.id !== "pen" ? (held ?? straightenStroke(strokeXY, "auto")) : null;
      const straightTool = ends ? straightToolOf(tool) : undefined;
      const straightPoints = ends ? endpointsToPoints(ends) : null;
      // 붓질 한 번 = 드로잉 하나. 모양은 그대로 두고 거의 일직선인 중간 점만 덜어 낸다 (저장·AI 정리 크기 줄이기)
      const keep = simplifyIndexes(strokeXY, tool.id === "pen" ? 0.6 : 1.5);
      const points = keep.map((i) => stroke![i]);
      stroke = null;
      strokeXY = [];
      lastXY = null;
      held = null;
      layerRef.current?.setPreview(null);
      if (straightTool && straightPoints) finish(straightTool, straightPoints);
      else if (points.length >= 2) finish(tool, points);
    };

    const handleClick = (event: MouseEvent) => {
      if (!down || Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y) > 5) {
        skipClick = false; // 끌기로 끝난 누름은 다음 클릭에 영향 없게
        return;
      }
      const { x, y } = localXY(event);
      const point = pointAt(x, y);
      if (!point) return;
      if (noteModeRef.current) {
        setNoteDraft({ x, y, time: point.time, price: currencyRef.current === "USD" ? roundPx(Number(point.price), "USD") : Math.round(Number(point.price) / 100) * 100 });
        setNoteInput("");
        return;
      }
      const tool = currentTool();
      if (!tool) {
        // 툴 없이 빈 곳을 누르면 선택 해제
        if (skipClick) skipClick = false;
        else selectDrawing(layerRef.current?.drawingAt(x, y) ?? null);
        return;
      }
      if (tool.mode === "free") return;
      // 점은 누름 · 놓음(handlePointerDown/Up)에서 찍는다 (손떨림 · 끌기에도 안 사라지게)
    };

    const handleMove = (param: MouseEventParams<Time>) => {
      const data = param.seriesData.get(candle) as CandlestickData<Time> | undefined;
      setHovered(data ? barAt(barsRef.current, data.time as number) : null);
      refreshPaneLegends(param.point ? param.seriesData : undefined);

      const tool = currentTool();
      const point = param.point ? pointAt(param.point.x, param.point.y) : null;
      if (!tool || tool.mode === "free" || !point || pendingRef.current.length === 0) return;
      layerRef.current?.setPreview({ id: "preview", toolId: tool.id, schemaVersion: tool.schemaVersion, points: [...pendingRef.current, point], style: DRAW_STYLE });
    };

    // Shift + 클릭 → 마우스까지 등락 · 봉 수 · 기간 (트레이딩뷰처럼). 다시 클릭하면 고정, 한 번 더 누르거나 Esc 면 지움
    const measureOf = (start: DrawingPoint, end: DrawingPoint): Drawing => ({ id: "measure", toolId: "quick-measure", schemaVersion: 1, points: [start, end], style: DRAW_STYLE });
    const endMeasure = () => {
      measureRef.current = null;
      layerRef.current?.setPreview(null);
      chart.applyOptions({ handleScroll: true, handleScale: true });
    };
    const handleMeasureDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const m = measureRef.current;
      if (m) {
        event.stopImmediatePropagation();
        skipClick = true;
        if (!m.fixed) {
          m.fixed = true;
          chart.applyOptions({ handleScroll: true, handleScale: true });
        } else endMeasure();
        return;
      }
      if (!event.shiftKey || pendingRef.current.length) return;
      const { x, y } = localXY(event);
      const p = pointAt(x, y);
      if (!p) return;
      event.stopImmediatePropagation();
      skipClick = true;
      measureRef.current = { start: p, fixed: false, x, y };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      layerRef.current?.setPreview(measureOf(p, p));
    };
    const handleMeasureMove = (event: PointerEvent) => {
      const m = measureRef.current;
      if (!m || m.fixed) return;
      const { x, y } = localXY(event);
      const p = pointAt(Math.min(x, chart.paneSize().width - 1), Math.min(y, chart.paneSize(0).height - 1));
      if (p) layerRef.current?.setPreview(measureOf(m.start, p));
    };
    // Shift 를 누른 채 끌었다 놓아도 그 자리에서 고정
    const handleMeasureUp = (event: PointerEvent) => {
      const m = measureRef.current;
      if (!m || m.fixed) return;
      const { x, y } = localXY(event);
      if (Math.hypot(x - m.x, y - m.y) > CLICK_SLOP) {
        m.fixed = true;
        chart.applyOptions({ handleScroll: true, handleScale: true });
      }
    };
    container.addEventListener("pointerdown", handleMeasureDown, true);
    container.addEventListener("pointermove", handleMeasureMove);
    container.addEventListener("pointerup", handleMeasureUp);
    container.addEventListener("pointerdown", handleCaptureDown, true);
    container.addEventListener("mousedown", blockWhileDragging, true);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointermove", handleDragMove);
    container.addEventListener("pointermove", handleHover);
    container.addEventListener("pointerleave", handleLeave);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointerup", handleDragUp);
    // 펜을 화면 밖으로 들어 올리는 등 누름이 취소되면 차트 이동을 되살린다
    const handleCancel = () => {
      if (press) {
        releasePress();
        layerRef.current?.setPreview(null);
      }
    };
    container.addEventListener("pointercancel", handleCancel);
    container.addEventListener("click", handleClick);
    chart.subscribeCrosshairMove(handleMove);
    return () => {
      container.removeEventListener("pointerdown", handleMeasureDown, true);
      container.removeEventListener("pointermove", handleMeasureMove);
      container.removeEventListener("pointerup", handleMeasureUp);
      container.removeEventListener("pointerdown", handleCaptureDown, true);
      container.removeEventListener("mousedown", blockWhileDragging, true);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointermove", handleDragMove);
      container.removeEventListener("pointermove", handleHover);
      container.removeEventListener("pointerleave", handleLeave);
      container.removeEventListener("pointerup", handlePointerUp);
      clearHold();
      container.removeEventListener("pointerup", handleDragUp);
      container.removeEventListener("pointercancel", handleCancel);
      container.removeEventListener("click", handleClick);
      chart.unsubscribeCrosshairMove(handleMove);
    };
    // commit은 ref만 쓰므로 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  // Esc: 그리던 것 취소
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      if (event.key === "Enter" && !typing) {
        finishPending();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !typing && layerRef.current?.selected()) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key !== "Escape") return;
      if (measureRef.current) {
        measureRef.current = null;
        chartRef.current?.applyOptions({ handleScroll: true, handleScale: true });
      }
      setTextDraft(null);
      selectDrawing(null);
      pendingRef.current = [];
      layerRef.current?.setPreview(null);
      selectTool(null);
      setNoteDraft(null);
      toggleNoteMode(false);
      setNews(null);
      setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // selectTool·toggleNoteMode는 ref와 setter만 쓰므로 한 번만 등록한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 전체 화면: 차트 영역(이 section)만 화면을 채운다
  // 전체화면 동안 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  // 지표 목록은 바꿀 때만 저장 (실시간 봉마다 쓰면 다른 탭의 선택을 덮어쓴다)
  useEffect(() => {
    localStorage.setItem(userStorageKey(INDICATOR_STORE), JSON.stringify(instances));
  }, [instances]);

  // 수급 데이터: 수급 지표를 켜고 일봉일 때만 (백엔드가 하루 캐시)
  useEffect(() => {
    if (!needsFlows || flows?.code === symbolCode) return;
    const ac = new AbortController();
    fetchFlows(symbolCode, ac.signal)
      .then((data) => setFlows({ code: symbolCode, map: new Map(data.items.map((d) => [d.time, d])) }))
      .catch(() => {
        // 못 받으면 수급 지표는 빈 창으로 남는다
      });
    return () => ac.abort();
  }, [needsFlows, flows?.code, symbolCode]);

  // 지표 그리기: 정의(lib/indicators)대로 시리즈를 만들고, 봉이 바뀌면 다시 계산
  //   실시간 체결로 마지막 봉만 바뀐 경우엔 끝 몇 칸만 update (전체 setData 는 종목·간격·설정이 바뀔 때만)
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;
    const map = indSeriesRef.current;
    // 수급 지표는 일별 데이터라 일봉에서만 그린다
    const shown = visibleIndicators(instances, interval, fullscreen);
    const ext = flows?.code === symbolCode ? { flows: flows.map } : undefined;
    const prevShown = indShownRef.current;
    // 수급 데이터가 새로 오면 처음부터 다시 그린다 (끝부분만 고치면 과거 값이 비어 있음)
    const live = prevShown !== null && prevShown.key === dataKey && prevShown.flows === ext?.flows && bars.length >= prevShown.len && bars.length - prevShown.len <= 60;
    // 실시간 체결만 바뀐 경우(지표 설정·표시 그대로)는 1초에 한 번만 다시 계산. 건너뛴 틱은 끝에 한 번 몰아서 반영
    const throttle = indLiveRef.current;
    const sameSet = throttle.instances === instances && shown.every((i) => map.has(i.uid)) && map.size === shown.length;
    if (live && sameSet) {
      const wait = IND_LIVE_MS - (Date.now() - throttle.at);
      if (wait > 0) {
        throttle.timer ??= setTimeout(() => {
          throttle.timer = null;
          setIndTick((t) => t + 1);
        }, wait);
        return;
      }
    }
    if (throttle.timer) clearTimeout(throttle.timer);
    throttle.timer = null;
    throttle.at = Date.now();
    throttle.instances = instances;
    indShownRef.current = { key: dataKey, len: bars.length, flows: ext?.flows };

    // 내려놓거나 숨긴 지표 지우기 (빈 보조 창은 라이브러리가 지운다)
    for (const [uid, series] of map) {
      if (shown.some((i) => i.uid === uid)) continue;
      series.forEach((sr) => chart.removeSeries(sr));
      map.delete(uid);
    }

    const make = (o: OutputDef, color: string, pane: number, scaleId: string | undefined, overlay = false) => {
      const format = { type: "custom" as const, minMove: 0.01, formatter: scaleId ? fmtVolume : fmtIndicator };
      const base = {
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: format,
        ...(scaleId ? { priceScaleId: scaleId } : {}),
        // 캔들 위에 겹치는 지표는 가격 범위 계산에서 빼서, 먼 이동평균 때문에 캔들이 납작해지지 않게
        ...(overlay ? { autoscaleInfoProvider: () => null } : {}),
      };
      if (o.kind === "histogram") return chart.addSeries(HistogramSeries, { ...base, color }, pane) as ISeriesApi<SeriesType>;
      if (o.kind === "dots")
        return chart.addSeries(LineSeries, { ...base, color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.6, crosshairMarkerVisible: false }, pane) as ISeriesApi<SeriesType>;
      return chart.addSeries(LineSeries, { ...base, color, lineWidth: 1, lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid, crosshairMarkerVisible: false }, pane) as ISeriesApi<SeriesType>;
    };

    let hasVolume = false;
    for (const inst of shown) {
      const def = getIndicator(inst.id)!;
      const colors = def.outputs.map((o, k) => inst.colors?.[k] ?? o.color);
      const scaleId = def.placement === "volume" ? `vol-${inst.uid}` : undefined;
      if (def.placement === "volume") hasVolume = true;
      let series = map.get(inst.uid);
      const fresh = !series;
      if (!series) {
        const pane = def.placement === "separate" ? chart.panes().length : 0;
        series = def.outputs.map((o, k) => make(o, colors[k], pane, scaleId, def.placement === "overlay"));
        if (scaleId) chart.priceScale(scaleId, 0).applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        for (const level of def.levels ?? []) series[series.length - 1].createPriceLine({ price: level, color: "#ced4da", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        map.set(inst.uid, series);
      } else
        series.forEach((sr, k) => {
          if (def.outputs[k].kind !== "histogram" || !def.outputs[k].colorBy) sr.applyOptions({ color: colors[k] });
        });

      const params = Object.fromEntries(def.params.map((pd) => [pd.key, inst.params[pd.key] ?? pd.default]));
      const out = def.compute(bars, params, ext);
      def.outputs.forEach((o, k) => {
        const values = out[o.key] ?? [];
        const item = (i: number) => {
          const v = values[i];
          if (v === null || v === undefined || !Number.isFinite(v)) return null;
          const time = toChartTime(bars[i].time);
          if (o.kind !== "histogram") return { time, value: v };
          const up = o.colorBy === "candle" ? bars[i].close >= bars[i].open : v >= 0;
          return { time, value: v, color: o.colorBy ? (up ? UP_BAR : DOWN_BAR) : colors[k] };
        };
        const sr = series![k];
        let updated = false;
        if (live && !fresh) {
          try {
            for (let i = Math.max(0, prevShown!.len - 1); i < bars.length; i++) {
              const it = item(i);
              if (it) sr.update(it);
            }
            updated = true;
          } catch {
            // 순서가 어긋났으면 전체 교체
          }
        }
        if (!updated) {
          const data = [];
          for (let i = 0; i < bars.length; i++) {
            const it = item(i);
            if (it) data.push(it);
          }
          sr.setData(data);
        }
      });
    }

    // 거래량이 있으면 캔들을 위로 올려 자리를 비운다. 창 높이 비율: 메인 3 : 보조 창 1씩
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: hasVolume ? 0.24 : 0.06 } });
    // 창 높이 비율: 평소엔 640px 안에서 보조 창 약 100px 씩·가격 창이 나머지, 전체화면은 창 높이 기준
    const ratio = mainPaneRatio(chart.panes().length - 1, fullscreen ? window.innerHeight : undefined);
    chart.panes().forEach((pane, i) => pane.setStretchFactor(i === 0 ? ratio : 1));
    // 차트가 새 창을 그린 뒤(라이브러리도 다음 프레임에 그림) 범례 위치·값 갱신
    const timer = setTimeout(() => refreshPaneLegends(), 80);
    return () => clearTimeout(timer);
  }, [bars, instances, dataKey, interval, flows, symbolCode, fullscreen, indTick]);

  /** 보조 창 범례: 창 위치(px)와 선별 값. 십자선이 있으면 그 봉 값, 없으면 마지막 값 */
  function refreshPaneLegends(values?: Map<ISeriesApi<SeriesType>, unknown>) {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;
    const top0 = container.getBoundingClientRect().top;
    const next: PaneLegend[] = [];
    for (const inst of instancesRef.current) {
      const def = getIndicator(inst.id);
      const series = indSeriesRef.current.get(inst.uid);
      if (!def || def.placement !== "separate" || !series?.length) continue;
      // 창을 지우는 중(전체화면 끝내기 등)이면 시리즈의 창이 이미 없을 수 있다 → 건너뜀
      let el: HTMLElement | null = null;
      try {
        el = series[0].getPane().getHTMLElement();
      } catch {
        el = null;
      }
      if (!el) continue;
      const colors = def.outputs.map((o, k) => inst.colors?.[k] ?? o.color);
      next.push({
        uid: inst.uid,
        top: el.getBoundingClientRect().top - top0,
        name: instanceLabel(def, inst.params),
        items: def.outputs.map((o, k) => {
          const hit = values?.get(series[k]) as { value?: number } | undefined;
          let v = hit?.value;
          if (v === undefined) {
            try {
              // data() 는 전체 배열을 복사하므로 마지막 한 점만 꺼낸다 (마우스를 움직일 때마다 불림)
              v = (series[k].dataByIndex(Number.MAX_SAFE_INTEGER, MismatchDirection.NearestLeft) as { value?: number } | null)?.value;
            } catch {
              v = undefined; // 지워지는 중인 시리즈
            }
          }
          return { label: def.outputs.length > 1 ? o.label : "", color: o.colorBy ? "#868e96" : colors[k], value: v === undefined ? "–" : fmtIndicator(v) };
        }),
      });
    }
    // 값·위치가 그대로면 상태를 바꾸지 않는다 (십자선이 움직일 때마다 차트 전체가 다시 렌더되지 않게)
    const sig = JSON.stringify(next);
    if (sig === paneLegendSigRef.current) return;
    paneLegendSigRef.current = sig;
    setPaneLegends(next);
  }

  function addIndicator(id: string) {
    const def = getIndicator(id);
    if (!def) return;
    const params = Object.fromEntries(def.params.map((p) => [p.key, p.default]));
    // 기본 묶음이 있는 지표(이동평균 5·20·60·120)는 처음 추가할 때 묶음째 올린다
    if (def.presets?.length && !instances.some((i) => i.id === id)) {
      setInstances((list) => [
        ...list,
        ...def.presets!.map((pr) => ({ uid: uuid(), id, params: { ...params, ...pr.params }, visible: true, colors: [pr.color, ...def.outputs.slice(1).map((o) => o.color)] })),
      ]);
      return;
    }
    // 같은 지표를 또 올리면 첫 선 색을 바꿔 구분
    const same = instances.filter((i) => i.id === id);
    const used = new Set(same.map((i) => i.colors?.[0] ?? def.outputs[0].color));
    const colors = same.length && def.outputs.length === 1 ? [INSTANCE_PALETTE.find((c) => !used.has(c)) ?? INSTANCE_PALETTE[same.length % INSTANCE_PALETTE.length]] : undefined;
    setInstances((list) => [...list, { uid: uuid(), id, params, visible: true, ...(colors ? { colors } : {}) }]);
  }

  // 저장본 드로잉 불러오기 (종목·일지가 바뀔 때)
  const loadedKey = loadedDrawings?.key;
  const [appliedKey, setAppliedKey] = useState<string | undefined>(undefined);
  if (loadedDrawings && loadedKey !== appliedKey) {
    // 렌더 중 상태 맞추기 (key가 바뀐 그 렌더에서 한 번)
    setAppliedKey(loadedKey);
    setDrawings(loadedDrawings.drawings);
    setPast([]);
    setFuture([]);
  }
  useEffect(() => {
    if (!loadedDrawings) return;
    drawingsRef.current = loadedDrawings.drawings;
    layerRef.current?.setDrawings(loadedDrawings.drawings);
    onDrawingsChange?.(loadedDrawings.drawings);
    // key가 바뀔 때만 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  // 주기가 바뀌거나 '모두 감추기'를 누르면 보이는 드로잉을 다시 정함
  useEffect(() => {
    layerRef.current?.setVisibility(interval, drawPrefs.hideAll);
  }, [interval, drawPrefs.hideAll]);

  // 얼러트를 건 선을 옮기면 얼러트의 선도 따라 바꾸고, 선을 지우면 얼러트도 끔 (0.8초 모아서 한 번)
  useEffect(() => {
    // 이 화면에서 본 적 있는 드로잉만 '지웠다'고 봄 (저장 안 된 선 · 아직 안 불러온 선의 얼러트를 잘못 끄지 않게)
    for (const d of drawings) seenDrawingIds.current.add(d.id);
    const mine = alerts.filter((a) => a.status === "ACTIVE" && a.symbol === symbolCode && a.drawingId);
    if (!mine.length) return;
    const timer = setTimeout(() => {
      for (const a of mine) {
        const d = drawings.find((x) => x.id === a.drawingId);
        const line = d ? alertLineOf(d) : null;
        if (!d) {
          if (seenDrawingIds.current.has(a.drawingId!)) void removeAlert(a.id).catch(() => {});
        } else if (!line) void removeAlert(a.id).catch(() => {});
        else if (!sameLine(line, a.line)) void putAlert({ symbol: a.symbol, quoteCode: a.quoteCode, symbolName: a.symbolName, drawingId: d.id, label: a.label, line }).catch(() => {});
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [alerts, drawings, symbolCode]);

  /** 고른 선에 얼러트 넣기 · 끄기 */
  async function toggleAlert(d: Drawing) {
    const on = alerts.find((a) => a.status === "ACTIVE" && a.drawingId === d.id);
    const line = alertLineOf(d);
    try {
      if (on) {
        await removeAlert(on.id);
        setAlertMsg("얼러트를 껐어요");
      } else if (line) {
        await putAlert({ symbol: symbolCode, quoteCode: quoteCode ?? symbolCode, symbolName, drawingId: d.id, label: getTool(d.toolId)?.label ?? "추세선", line });
        setAlertMsg("얼러트를 넣었어요. 현재가가 이 선에 닿으면 종 알림으로 알려 드려요");
      }
    } catch (e) {
      setAlertMsg(errorMessage(e));
    }
    setEditMenu(null);
    setTimeout(() => setAlertMsg(null), 3500);
  }

  function apply(next: Drawing[]) {
    drawingsRef.current = next;
    setDrawings(next);
    layerRef.current?.setDrawings(next);
    onDrawingsChangeRef.current?.(next); // 위 클릭 연결은 종목이 바뀔 때만 다시 하므로 최신 콜백을 ref 로
  }

  function commit(next: Drawing[]) {
    // 바꾸기 전 상태를 지금 잡아 둔다. setPast 안에서 drawingsRef 를 읽으면 React 가 나중에(apply 뒤에) 계산해
    // "바꾼 뒤" 상태가 쌓이고, 되돌리기가 한 칸씩 밀려 맨 처음 그린 드로잉이 안 지워졌다
    const prev = drawingsRef.current;
    setPast((p) => [...p, prev]);
    setFuture([]);
    apply(next);
  }

  // 저장 확인 창용 차트 그림
  //   그은 선이 모두 들어가게 잠깐 시간 · 가격 범위를 드로잉에 맞춰 넓혀 찍고 원래대로 되돌림
  //   드로잉 층은 위 캔버스라 addTopLayer 로 같이 찍음 (십자선은 빼고), 선 가격마다 지지 · 저항 라벨을 얹음
  useEffect(() => {
    registerSnapshot?.(async (marks, range) => {
      const chart = chartRef.current;
      const series = candleRef.current;
      const host = containerRef.current;
      const layer = layerRef.current;
      if (!chart || !series || !host) return null;
      const ts = chart.timeScale();
      const prevRange = ts.getVisibleLogicalRange();
      const pts = drawingsRef.current.flatMap((d) => d.points);
      const prices = [...pts.map((p) => Number(p.price)), ...marks.map((m) => m.price)].filter((n) => Number.isFinite(n) && n > 0);
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      // 구간은 '봉 번호'(이 종목 봉 배열의 순서)로 주고받고, 차트에는 그 봉의 시각으로 맞춤 (2026-11-22)
      //   차트의 논리 번호는 지표 · 겹치기 선 같은 다른 시리즈 시각까지 합친 번호라, 그대로 쓰면 캔들이 없는 구간이 보였음
      const list = barsRef.current ?? [];
      const last = Math.max(0, list.length - 1);
      /** 그 시각이 들어간 봉 번호 (첫 봉보다 이르면 0, 마지막 봉보다 늦으면 마지막) */
      const idxAt = (t: number) => {
        let lo = 0;
        let hi = last;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (list[mid].time <= t) lo = mid;
          else hi = mid - 1;
        }
        return lo;
      };
      // 보일 구간: 고른 구간, 없으면 드로잉 전체(앞뒤 3봉) — 드로잉이 없으면 보던 화면
      let shown = range ? { from: Math.max(0, Math.min(last, range.from)), to: Math.max(0, Math.min(last, range.to)) } : null;
      if (!shown && pts.length && list.length) {
        const times = pts.map((p) => Number(p.time)).filter((n) => Number.isFinite(n));
        if (times.length) shown = { from: Math.max(0, idxAt(Math.min(...times)) - 3), to: Math.min(last, idxAt(Math.max(...times)) + 3) };
      }
      if (!shown) {
        const vr = ts.getVisibleRange();
        shown = vr ? { from: idxAt(Number(vr.from)), to: idxAt(Number(vr.to)) } : { from: Math.max(0, last - 60), to: last };
      }
      if (shown.to <= shown.from) shown = { from: Math.max(0, shown.to - 1), to: Math.max(shown.to, 1) };
      // 찍는 동안 뒤의 차트가 확대 · 이동돼 보이지 않게 지금 모습을 그림으로 덮어 둠 (2026-11-22)
      let freeze: HTMLImageElement | null = null;
      try {
        freeze = document.createElement("img");
        freeze.src = chart.takeScreenshot(true, true).toDataURL("image/png");
        freeze.alt = "";
        Object.assign(freeze.style, { position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: "5", pointerEvents: "none" });
        host.parentElement?.appendChild(freeze);
      } catch {
        freeze = null;
      }
      try {
        if (list.length) ts.setVisibleRange({ from: list[shown.from].time as Time, to: list[Math.min(last, shown.to)].time as Time });
        if (prices.length) {
          const lo = Math.min(...prices);
          const hi = Math.max(...prices);
          series.applyOptions({
            autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
              const r = base();
              return { priceRange: { minValue: Math.min(r?.priceRange?.minValue ?? lo, lo), maxValue: Math.max(r?.priceRange?.maxValue ?? hi, hi) } };
            },
          });
        }
        await frame();
        // 지지 · 저항 표시는 차트의 가격축 태그(평단가처럼)가 그림에 그대로 찍힘 — 예전에 덧그리던 동그란 라벨은 겹쳐서 뺌 (2026-11-22)
        const shot = chart.takeScreenshot(true, false);
        return { image: shot.toDataURL("image/png"), from: shown.from, to: shown.to };
      } catch {
        return null;
      } finally {
        // 보던 화면 그대로 되돌림 (되돌린 뒤 덮개를 걷음)
        series.applyOptions({ autoscaleInfoProvider: undefined });
        if (prevRange) ts.setVisibleLogicalRange(prevRange);
        if (freeze) {
          const cover = freeze;
          requestAnimationFrame(() => requestAnimationFrame(() => cover.remove()));
        }
      }
    });
  });

  // 차트 노트 선 목록에서 지우기 → 되돌리기(↶)로 살릴 수 있게 commit
  useEffect(() => {
    registerRemove?.((ids) => {
      const next = drawingsRef.current.filter((d) => !ids.includes(d.id));
      if (next.length !== drawingsRef.current.length) commit(next);
    });
  });

  useEffect(() => {
    registerAdd?.((list) => {
      if (list.length) commit([...drawingsRef.current, ...list]);
    });
  });

  function undo() {
    if (past.length === 0) return;
    const cur = drawingsRef.current;
    setFuture((f) => [cur, ...f]);
    apply(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }

  function redo() {
    if (future.length === 0) return;
    const prev = drawingsRef.current; // commit 과 같은 이유로 미리 잡아 둔다
    setPast((p) => [...p, prev]);
    apply(future[0]);
    setFuture((f) => f.slice(1));
  }

  function toggleNoteMode(on: boolean) {
    noteModeRef.current = on;
    setNoteMode(on);
    if (!on) setNoteDraft(null);
  }

  function saveNote() {
    if (!noteDraft || !noteInput.trim()) return;
    onAddNote({ time: noteDraft.time, price: noteDraft.price, text: noteInput.trim() });
    setNoteDraft(null);
    setNoteInput("");
    toggleNoteMode(false);
  }

  function selectDrawing(id: string | null) {
    setSelectedId(id);
    setEditMenu(null);
    setMoreSub(null);
    layerRef.current?.setSelected(id);
  }

  function updateSelected(patch: Partial<Drawing>) {
    const id = layerRef.current?.selected();
    if (!id) return;
    commit(drawingsRef.current.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  /** 보는 차례: 겹친 드로잉 가운데 무엇을 위에 그릴지 (목록 뒤쪽이 위) */
  function reorderSelected(to: "front" | "forward" | "backward" | "back") {
    const list = drawingsRef.current;
    const i = list.findIndex((d) => d.id === layerRef.current?.selected());
    if (i < 0) return;
    const j = to === "front" ? list.length - 1 : to === "back" ? 0 : Math.min(list.length - 1, Math.max(0, i + (to === "forward" ? 1 : -1)));
    if (i === j) return;
    const next = [...list];
    const [d] = next.splice(i, 1);
    next.splice(j, 0, d);
    commit(next);
  }

  /** 드로잉 하나 고치기 (객체 트리에서 고르지 않은 것도) */
  function updateDrawing(id: string, patch: Partial<Drawing>) {
    commit(drawingsRef.current.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    // 감춘 드로잉은 고른 상태로 두지 않음 (안 보이는 걸 옮기지 않게)
    if (patch.hidden && layerRef.current?.selected() === id) selectDrawing(null);
  }

  function removeDrawing(id: string) {
    commit(drawingsRef.current.filter((d) => d.id !== id));
    if (layerRef.current?.selected() === id) selectDrawing(null);
  }

  /** 인터벌 가시성: 고른 드로잉이 보일 주기 (null = 모든 주기) */
  function setSelectedIntervals(intervals: string[] | null) {
    updateSelected({ intervals: intervals?.length ? intervals : undefined });
  }

  function deleteSelected() {
    const id = layerRef.current?.selected();
    if (!id) return;
    commit(drawingsRef.current.filter((d) => d.id !== id));
    selectDrawing(null);
    setOpenGroup(null);
  }

  function duplicateSelected() {
    const d = drawingsRef.current.find((it) => it.id === layerRef.current?.selected());
    const layer = layerRef.current;
    if (!d || !layer) return;
    // 오른쪽 아래로 조금 비켜서 복사
    const points = d.points.map((p) => {
      const x = layer.timeToX(p.time);
      const y = layer.priceToY(Number(p.price));
      const t = x === null ? null : layer.xToTime(x + 24);
      const pr = y === null ? null : layer.yToPrice(y + 18);
      return t === null || pr === null ? p : { time: t, price: String(Math.round(pr)) };
    });
    const copy = { ...d, id: uuid(), points, locked: undefined }; // 복제본은 잠그지 않은 채로
    commit([...drawingsRef.current, copy]);
    selectDrawing(copy.id);
  }

  /** 점을 다 모은 툴을 드로잉으로 확정 (글이 필요한 툴은 입력창부터) */
  function finish(tool: DrawingTool, points: DrawingPoint[], at?: { x: number; y: number }) {
    const drawing: Drawing = { id: uuid(), toolId: tool.id, schemaVersion: tool.schemaVersion, points, style: DRAW_STYLE };
    if (tool.needsText) {
      layerRef.current?.setPreview(drawing);
      setTextInput("");
      setTextDraft({ x: at?.x ?? 60, y: at?.y ?? 60, drawing });
      return;
    }
    commit([...drawingsRef.current, drawing]);
    // 다 그려도 도구는 그대로 → 이어서 또 그릴 수 있다. 첫 점 전에 기존 드로잉을 누르면 그 드로잉을 고르고,
    //   첫 점을 찍은 뒤엔 다른 드로잉 위를 눌러도 고르지 않고 점이 찍힌다
  }

  /** 다점 툴(경로·폴리라인): 더블클릭·Enter 로 완성 */
  function finishPending() {
    const tool = activeToolRef.current ? getTool(activeToolRef.current) : undefined;
    if (!tool || tool.mode !== "multi" || pendingRef.current.length < tool.pointCount) return;
    const points = pendingRef.current;
    pendingRef.current = [];
    setPendingCount(0);
    layerRef.current?.setPreview(null);
    finish(tool, points);
  }

  function saveText() {
    if (!textDraft) return;
    const text = textInput.trim();
    setTextDraft(null);
    layerRef.current?.setPreview(null);
    if (!text) return;
    if (textDraft.editing) commit(drawingsRef.current.map((d) => (d.id === textDraft.drawing.id ? { ...d, text } : d)));
    else commit([...drawingsRef.current, { ...textDraft.drawing, text }]); // 글 도구도 그대로 (이어서 또 쓰기)
  }

  function selectTool(toolId: string | null) {
    const groupKey = toolId ? groupKeyOf(getTool(toolId)?.group) : null;
    if (toolId && groupKey) setLastTool((cur) => (cur[groupKey] === toolId ? cur : { ...cur, [groupKey]: toolId }));
    if (toolId) {
      toggleNoteMode(false);
      selectDrawing(null);
    }
    setPendingCount(0);
    activeToolRef.current = toolId;
    setActiveToolId(toolId);
    // 브러시는 끌어서 그리므로 그동안 차트 이동·확대를 끈다
    const free = toolId ? getTool(toolId)?.mode === "free" : false;
    chartRef.current?.applyOptions({ handleScroll: !free, handleScale: !free });
    pendingRef.current = [];
    layerRef.current?.setPreview(null);
    setOpenGroup(null);
    setToolTip(null);
  }

  function onGroupClick(group: ToolGroup) {
    setToolTip(null);
    const tools = groupTools(group);
    const last = lastTool[group];
    if (tools.length === 1) selectTool(tools[0].id);
    else if (last && activeToolId !== last) selectTool(last); // 지난번에 쓴 도구 바로
    else if (tools.length > 1) setOpenGroup(openGroup === group ? null : group);
  }
  /** 묶음 버튼 오른쪽 › : 항상 메뉴 열기 (다른 도구 고르기) */
  function onGroupMenu(group: ToolGroup) {
    setToolTip(null);
    setOpenGroup(openGroup === group ? null : group);
  }

  /**
   * 전체화면 = 차트가 브라우저 창을 덮는 화면 하나로 통일.
   * (모니터 전체화면 API 는 클릭마다 브라우저가 허용하기도 막기도 해서 화면이 달라졌음 → 쓰지 않음. 모니터 전체는 F11)
   * ⛶ 버튼과 "보조 지표 +N · 전체화면에서 보기" 가 모두 이 함수를 쓴다
   */
  function toggleFullscreen() {
    setFullscreen((on) => !on);
  }

  /** 날짜 축(또는 바로 위 버튼 줄)에 마우스가 오면 그 날짜의 뉴스 버튼을 띄운다 */
  function onAreaMove(event: React.MouseEvent) {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container || bars.length === 0 || activeToolId || noteMode) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const axisTop = rect.height - chart.timeScale().height();
    if (x > chart.paneSize().width || y < axisTop - 30) {
      if (axisHover) setAxisHover(null);
      return;
    }
    if (y < axisTop) return; // 버튼 위로 올라가는 중이면 그대로 둔다
    const t = chart.timeScale().coordinateToTime(x);
    if (t === null) return setAxisHover(null);
    const time = fromChartTime(t);
    let bar = bars[0];
    for (const b of bars) if (b.time <= time) bar = b;
    const bx = chart.timeScale().timeToCoordinate(toChartTime(bar.time) as Time) ?? x;
    if (axisHover?.bar !== bar) setAxisHover({ x: bx, bar, axis: rect.height - axisTop, width: chart.paneSize().width });
  }

  // 뉴스 있는 날 점: 일봉일 때만, 보이는 범위가 바뀌거나 창 크기가 바뀌면 다시 놓음
  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container || interval !== "1d" || bars.length < 2) {
      setNewsMarks([]);
      return;
    }
    // 기사가 실제로 있는 날만 점을 찍는다
    const days = new Set(bars.filter((b) => storedNewsDays.has(kstDay(b.time))).map((b) => b.time));
    const place = () => {
      const ts = chart.timeScale();
      const width = chart.paneSize().width;
      const axis = ts.height();
      const marks: { x: number; bar: Bar; axis: number; width: number; move: number }[] = [];
      bars.forEach((bar, i) => {
        if (!days.has(bar.time) || i === 0) return;
        const x = ts.timeToCoordinate(toChartTime(bar.time) as Time);
        if (x !== null && x >= 0 && x <= width) marks.push({ x, bar, axis, width, move: Math.abs(bar.close / bars[i - 1].close - 1) });
      });
      // 점은 가장 최근 뉴스 하나만 그린다 (나머지 날은 날짜 축에 마우스를 올리면)
      setNewsMarks(marks.sort((a, b) => b.bar.time - a.bar.time).slice(0, 1));
    };
    place();
    chart.timeScale().subscribeVisibleLogicalRangeChange(place);
    const ro = new ResizeObserver(place);
    ro.observe(container);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(place);
      ro.disconnect();
    };
  }, [bars, interval, storedNewsDays]);

  function openNews(target: AxisHover) {
    newsAbortRef.current?.abort();
    const ac = new AbortController();
    newsAbortRef.current = ac;
    const index = bars.indexOf(target.bar);
    setNews({ ...target, status: "loading", items: [] });
    setAxisHover(null);
    fetchDailyNews(symbolCode, kstDay(target.bar.time), { close: target.bar.close, prevClose: bars[index - 1]?.close, isLast: index === bars.length - 1, time: target.bar.time }, ac.signal, symbolName)
      .then((items) => setNews((cur) => (cur && cur.bar === target.bar ? { ...cur, status: "done", items } : cur)))
      .catch(() => {
        if (!ac.signal.aborted) setNews((cur) => (cur && cur.bar === target.bar ? { ...cur, status: "error" } : cur));
      });
  }

  function showRange(days: number | "ytd" | "all") {
    const chart = chartRef.current;
    if (!chart || !last || bars.length === 0) return;
    if (days === "all") return chart.timeScale().fitContent();
    const lastTime = toChartTime(last.time);
    const from = days === "ytd" ? Date.UTC(new Date(lastTime * 1000).getUTCFullYear(), 0, 1) / 1000 : lastTime - days * 86400;
    chart.timeScale().setVisibleRange({ from: Math.max(from, toChartTime(bars[0].time)) as Time, to: lastTime });
  }

  const activeTool = activeToolId ? getTool(activeToolId) : undefined;
  /** 보조 창 개수만큼 차트 높이를 늘린다 */
  const drawnIndicators = visibleIndicators(instances, interval, fullscreen);
  const subPaneCount = drawnIndicators.filter((i) => getIndicator(i.id)?.placement === "separate").length;
  /** 평소엔 보조 창을 2개까지만 → 나머지는 전체화면에서 */
  const hiddenSubCount = visibleIndicators(instances, interval, true).filter((i) => getIndicator(i.id)?.placement === "separate").length - subPaneCount;
  const activeGroup = groupKeyOf(activeTool?.group);
  const textTools = toolsByGroup("text");
  const selectedDrawing = selectedId ? drawings.find((d) => d.id === selectedId) : undefined;
  const selectedAlert = selectedDrawing ? alerts.find((a) => a.status === "ACTIVE" && a.drawingId === selectedDrawing.id) : undefined;
  const dayLabel = (bar: Bar) => kstDay(bar.time).slice(5).replace("-", ".");
  const change = legendBar && legendPrev ? legendBar.close - legendPrev.close : 0;
  const changeRate = legendPrev?.close ? (change / legendPrev.close) * 100 : 0;

  return (
    <section
      ref={sectionRef}
      className={`ws-chart${fullscreen ? " expanded" : ""}${fullscreen && fullscreenSide ? " has-side" : ""}`}
      aria-label="차트"
    >
      <div className="ws-chart-toolbar">
        <div className="ws-intervals" role="group" aria-label="봉 간격">
          {PRESET_INTERVALS.map((key) => (
            <button key={key} className={key === interval ? "active" : ""} onClick={() => onIntervalChange(key)} aria-pressed={key === interval}>
              {intervalLabel(key).button}
            </button>
          ))}
          {/* 직접 설정한 간격은 "직접" 버튼 자리에 그대로 보인다 (예: 5분 ▾). 폭이 고정이라 툴바가 움직이지 않는다 */}
          <div className="ws-interval-custom">
            <button
              className={`${customOpen ? "open" : ""}${PRESET_INTERVALS.includes(interval) ? "" : " active"}`}
              onClick={() => setCustomOpen(!customOpen)}
              aria-expanded={customOpen}
              aria-pressed={!PRESET_INTERVALS.includes(interval)}
              title="봉 간격 직접 설정"
            >
              {PRESET_INTERVALS.includes(interval) ? "직접" : intervalLabel(interval).button} ▾
            </button>
            {customOpen && <CustomInterval current={interval} onApply={(next) => { setCustomOpen(false); onIntervalChange(next); }} onClose={() => setCustomOpen(false)} />}
          </div>
        </div>
        <span className="ws-divider" />
        <button className={`ws-tool-text${pickerOpen ? " open" : ""}`} onClick={() => setPickerOpen(true)} title="지표 추가·설정">
          지표{instances.length ? ` ${instances.length}` : ""} ＋
        </button>
        <button
          className={`ws-tool-text ws-avg-toggle${showAvg ? " active" : ""}`}
          onClick={toggleAvg}
          aria-pressed={showAvg}
          title={avgPrice ? `내 평균 단가 선 ${showAvg ? "숨기기" : "보이기"} (${avgPrice.source === "계좌" ? "증권사 계좌 보유" : "연습 주문"} ${avgPrice.quantity.toLocaleString("ko-KR")}주)` : "이 종목을 보유하면 평균 단가 선을 차트에 표시해요"}
        >
          평단 {showAvg ? "ON" : "OFF"}
        </button>
        <span className="ws-divider" />
        <div className="ws-note-menu" ref={noteMenuRef}>
          <button
            className={`ws-tool-text ws-note-toggle${noteMode || activeTool?.group === "text" ? " active" : ""}`}
            onClick={() => {
              setOpenGroup(null);
              setNoteMenuOpen(!noteMenuOpen);
            }}
            title="Note · 텍스트 · 말풍선 · 핀 등 글 도구"
            aria-expanded={noteMenuOpen}
          >
            ✎ {activeTool?.group === "text" ? activeTool.label : "Note"} ▾
          </button>
          {noteMenuOpen && (
            <div className="ws-flyout ws-note-flyout" role="menu">
              <p>Note · 글</p>
              <button
                className={`ws-tool-item${noteMode ? " active" : ""}`}
                role="menuitem"
                onClick={() => {
                  selectTool(null);
                  toggleNoteMode(!noteMode);
                  setNoteMenuOpen(false);
                }}
              >
                <ToolGlyph id="note" />
                <span>Note</span>
                <i
                  className="ws-tool-help"
                  aria-label="Note 설명"
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setToolTip({ text: "차트를 클릭한 지점에 노트를 남깁니다. 저장을 누르면 이 노트와 그린 드로잉이 함께 저장돼요.", x: r.right + 8, y: r.top + r.height / 2 });
                  }}
                  onMouseLeave={() => setToolTip(null)}
                >
                  ?
                </i>
              </button>
              <h5>글 · 주석</h5>
              {textTools.map((tool) => (
                <button
                  key={tool.id}
                  className={`ws-tool-item${activeToolId === tool.id ? " active" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    selectTool(tool.id);
                    setNoteMenuOpen(false);
                  }}
                >
                  <ToolGlyph id={tool.id} />
                  <span>{tool.label}</span>
                  <i
                    className="ws-tool-help"
                    aria-label={`${tool.label} 설명`}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setToolTip({ text: toolHelp(tool), x: r.right + 8, y: r.top + r.height / 2 });
                    }}
                    onMouseLeave={() => setToolTip(null)}
                  >
                    ?
                  </i>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 그리기 방식: 끄면 원래대로(클릭으로 점 찍기·브러시 손그림), 켜면 스마트 그리기 */}
        <button
          className={`ws-tool-text ws-avg-toggle${smartDraw ? " active" : ""}`}
          onClick={toggleSmartDraw}
          aria-pressed={smartDraw}
          title={
            smartDraw
              ? "스마트 그리기 켜짐: 끌어서 선 긋기 · 흔들려도 클릭 · 도구를 든 동안 그은 선 안 고름 · 곧게 그은 브러시는 직선으로. 누르면 원래 방식으로"
              : "스마트 그리기 꺼짐: 원래 방식(클릭으로만 점 찍기 · 끌면 차트 이동 · 도구를 들고도 그은 선 고르기 · 브러시는 손그림 그대로). 누르면 켜짐"
          }
        >
          스마트 {smartDraw ? "ON" : "OFF"}
        </button>
        <span className="ws-divider" />
        <button className="ws-icon-button" onClick={undo} disabled={past.length === 0} title="실행 취소">↶</button>
        <button className="ws-icon-button" onClick={redo} disabled={future.length === 0} title="다시 실행">↷</button>
        <button className="ws-icon-button ws-fullscreen" onClick={toggleFullscreen} title={fullscreen ? "전체 화면 끝내기 (Esc)" : "차트 전체 화면"} aria-pressed={fullscreen}>
          {fullscreen ? "⤡" : "⛶"}
        </button>
        {/* 차트 박스 오른쪽 끝: 기록으로 저장 + AI 차트 메모 정리 */}
        {onSave && (
          <button className="ws-tool-text ws-chart-save" onClick={onSave} disabled={saving} title="그은 선(채널·박스·피보나치 등)과 Memo 를 AI 가 분석해 오른쪽 차트 노트에 정리해요 (드로잉은 자동 저장)">
            {saving ? "분석 중…" : "AI 분석"}
          </button>
        )}
      </div>

      <div className="ws-chart-body">
        <nav ref={drawToolsRef} className="ws-draw-tools" aria-label="드로잉 도구">
          <button className={activeToolId === null ? "active" : ""} onClick={() => selectTool(null)} title="커서 선택">
            <Image src="/icons/cursor.svg" width={20} height={20} alt="" unoptimized />
          </button>
          {TOOL_GROUPS.map(({ key, label, icon }) => {
            const tools = groupTools(key);
            return (
              <div key={key} className="ws-draw-group">
                <button
                  className={activeGroup === key ? "active" : ""}
                  onClick={() => onGroupClick(key)}
                  title={lastTool[key] ? `${getTool(lastTool[key]!)?.label ?? label} (› 다른 도구)` : label}
                  aria-label={lastTool[key] ? (getTool(lastTool[key]!)?.label ?? label) : label}
                >
                  {lastTool[key] ? <ToolGlyph id={lastTool[key]!} /> : <Image src={icon} width={20} height={20} alt="" unoptimized />}
                  <span
                    className="ws-more"
                    role="button"
                    aria-label={`${label} 메뉴 열기`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onGroupMenu(key);
                    }}
                  >
                    ›
                  </span>
                </button>
                {openGroup === key && (
                  <div className="ws-flyout" role="menu">
                    <p>{label}</p>
                    {tools.map((tool, i) => (
                      <div key={tool.id}>
                        {tool.section && tool.section !== tools[i - 1]?.section && <h5>{tool.section}</h5>}
                        <button className={`ws-tool-item${activeToolId === tool.id ? " active" : ""}`} onClick={() => selectTool(tool.id)} role="menuitem">
                          <ToolGlyph id={tool.id} />
                          <span>{tool.label}</span>
                          {/* 도구 설명: 오른쪽 끝 ⓘ 에 마우스를 올리면 */}
                          <i
                            className="ws-tool-help"
                            aria-label={`${tool.label} 설명`}
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setToolTip({ text: toolHelp(tool), x: r.right + 8, y: r.top + r.height / 2 });
                            }}
                            onMouseLeave={() => setToolTip(null)}
                          >
                            ?
                          </i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <button
            className={scenarios.length ? "active" : ""}
            onClick={() => (scenarios.length ? closeScenarios() : showScenarios())}
            title="시나리오 보기 (가장 최근 선·채널·박스·포지션·피보나치 기준, 미래 5영업일 반투명 캔들)"
          >
            <Image src="/icons/candle.svg" width={20} height={20} alt="" unoptimized />
          </button>
          <span className="ws-draw-divider" />
          {/* 그리기 설정 (2026-11-22): 자석 · 모두 잠금 · 모두 감추기 · 객체 트리 */}
          <button className={drawPrefs.magnet ? "active" : ""} aria-pressed={drawPrefs.magnet} onClick={() => setDrawPref("magnet", !drawPrefs.magnet)} title={`자석 ${drawPrefs.magnet ? "켜짐" : "꺼짐"}: 점을 찍을 때 봉의 시가 · 고가 · 저가 · 종가에 붙여요`}>
            <Magnet size={18} strokeWidth={1.8} aria-hidden />
          </button>
          <button className={drawPrefs.lockAll ? "active" : ""} aria-pressed={drawPrefs.lockAll} onClick={() => setDrawPref("lockAll", !drawPrefs.lockAll)} title={drawPrefs.lockAll ? "모두 잠금 켜짐: 드로잉이 옮겨지지 않아요. 누르면 풀림" : "모두 잠금: 그린 것이 실수로 옮겨지지 않게"}>
            {drawPrefs.lockAll ? <Lock size={18} strokeWidth={1.8} aria-hidden /> : <LockOpen size={18} strokeWidth={1.8} aria-hidden />}
          </button>
          <button
            className={drawPrefs.hideAll ? "active" : ""}
            aria-pressed={drawPrefs.hideAll}
            onClick={() => {
              if (!drawPrefs.hideAll) selectDrawing(null);
              setDrawPref("hideAll", !drawPrefs.hideAll);
            }}
            title={drawPrefs.hideAll ? "드로잉을 모두 감춘 상태예요. 누르면 다시 보여요" : "드로잉 모두 감추기 (지우지 않고 가려요)"}
          >
            {drawPrefs.hideAll ? <EyeOff size={18} strokeWidth={1.8} aria-hidden /> : <Eye size={18} strokeWidth={1.8} aria-hidden />}
          </button>
          <button className={treeOpen ? "active" : ""} aria-pressed={treeOpen} onClick={() => setTreeOpen(!treeOpen)} title={`객체 트리: 그린 것 목록 (${drawings.length})`}>
            <ListTree size={18} strokeWidth={1.8} aria-hidden />
          </button>
          <span className="ws-draw-divider" />
          <div className="ws-draw-group">
            <button className={openGroup === "trash" ? "active" : ""} onClick={() => setOpenGroup(openGroup === "trash" ? null : "trash")} title="삭제">
              <Image src="/icons/trash.svg" width={20} height={20} alt="" unoptimized />
              <span className="ws-more">›</span>
            </button>
            {openGroup === "trash" && (
              <div className="ws-flyout" role="menu">
                <p>삭제</p>
                <button disabled={!selectedDrawing} onClick={deleteSelected} role="menuitem">
                  선택한 드로잉 삭제
                </button>
                <button
                  className="danger"
                  disabled={drawings.length === 0}
                  onClick={() => {
                    commit([]);
                    selectDrawing(null);
                    setOpenGroup(null);
                  }}
                  role="menuitem"
                >
                  드로잉 모두 삭제 ({drawings.length})
                </button>
              </div>
            )}
          </div>
        </nav>

        <div className="ws-chart-area" onMouseMove={onAreaMove} onMouseLeave={() => setAxisHover(null)}>
          <div className="ws-legend">
            <strong>
              {symbolName} · {intervalLabel(interval).legend} · {market || (currency === "USD" ? "US" : "KRX")}
            </strong>
            {delay && <em className="ws-delay" title="실시간 시세가 아니에요">{delay}</em>}
            {legendBar && (
            <span>
              시 {pxText(legendBar.open, currency)} 고 {pxText(legendBar.high, currency)} 저 {pxText(legendBar.low, currency)} 종 {pxText(legendBar.close, currency)}{" "}
              <em className={change >= 0 ? "up" : "down"}>
                {change >= 0 ? "+" : "-"}
                {pxText(Math.abs(change), currency)} ({change >= 0 ? "+" : ""}
                {changeRate.toFixed(2)}%)
              </em>
            </span>
            )}
          </div>
          {/* 차트 위 지표만 여기에. 보조 창 지표는 각 창 오른쪽 눈금에 이름표 */}
          {instances.some((i) => i.visible && getIndicator(i.id)?.placement !== "separate") && (
            <div className="ws-legend-ind">
              {instances
                .filter((i) => i.visible && getIndicator(i.id)?.placement !== "separate")
                .map((i) => {
                  const def = getIndicator(i.id);
                  if (!def) return null;
                  // 이동평균 묶음처럼 선마다 기간이 있으면 "MA 5 20 60 120" 을 선 색으로
                  if (def.outputs.length > 1 && def.params.length === def.outputs.length) {
                    return (
                      <button key={i.uid} className="multi" onClick={() => setPickerOpen(true)} title="지표 설정">
                        <b>{def.short}</b>
                        {def.params.map((p, k) =>
                          (i.params[p.key] ?? p.default) > 0 ? (
                            <span key={p.key} style={{ color: i.colors?.[k] ?? def.outputs[k].color }}>
                              {i.params[p.key] ?? p.default}
                            </span>
                          ) : null,
                        )}
                      </button>
                    );
                  }
                  return (
                    <button key={i.uid} style={{ color: i.colors?.[0] ?? def.outputs[0].color }} onClick={() => setPickerOpen(true)} title="지표 설정">
                      {instanceLabel(def, i.params)}
                    </button>
                  );
                })}
            </div>
          )}
          {hiddenSubCount > 0 && !fullscreen && (
            <button className="ws-more-panes" onClick={toggleFullscreen} title="전체화면에서 모든 보조 지표 보기">
              보조 지표 +{hiddenSubCount}개 · 전체화면에서 보기
            </button>
          )}
          {paneLegends.map((l) => (
            <div key={l.uid} className="ws-pane-legend" style={{ top: l.top + 4 }}>
              <button onClick={() => setPickerOpen(true)} title="지표 설정">
                {l.name}
              </button>
              {l.items.map((it, i) => (
                <span key={i} style={{ color: it.color }}>
                  {it.label && <small>{it.label}</small>}
                  {it.value}
                </span>
              ))}
            </div>
          ))}
          {bars.length === 0 && emptyMessage && <div className="ws-empty">{emptyMessage === "차트를 불러오는 중…" ? <BeeLoader /> : emptyMessage}</div>}
          <div ref={containerRef} className={`ws-canvas${activeToolId || noteMode ? " drawing" : ""}`} />
          {roleMenu && (
            <div className="ws-role-menu" role="menu" style={{ left: Math.max(4, roleMenu.x - 360), top: roleMenu.y + 12 }}>
              {["지지", "저항", "매수", "매도", "목표", "손절"].map((r) => {
                const on = tagTitle(roleMenu.tag) === r;
                return (
                  <button key={r} type="button" role="menuitemradio" aria-checked={on} style={on ? { background: TAG_COLOR[r], color: "#fff" } : undefined} onClick={() => { onRoleChangeRef.current?.(roleMenu.tag, r); setRoleMenu(null); }}>
                    {r}
                  </button>
                );
              })}
              <button type="button" role="menuitem" className="del" onClick={() => { onRoleChangeRef.current?.(roleMenu.tag, "없음"); setRoleMenu(null); }}>
                태그 지우기
              </button>
            </div>
          )}

          {noteMode && !noteDraft && <div className="ws-note-hint">노트를 남길 지점을 클릭하세요 · Esc 취소</div>}
          {activeTool && !textDraft && (
            <div className="ws-note-hint">
              <b>{activeTool.label}</b> ·{" "}
              {activeTool.mode === "free"
                ? "누른 채 끌어서 그리세요"
                : activeTool.mode === "multi"
                  ? `점을 차례로 찍고 더블클릭·Enter 로 끝 (지금 ${pendingCount}개)`
                  : activeTool.pointCount === 1
                    ? "차트를 한 번 누르세요"
                    : `점 ${activeTool.pointCount}개 중 ${pendingCount}개 찍음`}{" "}
              · Esc 취소
            </div>
          )}
          {/* 도구를 들고 있어도, 아직 새 드로잉의 점을 안 찍었으면 고른 드로잉의 설정을 보여 준다 */}
          {selectedDrawing && pendingCount === 0 && (
            <div className="ws-draw-edit" onClick={(e) => e.stopPropagation()} key={selectedDrawing.id} style={barOffset.x || barOffset.y ? { transform: `translate(calc(-50% + ${barOffset.x}px), ${barOffset.y}px)` } : undefined}>
              {/* 손잡이: 끌어서 막대를 옮김 (차트를 가릴 때) */}
              <button
                className="ws-draw-edit-grip"
                title="끌어서 옮기기 (두 번 누르면 제자리)"
                aria-label="선택 막대 옮기기"
                onDoubleClick={() => setBarOffset({ x: 0, y: 0 })}
                onPointerDown={(e) => {
                  const from = { x: e.clientX - barOffset.x, y: e.clientY - barOffset.y };
                  const move = (ev: PointerEvent) => setBarOffset({ x: ev.clientX - from.x, y: Math.max(0, ev.clientY - from.y) });
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                  e.preventDefault();
                }}
              >
                <GripVertical size={16} strokeWidth={1.9} aria-hidden />
              </button>
              <span className="ws-draw-edit-name">{getTool(selectedDrawing.toolId)?.label ?? "드로잉"}</span>
              <span className="ws-draw-edit-sep" />
              <div className="ws-draw-edit-item">
                <button className={editMenu === "color" ? "on" : ""} onClick={() => setEditMenu(editMenu === "color" ? null : "color")} title="색">
                  <i className="ws-color-dot" style={{ background: selectedDrawing.style.color }} />
                </button>
                {editMenu === "color" && (
                  <div className="ws-draw-pop">
                    <ColorSwatches value={selectedDrawing.style.color} label="드로잉 색" onChange={(color) => updateSelected({ style: { ...selectedDrawing.style, color } })} />
                  </div>
                )}
              </div>
              <div className="ws-draw-edit-item">
                <button className={editMenu === "width" ? "on" : ""} onClick={() => setEditMenu(editMenu === "width" ? null : "width")} title="굵기">
                  <i className="ws-width-line" style={{ height: selectedDrawing.style.width }} />
                  <small>{selectedDrawing.style.width}px</small>
                </button>
                {editMenu === "width" && (
                  <div className="ws-draw-pop ws-width-pop">
                    {[1, 1.5, 2, 3, 4].map((w) => (
                      <button
                        key={w}
                        className={selectedDrawing.style.width === w ? "on" : ""}
                        onClick={() => {
                          updateSelected({ style: { ...selectedDrawing.style, width: w } });
                          setEditMenu(null);
                        }}
                      >
                        <i style={{ height: w }} />
                        <small>{w}px</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* 선 모양: 실선 · 파선 · 점선 */}
              <div className="ws-draw-edit-item">
                <button className={editMenu === "dash" ? "on" : ""} onClick={() => setEditMenu(editMenu === "dash" ? null : "dash")} title="선 모양">
                  <i className={`ws-dash-line ${selectedDrawing.style.dash ?? "solid"}`} />
                </button>
                {editMenu === "dash" && (
                  <div className="ws-draw-pop ws-width-pop">
                    {([["solid", "실선"], ["dashed", "파선"], ["dotted", "점선"]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        className={(selectedDrawing.style.dash ?? "solid") === key ? "on" : ""}
                        onClick={() => {
                          updateSelected({ style: { color: selectedDrawing.style.color, width: selectedDrawing.style.width, ...(key === "solid" ? {} : { dash: key }) } });
                          setEditMenu(null);
                        }}
                      >
                        <i className={`ws-dash-line ${key}`} />
                        <small>{label}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {getTool(selectedDrawing.toolId)?.needsText && (
                <button
                  className="ws-draw-edit-text"
                  onClick={() => {
                    setTextInput(selectedDrawing.text ?? "");
                    setTextDraft({ x: 120, y: 40, drawing: selectedDrawing, editing: true });
                  }}
                  title="글 수정"
                >
                  T
                </button>
              )}
              <span className="ws-draw-edit-sep" />
              {/* 잠금: 잠그면 이 드로잉은 끌어서 옮길 수 없음 (풀어야 움직임) */}
              <button
                className={selectedDrawing.locked ? "on" : ""}
                aria-pressed={!!selectedDrawing.locked}
                onClick={() => updateSelected({ locked: !selectedDrawing.locked })}
                title={selectedDrawing.locked ? "잠김: 옮길 수 없어요. 누르면 풀림" : "잠그기: 실수로 옮겨지지 않게"}
                aria-label={selectedDrawing.locked ? "잠금 풀기" : "잠그기"}
              >
                {selectedDrawing.locked ? <Lock size={17} strokeWidth={1.9} aria-hidden /> : <LockOpen size={17} strokeWidth={1.9} aria-hidden />}
              </button>
              <button onClick={duplicateSelected} title="복제">
                ⧉
              </button>
              <button className="danger" onClick={deleteSelected} title="삭제 (Delete 키)" aria-label="삭제">
                <Image src="/icons/trash.svg" width={18} height={18} alt="" unoptimized />
              </button>
              {/* 얼러트: 이 선에 현재가가 닿으면 종 알림 (선 도구만) */}
              {canAlert(selectedDrawing) && (
                <button className={selectedAlert ? "on" : ""} aria-pressed={!!selectedAlert} onClick={() => void toggleAlert(selectedDrawing)} title={selectedAlert ? "얼러트 켜짐: 현재가가 이 선에 닿으면 알려요. 누르면 꺼요" : "얼러트 넣기: 현재가가 이 선에 닿으면 종 알림으로 알려요"} aria-label={selectedAlert ? "얼러트 끄기" : "얼러트 넣기"}>
                  {selectedAlert ? <BellRing size={17} strokeWidth={1.9} aria-hidden /> : <Bell size={17} strokeWidth={1.9} aria-hidden />}
                </button>
              )}
              {/* 더보기: 템플릿 · 보는 차례 · 인터벌 가시성 · 객체 트리 · 감추기 */}
              <div className="ws-draw-edit-item">
                <button
                  className={editMenu === "more" ? "on" : ""}
                  onClick={() => {
                    setEditMenu(editMenu === "more" ? null : "more");
                    setMoreSub(null);
                  }}
                  title="더보기"
                  aria-label="더보기"
                >
                  <MoreHorizontal size={18} strokeWidth={1.9} aria-hidden />
                </button>
                {editMenu === "more" && (
                  <div className="ws-draw-pop ws-more-pop" role="menu">
                    {canAlert(selectedDrawing) && (
                      <>
                        <button onClick={() => void toggleAlert(selectedDrawing)} role="menuitem">
                          {selectedAlert ? "얼러트 끄기" : `${getTool(selectedDrawing.toolId)?.label ?? "선"} 얼러트 넣기…`}
                          {selectedAlert ? <BellRing size={14} aria-hidden /> : <Bell size={14} aria-hidden />}
                        </button>
                        <span className="ws-more-line" />
                      </>
                    )}
                    <button className={moreSub === "template" ? "on" : ""} onClick={() => setMoreSub(moreSub === "template" ? null : "template")} role="menuitem">
                      템플릿 <ChevronRight size={14} aria-hidden />
                    </button>
                    {moreSub === "template" && (
                      <div className="ws-more-sub">
                        <button
                          onClick={() => {
                            const name = window.prompt("템플릿 이름 (지금 색 · 굵기 · 선 모양을 저장해요)", `${getTool(selectedDrawing.toolId)?.label ?? "드로잉"} ${templates.length + 1}`)?.trim();
                            if (name) saveDrawTemplate({ name, style: selectedDrawing.style });
                          }}
                        >
                          + 지금 스타일을 템플릿으로 저장
                        </button>
                        {templates.map((t) => (
                          <span key={t.name} className="ws-more-row">
                            <button onClick={() => updateSelected({ style: t.style })} title="이 템플릿 적용">
                              <i className="ws-color-dot" style={{ background: t.style.color }} /> {t.name} <small>{t.style.width}px{t.style.dash === "dashed" ? " · 파선" : t.style.dash === "dotted" ? " · 점선" : ""}</small>
                            </button>
                            <button className="x" onClick={() => removeDrawTemplate(t.name)} aria-label={`${t.name} 템플릿 삭제`} title="템플릿 삭제">
                              ✕
                            </button>
                          </span>
                        ))}
                        {!templates.length && <small className="ws-more-note">저장한 템플릿이 없어요.</small>}
                      </div>
                    )}
                    <button className={moreSub === "order" ? "on" : ""} onClick={() => setMoreSub(moreSub === "order" ? null : "order")} role="menuitem">
                      보는 차례 <ChevronRight size={14} aria-hidden />
                    </button>
                    {moreSub === "order" && (
                      <div className="ws-more-sub">
                        <button onClick={() => reorderSelected("front")}>맨 앞으로</button>
                        <button onClick={() => reorderSelected("forward")}>한 칸 앞으로</button>
                        <button onClick={() => reorderSelected("backward")}>한 칸 뒤로</button>
                        <button onClick={() => reorderSelected("back")}>맨 뒤로</button>
                      </div>
                    )}
                    <button className={moreSub === "intervals" ? "on" : ""} onClick={() => setMoreSub(moreSub === "intervals" ? null : "intervals")} role="menuitem">
                      인터벌 가시성 <ChevronRight size={14} aria-hidden />
                    </button>
                    {moreSub === "intervals" && (
                      <div className="ws-more-sub">
                        <button className={!selectedDrawing.intervals?.length ? "on" : ""} onClick={() => setSelectedIntervals(null)}>
                          모든 주기에서 보이기
                        </button>
                        <button onClick={() => setSelectedIntervals([interval])}>지금 주기({intervalLabel(interval).button})에서만</button>
                        <div className="ws-more-checks">
                          {[...new Set([...PRESET_INTERVALS, interval])].map((key) => {
                            const on = !selectedDrawing.intervals?.length || selectedDrawing.intervals.includes(key);
                            return (
                              <label key={key}>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => {
                                    const all = [...new Set([...PRESET_INTERVALS, interval])];
                                    const cur = selectedDrawing.intervals?.length ? selectedDrawing.intervals : all;
                                    const next = on ? cur.filter((k) => k !== key) : [...cur, key];
                                    // 지금 주기를 끄면 화면에서 사라지므로 선택도 풂. 다 켜면 '모든 주기'
                                    if (!next.includes(interval)) selectDrawing(null);
                                    commit(drawingsRef.current.map((d) => (d.id === selectedDrawing.id ? { ...d, intervals: next.length && next.length < all.length ? next : undefined } : d)));
                                  }}
                                />
                                {intervalLabel(key).button}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setTreeOpen(true);
                        setEditMenu(null);
                      }}
                      role="menuitem"
                    >
                      객체 트리…
                    </button>
                    <span className="ws-more-line" />
                    <button onClick={() => (duplicateSelected(), setEditMenu(null))} role="menuitem">
                      클론
                    </button>
                    <button onClick={() => updateSelected({ locked: !selectedDrawing.locked })} role="menuitem">
                      {selectedDrawing.locked ? "잠금 풀기" : "잠금"}
                    </button>
                    <button onClick={() => updateDrawing(selectedDrawing.id, { hidden: true })} role="menuitem">
                      감추기
                    </button>
                    <button className="danger" onClick={deleteSelected} role="menuitem">
                      없애기
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => selectDrawing(null)} aria-label="선택 해제" title="선택 해제">
                ✕
              </button>
            </div>
          )}

          {alertMsg && (
            <div className="ws-alert-msg" role="status">
              {alertMsg}
            </div>
          )}
          {/* 객체 트리: 그린 것 목록 (위에 그려진 것부터). 고르기 · 감추기 · 잠금 · 없애기 */}
          {treeOpen && (
            <div className="ws-tree" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="객체 트리">
              <div className="ws-tree-head">
                <strong>객체 트리</strong>
                <small>{drawings.length}개</small>
                <button onClick={() => setTreeOpen(false)} aria-label="객체 트리 닫기">
                  ✕
                </button>
              </div>
              {drawings.length ? (
                <ul>
                  {[...drawings].reverse().map((d) => {
                    const off = !!d.intervals?.length && !d.intervals.includes(interval);
                    return (
                      <li key={d.id} className={`${d.id === selectedId ? "on" : ""}${d.hidden || off ? " dim" : ""}`}>
                        <button className="name" disabled={d.hidden || off || drawPrefs.hideAll} onClick={() => selectDrawing(d.id)} title={off ? "이 주기에서는 보이지 않게 해 둔 드로잉이에요" : undefined}>
                          <i className="ws-color-dot" style={{ background: d.style.color }} />
                          <span>{getTool(d.toolId)?.label ?? "드로잉"}</span>
                          {alerts.some((a) => a.status === "ACTIVE" && a.drawingId === d.id) && <BellRing size={12} aria-label="얼러트 켜짐" />}
                          <small>{d.text ? d.text.slice(0, 12) : Number(d.points[0]?.price) > 0 ? pxText(Number(d.points[0].price), currency) : ""}{off ? " · 다른 주기" : ""}</small>
                        </button>
                        <button onClick={() => updateDrawing(d.id, { hidden: !d.hidden })} aria-label={d.hidden ? "보이기" : "감추기"} title={d.hidden ? "보이기" : "감추기"}>
                          {d.hidden ? <EyeOff size={15} strokeWidth={1.9} aria-hidden /> : <Eye size={15} strokeWidth={1.9} aria-hidden />}
                        </button>
                        <button onClick={() => updateDrawing(d.id, { locked: !d.locked })} aria-label={d.locked ? "잠금 풀기" : "잠금"} title={d.locked ? "잠금 풀기" : "잠금"}>
                          {d.locked ? <Lock size={15} strokeWidth={1.9} aria-hidden /> : <LockOpen size={15} strokeWidth={1.9} aria-hidden />}
                        </button>
                        <button className="danger" onClick={() => removeDrawing(d.id)} aria-label="없애기" title="없애기">
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>아직 그린 것이 없어요.</p>
              )}
            </div>
          )}

          {(scenarios.length > 0 || scenarioMsg) && (
            <div className="ws-scenario-bar" onClick={(e) => e.stopPropagation()}>
              {scenarios.length > 0 ? (
                <>
                  <strong>시나리오</strong>
                  <span>
                    {scenarioPick
                      ? `${scenarioPick} — ${scenarios.find((k) => k.name === scenarioPick)?.summary ?? ""}`
                      : `기준: ${scenarioState?.base ?? ""} · 미래 캔들에 마우스를 올리고 클릭해 고르세요`}
                  </span>
                  <em>예시 경로이며 예측이 아닙니다</em>
                  {scenarioPick && <button onClick={() => setScenarioPick(null)}>다시 고르기</button>}
                  <button onClick={closeScenarios} aria-label="시나리오 닫기">
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span>{scenarioMsg}</span>
                  <button onClick={() => setScenarioMsg(null)} aria-label="닫기">
                    ✕
                  </button>
                </>
              )}
            </div>
          )}
          {scenarioHover && !scenarioPick && (
            <span className="ws-scenario-label" style={{ left: scenarioHover.x + 10, top: scenarioHover.y }}>
              {scenarioHover.name}
            </span>
          )}

          {toolTip && (openGroup || noteMenuOpen) && (
            <div className="ws-tool-tip" style={{ left: toolTip.x, top: toolTip.y }} role="tooltip">
              {toolTip.text}
            </div>
          )}

          {textDraft && (
            <div className="ws-note-pop" style={{ left: Math.max(8, textDraft.x - 120), top: textDraft.y + 14 }} onClick={(e) => e.stopPropagation()}>
              <small>{getTool(textDraft.drawing.toolId)?.label} 내용</small>
              <textarea
                autoFocus
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    saveText();
                  }
                }}
                placeholder="차트에 남길 글 (Shift+Enter 줄바꿈)"
                rows={3}
              />
              <div>
                <button
                  onClick={() => {
                    setTextDraft(null);
                    layerRef.current?.setPreview(null);
                  }}
                >
                  취소
                </button>
                <button className="primary" disabled={!textInput.trim()} onClick={saveText}>
                  추가
                </button>
              </div>
            </div>
          )}

          {noteDraft && (
            <div className="ws-note-pop" style={{ left: Math.max(8, noteDraft.x - 120), top: noteDraft.y + 14 }} onClick={(e) => e.stopPropagation()}>
              <small>{currency === "USD" ? `$${usd(noteDraft.price)}` : `${won(Math.round(noteDraft.price))}원`} 지점</small>
              <textarea
                autoFocus
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    saveNote();
                  }
                }}
                placeholder="이 지점에서 본 근거를 적어두세요"
                rows={3}
              />
              <div>
                <button onClick={() => setNoteDraft(null)}>취소</button>
                <button className="primary" disabled={!noteInput.trim()} onClick={saveNote}>노트 추가</button>
              </div>
            </div>
          )}

          {/* 트레이딩뷰처럼: 가장 최근 뉴스 날에 동그라미 하나, 다른 날은 날짜 축에 마우스를 올렸을 때 그날 뉴스가 있으면 동그라미 */}
          {!news &&
            [...newsMarks, ...(axisHover && storedNewsDays.has(kstDay(axisHover.bar.time)) && !newsMarks.some((m) => m.bar === axisHover.bar) ? [axisHover] : [])].map((m) => (
              <button
                key={m.bar.time}
                className="ws-news-mark"
                style={{ left: m.x, bottom: m.axis + 4 }}
                onClick={() => openNews(m)}
                aria-label={`${kstDay(m.bar.time)} 뉴스 보기`}
                title={`${dayLabel(m.bar)} 뉴스 보기`}
              >
                {/* 홈 화면 꿀벌 얼굴 (남색 두건 · 노란 얼굴 · 더듬이) */}
                <svg viewBox="0 0 20 20" aria-hidden>
                  <path className="ant" d="M7.6 6.4 6 2.9M12.4 6.4 14 2.9" />
                  <circle className="tip" cx="5.8" cy="2.6" r="1.5" />
                  <circle className="tip" cx="14.2" cy="2.6" r="1.5" />
                  <ellipse className="face" cx="10" cy="12.2" rx="6.1" ry="5" />
                  <circle className="eye" cx="7.8" cy="11.8" r="1" />
                  <circle className="eye" cx="12.2" cy="11.8" r="1" />
                  <circle className="cheek" cx="6.3" cy="13.6" r=".9" />
                  <circle className="cheek" cx="13.7" cy="13.6" r=".9" />
                </svg>
              </button>
            ))}

          {news && (
            <aside ref={newsPanelRef} className="ws-news" style={{ left: Math.max(8, Math.min(news.x - 150, news.width - 308)), bottom: news.axis + 6 }} aria-live="polite">
              <header>
                <span className="ws-news-tag">AI 뉴스 · {kstDay(news.bar.time).replaceAll("-", ".")}</span>
                <button onClick={() => setNews(null)} aria-label="뉴스 닫기">✕</button>
              </header>
              {news.status === "loading" && <BeeLoader size="sm" label="뉴스" />}
              {news.status === "error" && <p className="ws-muted">뉴스를 불러오지 못했어요.</p>}
              {news.status === "done" && news.items.length === 0 && <p className="ws-muted">이 날짜의 뉴스가 없어요.</p>}
              {news.items.map((item) => (
                <article key={item.title}>
                  <strong>
                    {item.kind === "sector" && <span className="ws-news-kind">섹터</span>}
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </strong>
                  {item.summary && <p>{item.summary}</p>}
                  <small>
                    {item.source}
                    {/* 구글 뉴스의 지난 기사는 날짜만 있고 시각이 정각(:00:00)으로 와서 시각은 숨김 */}
                    {item.publishedAt && !/T\d\d:00:00/.test(item.publishedAt) && ` · ${new Date(item.publishedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })}`}
                  </small>
                  {onQuoteNews && (
                    <button
                      type="button"
                      className="ws-news-quote"
                      onClick={() => {
                        onQuoteNews(`[인용 · ${kstDay(news.bar.time).slice(5).replace("-", ".")} 뉴스] ${item.title}`);
                        setNews(null);
                      }}
                    >
                      + Memo에 인용
                    </button>
                  )}
                </article>
              ))}
            </aside>
          )}
        </div>
      </div>

      {pickerOpen && (
        <IndicatorPicker
          instances={instances}
          onAdd={addIndicator}
          onUpdate={(uid, patch) => setInstances((list) => list.map((i) => (i.uid === uid ? { ...i, ...patch } : i)))}
          onRemove={(uid) => setInstances((list) => list.filter((i) => i.uid !== uid))}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="ws-chart-footer">
        <div className="ws-ranges">
          {RANGES.map((range) => (
            <button key={range.label} onClick={() => showRange(range.days)}>
              {range.label}
            </button>
          ))}
        </div>
        <span>{market === "지수" ? "pt" : currency} · {intervalLabel(interval).footer}</span>
      </div>
      {fullscreen && fullscreenSide}
    </section>
  );
}

/** 봉 간격 직접 설정: 숫자 + 단위 (초·분·시간·일·주) */
function CustomInterval({ current, onApply, onClose }: { current: Interval; onApply: (i: Interval) => void; onClose: () => void }) {
  const cur = parseInterval(current);
  const [n, setN] = useState(String(cur.n));
  const [unit, setUnit] = useState<IntervalUnit>(cur.unit);
  const num = Number(n);
  const valid = Number.isInteger(num) && num >= 1 && num <= UNIT_MAX[unit];
  const apply = () => valid && onApply(makeInterval(num, unit));
  // 창 밖(직접 버튼 제외)을 누르면 닫는다
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const box = boxRef.current;
      if (box && !box.parentElement?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div ref={boxRef} className="ws-interval-pop" onClick={(e) => e.stopPropagation()}>
      <div className="ws-interval-row">
        <input
          autoFocus
          type="number"
          min={1}
          max={UNIT_MAX[unit]}
          value={n}
          onChange={(e) => setN(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
            if (e.key === "Escape") onClose();
          }}
          aria-label="간격 숫자"
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value as IntervalUnit)} aria-label="간격 단위">
          {(Object.keys(UNIT_LABEL) as IntervalUnit[]).map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
        <button className="ws-interval-apply" onClick={apply} disabled={!valid}>
          적용
        </button>
      </div>
      <small className={valid ? "" : "bad"}>
        {valid ? (unit === "s" ? "초봉은 장중 실시간 체결로만 쌓여요" : unit === "d" || unit === "w" || unit === "y" ? "수급 지표는 1일봉에서만 보여요" : "장 시작(09:00) 기준으로 묶어요") : `1~${UNIT_MAX[unit]} 사이로 넣어 주세요`}
      </small>
    </div>
  );
}
