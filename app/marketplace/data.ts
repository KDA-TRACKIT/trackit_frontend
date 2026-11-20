// 전략 마켓 예시 데이터 (백엔드 API 가 생기기 전까지 화면만 먼저)
//   수익률은 % 숫자, 가격은 원. 수익은 초록 · 손실은 빨강 (차트의 양봉 초록 · 음봉 빨강과 같게)
//   월별 수익률 · 최대 낙폭 · 매매 수 · 이행률은 sim.json: 실제 일봉(키움, 2024-06~2026-11)에 트레이더마다 규칙을 돌려 만든 값
//     만드는 법: scripts/market-sim (fetch_candles.mjs → sim.py). 월별 전략 내용(매매 · 그은 선 · 차트)은 data/market-sim/{id}.json (공개 안 함, /strategy-data 가 열람권 확인 뒤 그 달만)
import SIM from "./sim.json";
import { gradeOfSim } from "./grades";
import { formulaPrice, roundPrice, type GradeResult } from "../../lib/grade";

type SimTrader = {
  /** 작도(채널 · 피보나치 · 엘리어트)로 매매하는 트레이더면 소개를 규칙에 맞게 바꿈 */
  persona: { name?: string | null; tagline: string; quote: string; indicators: string[] } | null;
  /** 날마다 평가금 (시작 = 10000) */
  eq: number[];
  /** 달마다 첫 거래일이 eq 의 몇 번째인지 */
  mIdx: Record<string, number>;
  /** 마지막 종가 날짜 */
  asOf: string;
  monthly: { month: string; ret: number }[];
  mdd: number;
  trades: number;
  follow: number;
  rule: string;
  ruleDesc: string;
  symbols: string[];
  months: { month: string; title: string; summary: string; follow: number; trades?: number; symbols?: string[]; sample?: string; stats?: StrategyStats }[];
  facts?: Facts;
};
const sim = (id: string) => (SIM as Record<string, SimTrader>)[id];

export type Period = "1m" | "3m" | "6m" | "1y" | "2y" | "all";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "1m", label: "이번 달" },
  { key: "3m", label: "3개월" },
  { key: "6m", label: "6개월" },
  { key: "1y", label: "1년" },
  { key: "2y", label: "2년" },
  { key: "all", label: "전체" },
];

export const STYLES = ["단타", "스윙", "중장기", "추세 추종", "가치 투자", "돌파 매매", "눌림목 매매"] as const;
export const INDICATORS = ["이동평균선", "거래량", "RSI", "MACD", "볼린저 밴드", "지지·저항", "추세선"] as const;
export const TYPES = [
  { key: "단기 매매", desc: "하루~며칠 안에 정리" },
  { key: "스윙", desc: "몇 주 흐름을 따라감" },
  { key: "추세 추종", desc: "방향이 정해지면 따라감" },
  { key: "변동성 돌파", desc: "크게 움직이는 날 진입" },
] as const;
export const MARKETS = ["국내 주식", "해외 주식"] as const;

/** 카드에 보일 숫자: 작성일수(노트 · 진입 · 청산이 있던 날) · 매매 · 종목 노트 · 증시 메모 */
export type StrategyStats = { days: number; trades: number; stock: number; market: number };

export type Strategy = {
  id: string;
  month: string; // 2026-10
  title: string;
  summary: string;
  ret: number; // 그 달 수익률 %
  follow: number; // 이행률 %
  price: number;
  free?: boolean;
  /** 구매 전 미리 보기: 그 달에 진입한 매매 수 · 다룬 종목 · 전략 설명 한 줄 */
  trades?: number;
  symbols?: string[];
  sample?: string;
  stats?: StrategyStats;
};

/** 확인된 사실 (수익률만이 아니라 몇 건으로 냈는지, 손실 사례까지) */
export type Facts = {
  wins: number;
  losses: number;
  best: { name: string; ret: number; d: string } | null;
  worst: { name: string; ret: number; d: string } | null;
  /** 계획대로 한 매매 수 */
  followed: number;
  /** 평균 보유일 */
  avgHold: number;
};

export type Trader = {
  id: string;
  name: string;
  tagline: string;
  intro: string;
  quote: string;
  bio: string[];
  since: string; // 2024-01
  likes: number;
  price: number; // 이번 달 전략 가격
  buyers: number;
  follow: number; // 전략 이행률 %
  mdd: number; // 최대 낙폭 % (음수)
  styles: string[];
  indicators: string[];
  type: string;
  market: string;
  returns: Record<Period, number>;
  monthly: { month: string; ret: number }[]; // 최근 24개월
  /** 판매 심사에 쓰는 실제 기록 (방법은 안 따지고 결과 기록만 봄) */
  verify: Verify;
  /** 월별 전략 제목 · 설명 (없으면 기본 목록에서) */
  strategyTitles?: [string, string][];
  /** 매매 규칙 이름 · 설명, 매매하는 종목 (시뮬레이션) */
  rule?: { name: string; desc: string; symbols: string[] };
  /** 기간별 날마다 평가금 (월초 직전 종가부터 마지막 종가까지, 수익률 추이 그래프) */
  curves?: Record<Period, number[]>;
  /** 수익률 기준일 (마지막 종가) */
  asOf?: string;
  /** 확인된 사실 */
  facts?: Facts;
  /** 판매자 등급 · 열람권 가격 · 수수료 (lib/grade, 2026-11-17 회의 공식). F · 일반이면 신규 판매 안 함 */
  grade?: GradeResult;
  /** 기간마다 매매한 종목 수 (0 · 1 종목이면 수익률 · 추이를 "-" 로) */
  stocks?: Record<Period, number>;
};

/** 기간이 몇 달인지 (그 달 월초부터 셈). 이번 달 = 이번 달 1일부터 */
export const PERIOD_MONTHS: Record<Period, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "2y": 24, all: 0 };

/**
 * 월초 기준 수익률: 시작 달 첫 거래일 바로 전 종가 → 마지막 종가.
 *   이번 달 = 이번 달 1일 이후, 3개월 = 두 달 전 1일 이후 … (전체 · 기록보다 긴 기간은 처음부터)
 */
function monthStartReturns(eq: number[], mIdx: Record<string, number>) {
  const months = Object.keys(mIdx).sort();
  const last = eq.length - 1;
  const returns = {} as Record<Period, number>;
  const curves = {} as Record<Period, number[]>;
  for (const p of PERIODS) {
    const n = PERIOD_MONTHS[p.key];
    const start = n && n <= months.length ? mIdx[months[months.length - n]] : 0;
    const base = start > 0 ? eq[start - 1] : 10000;
    returns[p.key] = Math.round((eq[last] / base - 1) * 10000) / 100;
    // 추이 그래프는 고른 기간의 날만 (첫 거래일 ~ 마지막 종가). 맨 앞 값 = 기준(직전 종가), 그래프에는 안 그림
    curves[p.key] = [base, ...eq.slice(start)];
  }
  return { returns, curves };
}

export type Verify = {
  /** 계획을 먼저 잠그고 결과를 공개한 달 수 */
  months: number;
  /** 증권사 체결로 확인된 매매 수 */
  trades: number;
  /** 체결 전에 계획(사전 기록)이 있던 매매 비율 % */
  preRate: number;
  /** 판매자가 말한 수익률 (기록으로 확인 안 된 숫자, 있으면) */
  claimed?: number;
};

// 같은 결과가 나오게 고정 시드
function rand(seed: number) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES: [string, string, string][] = [
  ["차트메이트", "지지선에서 기회를 찾는 단타 트레이더", "지지선에서 기회를 찾고, 정한 원칙을 지킵니다."],
  ["파동노트", "거래량을 보고 추세 추종 트레이더", "파동이 꺾이기 전까지는 흔들리지 않습니다."],
  ["원트로그", "눌림목 매매만 하는 스윙 트레이더", "기다린 만큼만 들어가고, 정한 만큼만 나옵니다."],
  ["모멘텀랩", "이동평균선을 보는 중장기 트레이더", "추세는 친구, 손절은 보험입니다."],
  ["트렌드픽", "박스권 돌파를 노리는 트레이더", "박스를 깨는 순간에만 움직입니다."],
  ["시그널맵", "RSI 과매도 구간을 노리는 트레이더", "숫자가 말할 때만 삽니다."],
  ["밸류버스", "실적 시즌에 강한 가치 투자자", "싸게 사서 오래 기다리는 연습을 합니다."],
  ["캔들로그", "캔들 패턴으로 진입하는 단타 트레이더", "캔들 하나에도 이유를 붙입니다."],
  ["볼밴헌터", "볼린저 밴드 하단을 노리는 트레이더", "밴드 밖은 기회, 밴드 안은 휴식."],
  ["갭업클럽", "갭 상승 종목만 보는 단타 트레이더", "아침 10분에 하루를 겁니다."],
  ["스윙도크", "주봉으로 길게 보는 스윙 트레이더", "주봉이 정한 방향만 따릅니다."],
  ["리스크제로", "손절 원칙이 엄격한 트레이더", "잃지 않는 것이 먼저입니다."],
  ["나스닥워커", "미국 기술주 추세 추종", "큰 흐름 위에서만 탑니다."],
  ["코스닥러너", "코스닥 테마 단타", "테마의 첫날과 둘째 날만 봅니다."],
  ["바닥탐험가", "낙폭 과대 반등 노리는 트레이더", "모두가 팔 때 조금씩 삽니다."],
];

const HEAD = ["매수", "추세", "캔들", "돌파", "눌림", "박스", "갭"];
const TAIL = ["노트", "로그", "러너", "헌터", "메이커", "스쿨"];

function makeTrader(i: number): Trader {
  const r = rand(i * 977 + 13);
  const [baseName, tagline, quote] = NAMES[i % NAMES.length];
  // 15명 뒤로는 이름이 겹치지 않게 앞뒤 말을 섞어 만든다
  const name = i < NAMES.length ? baseName : `${HEAD[i % HEAD.length]}${TAIL[Math.floor(i / HEAD.length) % TAIL.length]}`;
  const id = `t${i + 1}`;
  const base = (r() - 0.35) * 6; // 월 평균
  const monthly: { month: string; ret: number }[] = [];
  for (let k = 23; k >= 0; k--) {
    const d = new Date(2026, 10 - k, 1);
    const ret = Math.round((base + (r() - 0.5) * 9) * 100) / 100;
    monthly.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, ret });
  }
  const sum = (n: number) => Math.round(monthly.slice(-n).reduce((a, m) => a * (1 + m.ret / 100), 1) * 10000 - 10000) / 100;
  const styles = [STYLES[i % STYLES.length], STYLES[(i * 3 + 2) % STYLES.length]].filter((v, k, a) => a.indexOf(v) === k);
  const indicators = [INDICATORS[i % INDICATORS.length], INDICATORS[(i * 2 + 1) % INDICATORS.length]].filter((v, k, a) => a.indexOf(v) === k);
  const year = 2023 + (i % 3);
  return {
    id,
    name,
    tagline,
    intro: `${tagline.replace(/ 트레이더$| 투자자$/, "")}. 매달 전략과 결과를 함께 공개합니다.`,
    quote,
    bio: [
      `${i % 4 === 3 || i === 12 ? "미국" : "국내"} 주식의 ${indicators[0]}과 ${indicators[1] ?? "거래량"} 변화를 중심으로 매매합니다.`,
      "진입 전에 손절 기준을 정하고, 계획과 실제 행동을 비교해 기록합니다.",
    ],
    since: `${year}-${String((i % 12) + 1).padStart(2, "0")}`,
    likes: 40 + Math.round(r() * 160),
    price: [9900, 12900, 19900, 8900, 29900, 100900][i % 6],
    buyers: 30 + Math.round(r() * 300),
    follow: 80 + Math.round(r() * 18),
    mdd: -Math.round((2 + r() * 14) * 100) / 100,
    styles,
    indicators,
    type: TYPES[i % TYPES.length].key,
    market: i % 4 === 3 || i === 12 ? "해외 주식" : "국내 주식",
    returns: { "1m": sum(1), "3m": sum(3), "6m": sum(6), "1y": sum(12), "2y": sum(24), all: sum(24) },
    monthly,
    verify: { months: 24, trades: 0, preRate: 0 },
  };
}

/** 실제 일봉으로 돌린 결과(sim.json)로 수익률 · 낙폭 · 이행률 · 매매 수를 채운다 (이름 · 가격 · 소개는 그대로) */
function withSim(t: Trader): Trader {
  const s = sim(t.id);
  if (!s) return t;
  const p = s.persona;
  const live = s.eq?.length ? monthStartReturns(s.eq, s.mIdx) : null;
  const grade = s.eq?.length ? gradeOfSim(s, t.market === "해외 주식" ? "US" : "KR") ?? undefined : undefined;
  return {
    ...t,
    // 열람권 가격은 등급 공식대로 (docs/formulas-2026-11-19.md 2장)
    //   판매 중지(F · 일반) · 등급 전이면 공식가(성적 점수 E 보간)만 보여 주고 팔지 않음 — 예전엔 견본 가격(9,900 · 100,900원 …)이 남아 있었음
    ...(grade && { grade, price: grade.price ?? roundPrice(formulaPrice(grade.E)) }),
    ...(live && { curves: live.curves, asOf: s.asOf }),
    ...(p && {
      name: p.name ?? t.name,
      tagline: p.tagline,
      quote: p.quote,
      indicators: p.indicators,
      intro: `${p.tagline.replace(/ 트레이더$/, "")}. 매달 차트에 그은 선과 매매를 함께 공개합니다.`,
      bio: [`${p.indicators.join("과 ")}을 차트에 직접 그어 진입 · 손절 · 목표를 정합니다.`, "선을 긋기 전엔 사지 않고, 계획과 실제 행동을 비교해 기록합니다."],
    }),
    monthly: s.monthly,
    returns: live?.returns ?? returnsOf(s.monthly),
    mdd: s.mdd,
    // 전략 이행률 = 공식의 보정 이행률 A_adj (건수가 적으면 0.5 쪽으로, 등급 · 가격에 쓰는 값과 같음). 달별 전략의 이행률은 그 달 그대로
    follow: grade ? Math.round(grade.metrics.A * 100) : s.follow,
    verify: { months: s.monthly.length, trades: s.trades, preRate: 100 },
    rule: { name: s.rule, desc: s.ruleDesc, symbols: s.symbols },
    facts: s.facts,
    stocks: stocksOf(s.months),
  };
}

/** 기간(월초부터)마다 매매한 종목 수 */
function stocksOf(months: SimTrader["months"]) {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const out = {} as Record<Period, number>;
  for (const p of PERIODS) {
    const n = PERIOD_MONTHS[p.key];
    const pick = n ? sorted.slice(-n) : sorted;
    out[p.key] = new Set(pick.flatMap((m) => m.symbols ?? [])).size;
  }
  return out;
}

/** 고른 기간에 매매가 없거나 한 종목만 매매했으면 수익률 · 추이를 보여 주지 않음 (비교 의미 없음) */
export const oneStock = (t: Trader, p: Period) => t.stocks !== undefined && t.stocks[p] <= 1;

/** 최근 n개월 (2026-11 까지) 월 목록 */
function lastMonths(n: number, rets: number[]) {
  return rets.map((ret, k) => {
    const d = new Date(2026, 10 - (n - 1 - k), 1);
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, ret };
  });
}
function sumOf(monthly: { ret: number }[], n: number) {
  return Math.round(monthly.slice(-n).reduce((a, m) => a * (1 + m.ret / 100), 1) * 10000 - 10000) / 100;
}
function returnsOf(monthly: { ret: number }[]): Record<Period, number> {
  return { "1m": sumOf(monthly, 1), "3m": sumOf(monthly, 3), "6m": sumOf(monthly, 6), "1y": sumOf(monthly, 12), "2y": sumOf(monthly, 24), all: sumOf(monthly, 24) };
}

/**
 * 차트 밈 예시 — "기영이 머리 차트"(뾰족한 고점이 짧게 여러 번 반복되는 모양)를 실전에 적용해 기록으로 수익을 보인 트레이더.
 * TRACKIT 은 방법(밈 · 지표 · 감)을 따지지 않는다. 장난으로 파는 전략을 거르는 기준은 팀에서 따로 만든다
 */

const MEME_REAL_MONTHLY = lastMonths(18, [2.1, -1.4, 3.6, 1.2, 4.8, -2.2, 2.9, 0.8, 3.3, -0.9, 5.1, 1.7, -1.8, 2.6, 3.9, 0.6, 2.2, 4.1]);
const MEME_TRADERS: Trader[] = [
  {
    id: "t41",
    name: "기영이머리연구소",
    tagline: "기영이 머리 차트를 실전에서 검증한 트레이더",
    intro: "밈으로 불리는 기영이 머리 차트를 2년 동안 실전에 적용하고 결과를 공개합니다.",
    quote: "모양은 밈이어도, 기준은 진지하게.",
    bio: [
      "뾰족한 고점이 짧은 간격으로 세 번 넘게 반복되는 '기영이 머리' 모양을 고점 분산 신호로 보고 비중을 줄입니다.",
      "모양만 보고 팔지 않고, 거래량이 줄고 직전 저점을 깨는 걸 확인한 뒤에만 움직여요. 매달 계획을 먼저 잠그고 결과를 공개했어요.",
    ],
    since: "2025-06",
    likes: 214,
    price: 14900,
    buyers: 188,
    follow: 93,
    mdd: -4.2,
    styles: ["스윙", "돌파 매매"],
    indicators: ["거래량", "지지·저항"],
    type: "추세 추종",
    market: "국내 주식",
    returns: returnsOf(MEME_REAL_MONTHLY),
    monthly: MEME_REAL_MONTHLY,
    verify: { months: 18, trades: 126, preRate: 91 },
    strategyTitles: [
      ["기영이 머리 세 번째 봉우리에서 비중 줄이기", "봉우리 간격 · 거래량으로 거른 실제 매매 기록"],
      ["가짜 기영이 머리 걸러내기", "거래량이 줄지 않으면 패턴으로 보지 않은 달"],
      ["봉우리 이탈 뒤 다시 사는 기준", "직전 저점을 회복하는 걸 확인하고 나눠 산 기록"],
    ],
  },
];

export const TRADERS: Trader[] = [...Array.from({ length: 40 }, (_, i) => makeTrader(i)), ...MEME_TRADERS].map(withSim);

/**
 * 판매 심사: 어떤 방법이든 기록으로 통하는 게 확인되면 판매, 아니면 판매 보류 (목록에서 숨기고 열람권 판매 안 함)
 *   기준: 공개한 달 3개월 이상 · 증권사 체결로 확인된 매매 20건 이상 · 체결 전에 계획이 있던 매매 50% 이상 · 전략 이행률 60% 이상
 */
export const SCREEN_RULES = [
  { key: "months", label: "공개한 달", need: 3, unit: "개월", value: (t: Trader) => t.verify.months },
  { key: "trades", label: "체결로 확인된 매매", need: 20, unit: "건", value: (t: Trader) => t.verify.trades },
  { key: "pre", label: "체결 전에 계획이 있던 매매", need: 50, unit: "%", value: (t: Trader) => t.verify.preRate },
  { key: "follow", label: "전략 이행률", need: 60, unit: "%", value: (t: Trader) => t.follow },
] as const;

export type Screening = { verified: boolean; checks: { label: string; value: number; need: number; unit: string; ok: boolean }[] };
export function screen(t: Trader): Screening {
  const checks = SCREEN_RULES.map((r) => ({ label: r.label, value: r.value(t), need: r.need, unit: r.unit, ok: r.value(t) >= r.need }));
  return { verified: checks.every((c) => c.ok), checks };
}
export const isVerified = (t: Trader) => screen(t).verified;
/**
 * 전략 마켓 목록 · 비슷한 트레이더 · 홈 보드에 보이는 트레이더 (주소로 들어오면 상세는 열림, 이미 산 전략은 계속 열람)
 *   - 판매 등급을 아직 못 받았으면 안 보임: 가입 후 3개월이 지나야 비즈니스 계정으로 바꿀 수 있고, 등급(D 이상)을 받아야 판매가 열림
 *   - 비즈니스 → 일반 계정으로 바뀐 트레이더(F 3개월)도 안 보임
 */
export const listed = (t: Trader) => !!t.grade && !t.grade.unrated && t.grade.grade !== "일반";

/** 등급을 받았고 F · 일반이 아니어야 신규 판매 (열람권 구매 가능) */
export const sellable = (t: Trader) => !!t.grade && !t.grade.unrated && t.grade.grade !== "F" && t.grade.grade !== "일반";
export const traderById = (id: string) => TRADERS.find((t) => t.id === id);

const TITLES: [string, string][] = [
  ["횡보장에서 손실을 줄이는 기준", "진입 · 청산 기준과 실제 매매 기록 비교"],
  ["하락장에서 지킨 손절 원칙", "손절 기준을 몇 번 지켰는지 돌아봤어요"],
  ["반등 구간에서 진입을 고르는 기준", "지지선 반등 확인 뒤 들어간 매매 기록"],
  ["거래량이 터진 날의 대응", "거래량 급증 종목에서의 분할 매수"],
  ["실적 발표 주간 매매 계획", "발표 전후 변동성에 맞춘 비중 조절"],
  ["돌파 실패를 줄이는 확인 방법", "가짜 돌파를 걸러낸 세 가지 조건"],
];

/** 트레이더의 월별 전략 (최근 것부터) */
export function strategiesOf(t: Trader): Strategy[] {
  const months = new Map((sim(t.id)?.months ?? []).map((m) => [m.month, m]));
  const list: Strategy[] = [...t.monthly].reverse().map((m, k) => {
    const s = months.get(m.month);
    if (s) return { id: `${t.id}-${m.month}`, month: m.month, title: s.title, summary: s.summary, ret: m.ret, follow: s.follow, price: t.price, trades: s.trades, symbols: s.symbols, sample: s.sample, stats: s.stats };
    const titles = t.strategyTitles ?? TITLES;
    const [title, summary] = titles[(k + Number(t.id.slice(1))) % titles.length];
    return { id: `${t.id}-${m.month}`, month: m.month, title, summary, ret: m.ret, follow: Math.min(99, t.follow - 3 + ((k * 7) % 9)), price: t.price };
  });
  // 처음 공개한 전략은 무료
  const first = list[list.length - 1];
  first.free = true;
  first.price = 0;
  return list;
}

export const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
export const pct = (n: number, sign = true) => `${sign && n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}%`;
export const tone = (n: number) => (n > 0 ? "gain" : n < 0 ? "loss" : "");
export const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${m.slice(5)}월`;
/** 이름 뒤 "와/과" (받침 있으면 과) */
export const wa = (name: string) => {
  const c = name.charCodeAt(name.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "과" : "와";
};
