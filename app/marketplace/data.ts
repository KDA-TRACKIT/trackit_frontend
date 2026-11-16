// 전략 쇼핑 예시 데이터 (백엔드 API 가 생기기 전까지 화면만 먼저)
//   수익률은 % 숫자, 가격은 원. 수익은 초록 · 손실은 빨강 (차트의 양봉 초록 · 음봉 빨강과 같게)

export type Period = "1m" | "3m" | "6m" | "1y" | "3y" | "all";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "1m", label: "1개월" },
  { key: "3m", label: "3개월" },
  { key: "6m", label: "6개월" },
  { key: "1y", label: "1년" },
  { key: "3y", label: "3년" },
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

export type Strategy = {
  id: string;
  month: string; // 2026-10
  title: string;
  summary: string;
  ret: number; // 그 달 수익률 %
  follow: number; // 이행률 %
  price: number;
  free?: boolean;
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
    returns: { "1m": sum(1), "3m": sum(3), "6m": sum(6), "1y": sum(12), "3y": sum(24), all: sum(24) },
    monthly,
  };
}

export const TRADERS: Trader[] = Array.from({ length: 40 }, (_, i) => makeTrader(i));
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
  const list: Strategy[] = [...t.monthly].reverse().map((m, k) => {
    const [title, summary] = TITLES[(k + Number(t.id.slice(1))) % TITLES.length];
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
