// 시뮬레이션 트레이더(sim.json)에 등급 공식(lib/grade) 적용
//   평가금 eq 는 2024-12 첫 거래일부터 날마다. 시장 기준(bench.json): 국내 코스피(키움) · 해외 나스닥 종합(FRED), 같은 거래일
//   매달 말 기준으로 최근 min(활동개월, 24)개월을 평가해 등급 · 가격 이력을 이어 감
//   이행률: 매매 이행 점수 A_t = 달별 이행률을 매매 건수로 가중, N_t = 매매 건수 / 노트는 달마다 1건(N_n = 개월 수)
//           시뮬레이션에는 노트 이행 점수가 따로 없어 A_n = A_t 로 둠 (실서비스는 노트 판정에서 계산)
import BENCH from "./bench.json";
import { adjustedAdherence, gradeHistory, maxDrawdown, returnStats, weekly, type GradeResult, type Metrics } from "../../lib/grade";

type SimMonthInfo = { month: string; follow: number; trades?: number };
type Bench = { KR: [string, number][]; US: [string, number][] };
const bench = BENCH as unknown as Bench;
const START = "2024-12-01";

export function gradeOfSim(sim: { eq: number[]; mIdx: Record<string, number>; months: SimMonthInfo[] }, market: "KR" | "US"): GradeResult | null {
  const series = bench[market].filter(([d]) => d >= START).slice(0, sim.eq.length);
  if (series.length !== sim.eq.length) return null; // 거래일이 안 맞으면 계산하지 않음
  const dates = series.map(([d]) => d);
  const mkt = series.map(([, v]) => v);
  const monthKeys = Object.keys(sim.mIdx).sort();
  const byMonth = new Map(sim.months.map((m) => [m.month, m]));

  const evals = monthKeys.map((month, k) => {
    const T = k + 1;
    const win = Math.min(T, 24);
    const from = sim.mIdx[monthKeys[k - win + 1]];
    const to = k + 1 < monthKeys.length ? sim.mIdx[monthKeys[k + 1]] : sim.eq.length; // 이 달 마지막 거래일 다음
    // 주간 수익률: 평가 기간 바로 앞 주를 기준으로
    const base = Math.max(0, from - 5);
    const wE = weekly(dates.slice(base, to), sim.eq.slice(base, to));
    const wM = weekly(dates.slice(base, to), mkt.slice(base, to));
    const excess: number[] = [];
    for (let i = 1; i < wE.length; i++) excess.push(wE[i].v / wE[i - 1].v - 1 - (wM[i].v / wM[i - 1].v - 1));
    const { R, SR, PSR } = returnStats(excess);
    const MDD = maxDrawdown(sim.eq.slice(from, to));
    const inWin = monthKeys.slice(k - win + 1, k + 1).map((m) => byMonth.get(m));
    const Nt = inWin.reduce((a, m) => a + (m?.trades ?? 0), 0);
    const At = Nt ? inWin.reduce((a, m) => a + ((m?.follow ?? 0) / 100) * (m?.trades ?? 0), 0) / Nt : 0.5;
    const A = adjustedAdherence(Nt, At, win, At);
    const metrics: Metrics = { R, SR, PSR, MDD, A, T };
    return { month, metrics };
  });
  return gradeHistory(evals);
}
