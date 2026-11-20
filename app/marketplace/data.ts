// 전략 마켓 예시 데이터 (백엔드 API 가 생기기 전까지 화면만 먼저)
//   수익률은 % 숫자, 가격은 원. 수익은 초록 · 손실은 빨강 (차트의 양봉 초록 · 음봉 빨강과 같게)
//   월별 수익률 · 최대 낙폭 · 매매 수 · 이행률은 sim.json: 실제 일봉(키움, 2024-06~2026-11)에 트레이더마다 규칙을 돌려 만든 값
//     만드는 법: scripts/market-sim (fetch_candles.mjs → sim.py). 월별 전략 내용(매매 · 그은 선 · 차트)은 data/market-sim/{id}.json (공개 안 함, /strategy-data 가 구독 확인 뒤 그 달만)
import SIM from "./sim.json";
// 등급제는 없앰 (2026-11-20 기획): grades.ts · lib/grade 는 나중을 위해 남기고 마켓에서는 호출하지 않음
import type { GradeResult } from "../../lib/grade";

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
  /** 판매자 등급 · 구독 가격 · 수수료 (lib/grade, 2026-11-17 회의 공식). F · 일반이면 신규 판매 안 함 */
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

/** 실제 일봉으로 돌린 결과(sim.json)로 수익률 · 낙폭 · 이행률 · 매매 수를 채운다 (이름 · 가격 · 소개는 그대로) */
function withSim(t: Trader): Trader {
  const s = sim(t.id);
  if (!s) return t;
  const p = s.persona;
  const live = s.eq?.length ? monthStartReturns(s.eq, s.mIdx) : null;
  return {
    ...t,
    // 월 구독료는 판매자가 정한 값 (t.price)
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
    follow: s.follow,
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
//   (2026-11-20) 한 종목이어도 가리지 않고 보여 줌 → 항상 false. 부르는 곳은 그대로 둠
export const oneStock = (_t: Trader, _p: Period) => false;

function sumOf(monthly: { ret: number }[], n: number) {
  return Math.round(monthly.slice(-n).reduce((a, m) => a * (1 + m.ret / 100), 1) * 10000 - 10000) / 100;
}
function returnsOf(monthly: { ret: number }[]): Record<Period, number> {
  return { "1m": sumOf(monthly, 1), "3m": sumOf(monthly, 3), "6m": sumOf(monthly, 6), "1y": sumOf(monthly, 12), "2y": sumOf(monthly, 24), all: sumOf(monthly, 24) };
}

/**
 * 데모 판매자 9명 (2026-11-20: 예시 41명 → 섹터별 9명). 숫자 · 매매 · 노트는 sim.json t1~t9 / data/market-sim/t1~t9.json
 *   (scripts/market-sim/demo_build.py 가 실제 일봉으로 만듦: 한 사람 = 한 섹터 · 한 규칙, 2023-01 ~ 2026-11)
 */
const demo = (id: string, name: string, sector: string, market: "국내 주식" | "해외 주식", type: string, styles: string[], indicators: string[], price: number): Trader => ({
  id,
  name,
  tagline: sector,
  intro: "",
  quote: "",
  bio: [],
  since: "2023-01",
  likes: 0,
  price,
  buyers: 0,
  follow: 0,
  mdd: 0,
  styles,
  indicators,
  type,
  market,
  returns: { "1m": 0, "3m": 0, "6m": 0, "1y": 0, "2y": 0, all: 0 },
  monthly: [],
  verify: { months: 0, trades: 0, preRate: 0 },
});
const DEMO: Trader[] = [
  demo("t1", "깃발러너", "반도체", "국내 주식", "추세 추종", ["스윙", "돌파 매매"], ["추세선", "거래량"], 19900),
  demo("t2", "트렌드픽", "2차전지", "국내 주식", "추세 추종", ["돌파 매매"], ["지지·저항", "거래량"], 14900),
  demo("t3", "밸류버스", "바이오", "국내 주식", "스윙", ["가치 투자", "중장기"], ["이동평균선", "RSI"], 12900),
  demo("t4", "원트로그", "자동차", "국내 주식", "스윙", ["눌림목 매매"], ["이동평균선"], 9900),
  demo("t5", "황금비노트", "방산 · 조선", "국내 주식", "스윙", ["스윙"], ["추세선", "지지·저항"], 19900),
  demo("t6", "MACD리버설", "금융", "국내 주식", "추세 추종", ["스윙"], ["MACD"], 14900),
  demo("t7", "볼밴헌터", "인터넷 · 게임", "국내 주식", "단기 매매", ["단타", "스윙"], ["볼린저 밴드"], 9900),
  demo("t8", "스윙도크", "미국 빅테크", "해외 주식", "스윙", ["스윙"], ["추세선"], 14900),
  demo("t9", "모멘텀랩", "미국 헬스케어", "해외 주식", "추세 추종", ["중장기", "추세 추종"], ["이동평균선"], 12900),
];

/**
 * 데모 판매자 어진냥이 (2026-11-20): 2023-01부터 미국 주식. 숫자 · 매매 · 노트는 sim.json t42 / data/market-sim/t42.json
 *   (scripts/market-sim/eojin_build.py 가 실제 일봉으로 만듦: 1기 바이오 · 테마 급등 추격 → 2기 AI 기술주 골든크로스 · 급락 때 TQQQ 맥점)
 */
const EOJIN: Trader = {
  id: "t42",
  name: "어진냥이",
  tagline: "하락에서 살아남기",
  intro: "",
  quote: "하락에서 살아남기",
  bio: ["높은 수익보단 적은 손실"],
  since: "2023-01",
  likes: 0,
  price: 19900,
  buyers: 0,
  follow: 0,
  mdd: 0,
  styles: ["스윙", "추세 추종"],
  indicators: ["이동평균선", "MACD", "RSI", "추세선", "지지·저항"],
  type: "스윙",
  market: "해외 주식",
  returns: { "1m": 0, "3m": 0, "6m": 0, "1y": 0, "2y": 0, all: 0 },
  monthly: [],
  verify: { months: 0, trades: 0, preRate: 0 },
};

export const TRADERS: Trader[] = [...DEMO, EOJIN].map(withSim);

/**
 * 판매 심사: 어떤 방법이든 기록으로 통하는 게 확인되면 판매, 아니면 판매 보류 (목록에서 숨기고 구독 판매 안 함)
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
/** 전략 마켓 목록 · 비슷한 트레이더 · 홈 보드에 보이는 트레이더: 실제 기록(매매 · 월별 전략)이 있는 사람 (등급제 없음) */
export const listed = (t: Trader) => t.verify.months > 0 && t.price > 0;

/** 구독할 수 있는 트레이더 (월 구독료가 있음) */
export const sellable = listed;
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
