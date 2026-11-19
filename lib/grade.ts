// 판매자 등급 · 열람권 가격 · 수수료 (2026-11-17 팀 회의 "최종 산정 공식")
//   매달 1일 재평가 · 평가 기간 = 최근 min(활동개월, 24)개월 · 수익률은 주간 단위
//   등급 조건은 모두 동시에 만족해야 함. 가격은 성적 점수 E 를 등급 기준점 사이 복리 보간
//   가격 규칙(회의 뒤 변경): 승급하면 새 등급 하한가로 다시 시작, 강등하면 아래 등급 상한가(다음 등급 하한 − 1단위)부터

export const GRADES = ["F", "D", "C", "B", "A", "VIP"] as const;
export type Grade = (typeof GRADES)[number];
type Sellable = Exclude<Grade, "F">;
const rank = (g: Grade) => GRADES.indexOf(g);

/** 등급 조건 (R: 연율 초과수익 % · SR: 연율 샤프 · PSR · MDD % · A_adj: 이행률 · T: 활동 개월) */
export const GRADE_RULES: Record<Sellable, { R: number; SR: number; PSR: number; MDD: number; A: number; T: number }> = {
  D: { R: 0, SR: 0.3, PSR: 0.6, MDD: 50, A: 0.5, T: 3 },
  C: { R: 3, SR: 0.6, PSR: 0.75, MDD: 40, A: 0.6, T: 3 },
  B: { R: 6, SR: 0.9, PSR: 0.85, MDD: 35, A: 0.72, T: 3 },
  A: { R: 10, SR: 1.2, PSR: 0.95, MDD: 25, A: 0.82, T: 12 },
  VIP: { R: 15, SR: 1.5, PSR: 0.98, MDD: 20, A: 0.9, T: 24 },
};
/** 하한가 L_g · 기준점 E_g */
export const PRICE_ANCHOR: Record<Sellable, { L: number; E: number }> = {
  D: { L: 4_000, E: 0 },
  C: { L: 7_000, E: 0.172 },
  B: { L: 20_000, E: 0.463 },
  A: { L: 120_000, E: 1.0 },
  VIP: { L: 500_000, E: 1.439 },
};
/** 수수료 (등급이 하나 오를 때마다 대략 절반) */
export const FEE: Record<Sellable, number> = { D: 0.2, C: 0.1, B: 0.05, A: 0.02, VIP: 0.01 };

export type Metrics = {
  /** 연율 초과수익 % = mean(r − r_시장) × 52 × 100 */
  R: number;
  /** 연율 샤프 = mean(초과) ÷ std(초과) × √52 */
  SR: number;
  PSR: number;
  /** 평가 기간 최대 낙폭 % (양수) */
  MDD: number;
  /** 이행률 보정값 (후보 7) */
  A: number;
  /** 일관성 지표 0~1: 시점마다 (이번 전략 ∩ 직전 전략) ÷ 이번 전략 의 평균 (lib/strategy consistency, 2026-11-19 회의) */
  C: number;
  /** 활동 개월 */
  T: number;
};

// ---------- 통계 ----------
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / (x.length || 1);
function std(x: number[]) {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
}
/** 표준정규 누적분포 Φ (Abramowitz–Stegun 7.1.26) */
export function phiN(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** 주간 초과수익으로 R · SR · PSR */
export function returnStats(excess: number[]) {
  const n = excess.length;
  const m = mean(excess);
  const s = std(excess);
  const srW = s ? m / s : 0;
  // 왜도 γ₃ · 첨도 γ₄ (정규분포면 3)
  const g3 = s && n > 2 ? excess.reduce((a, x) => a + ((x - m) / s) ** 3, 0) / n : 0;
  const g4 = s && n > 3 ? excess.reduce((a, x) => a + ((x - m) / s) ** 4, 0) / n : 3;
  const denom = 1 - g3 * srW + ((g4 - 1) / 4) * srW * srW;
  const PSR = n > 1 && denom > 0 ? phiN((srW * Math.sqrt(n - 1)) / Math.sqrt(denom)) : 0.5;
  return { R: m * 52 * 100, SR: srW * Math.sqrt(52), PSR };
}

/** 최대 낙폭 % */
export function maxDrawdown(eq: number[]) {
  let peak = -Infinity;
  let worst = 0;
  for (const v of eq) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return worst * 100;
}

/**
 * 이행률 A_adj (후보 7)
 *   n = N_t + κ·N_n
 *   A_adj = A_t − (A_t − 0.5)·5/(n + 5) − λ·max(0, A_t − A_n)·κ·N_n / n
 *   N_t, A_t: 매매 건수 · 매매 이행 점수(매수금액 가중) / N_n, A_n: 노트 이행 건수(달마다 최대 1) · 노트 이행 점수
 */
export function adjustedAdherence(Nt: number, At: number, Nn: number, An: number, kappa = 0.5, lambda = 1) {
  const n = Nt + kappa * Nn;
  if (n <= 0) return 0.5;
  return At - ((At - 0.5) * 5) / (n + 5) - (lambda * Math.max(0, At - An) * kappa * Nn) / n;
}

// ---------- 등급 · 점수 · 가격 ----------
/** 조건을 모두 만족하는 가장 높은 등급 (VIP 의 'A 연속 12개월'은 이력에서 따로 봄) */
export function rawGrade(m: Metrics): Grade {
  let best: Grade = "F";
  for (const g of ["D", "C", "B", "A", "VIP"] as Sellable[]) {
    const r = GRADE_RULES[g];
    const ok = (g === "D" ? m.R > r.R : m.R >= r.R) && m.SR >= r.SR && m.PSR >= r.PSR && m.MDD <= r.MDD && m.A >= r.A && m.T >= r.T;
    if (ok) best = g;
    else break;
  }
  return best;
}

const phi = (x: number) => (x <= 0 ? 0 : x <= 1 ? x ** 1.5 : 1 + 1.5 * Math.log(x));
/**
 * 성적 점수 E (D 기준선 0, A 기준선 1)
 *   비중 (2026-11-19 회의): 수익률 0.25 · 샤프 0.2 · 이행률 0.225 · 일관성 0.075 · 낙폭 0.15 · 활동 기간 0.1 (합 1)
 *   샤프를 0.3 → 0.2 로 줄인 0.3 을 이행률 : 일관성 = 3 : 1 로 나눔
 */
export function scoreE(m: Metrics) {
  const tau = Math.log(Math.min(Math.max(m.T, 3), 24) / 3) / Math.log(4);
  return (
    0.25 * phi(m.R / 10) +
    0.2 * phi((m.SR - 0.3) / 0.9) +
    0.225 * phi((m.A - 0.5) / 0.32) +
    0.075 * phi((m.C - 0.5) / 0.32) +
    0.15 * phi((50 - m.MDD) / 25) +
    0.1 * tau
  );
}

/** 금액 단위: 10만원 미만 100원, 이상 1,000원 단위 내림 */
export const roundPrice = (p: number) => (p < 100_000 ? Math.floor(p / 100) * 100 : Math.floor(p / 1000) * 1000);
const unitOf = (p: number) => (p <= 100_000 ? 100 : 1000);

/** 공식가: 등급 기준점 사이 복리 보간 (VIP 위로는 A→VIP 기울기 그대로) */
export function formulaPrice(E: number) {
  const order: Sellable[] = ["D", "C", "B", "A", "VIP"];
  let i = order.findIndex((g, k) => k === order.length - 1 || E < PRICE_ANCHOR[order[k + 1]].E);
  if (i === order.length - 1) i = order.length - 2; // VIP 위: A→VIP 구간 연장
  const lo = PRICE_ANCHOR[order[i]];
  const hi = PRICE_ANCHOR[order[i + 1]];
  return lo.L * (hi.L / lo.L) ** ((Math.max(E, 0) - lo.E) / (hi.E - lo.E));
}

const nextOf = (g: Sellable): Sellable | null => (g === "VIP" ? null : (GRADES[rank(g) + 1] as Sellable));
/** 등급 상한가: 다음 등급 하한 − 1단위 (VIP 는 없음). A 는 가격이 오를 때 상한을 두지 않지만, 강등돼 들어올 때는 이 값에서 시작 */
const upperOf = (g: Sellable) => {
  const n = nextOf(g);
  if (!n) return Infinity;
  const L = PRICE_ANCHOR[n].L;
  return L - unitOf(L);
};

export type GradeMonth = { month: string; metrics: Metrics; raw: Grade; grade: Grade | "일반"; E: number; price: number | null };
/** unrated: 아직 첫 등급을 받지 못함 (D 조건 미달 · 활동 3개월 전). 판매는 못 하지만 F(등급을 잃은 경우)와는 다름 */
export type GradeResult = { grade: Grade | "일반"; unrated: boolean; price: number | null; fee: number | null; metrics: Metrics; E: number; history: GradeMonth[] };

/**
 * 달마다 등급 · 가격을 이어서 계산
 *   첫 등급은 D · C · B 중 (B 보다 높아도 B) · 승급은 충족한 달 바로 · 강등은 2개월 연속 미달 (첫 달 유예)
 *   D 조건 2개월 연속 미달 → F (신규 판매 중지) · F 3개월 → 일반 계정
 *   VIP 는 A(이상)를 연속 12개월 유지해야
 *   가격: 첫 등급 D 면 5,000원, C · B 면 공식가를 범위 안으로 / 승급 = 새 등급 하한가 / 강등 = 아래 등급 상한가
 *         D · C · B 는 범위 [하한, 상한] 안, 그 등급에 들어온 첫 달 가격의 −20% ~ +30%, 한 달 ±10%
 *         A · VIP 는 상한 없음, 하락만 한 달 10%까지
 */
export function gradeHistory(months: { month: string; metrics: Metrics }[]): GradeResult {
  const history: GradeMonth[] = [];
  let grade: Grade | "일반" | null = null;
  let price: number | null = null;
  let entryPrice = 0;
  let missStreak = 0;
  let fStreak = 0;
  let aStreak = 0;

  const clampRange = (g: Sellable, p: number, prev: number | null) => {
    let v = p;
    if (g !== "A" && g !== "VIP") {
      v = Math.min(Math.max(v, PRICE_ANCHOR[g].L), upperOf(g));
      v = Math.min(Math.max(v, entryPrice * 0.8), entryPrice * 1.3);
      if (prev !== null) v = Math.min(Math.max(v, prev * 0.9), prev * 1.1);
    } else {
      v = Math.max(v, PRICE_ANCHOR[g].L);
      if (prev !== null) v = Math.max(v, prev * 0.9);
    }
    return roundPrice(v);
  };

  for (const { month, metrics } of months) {
    const E = scoreE(metrics);
    let raw = rawGrade(metrics);
    // VIP 는 A 이상 연속 12개월 뒤에만
    if (raw === "VIP" && aStreak < 12) raw = "A";
    const formula = formulaPrice(E);

    if (grade === "일반") {
      history.push({ month, metrics, raw, grade, E, price: null });
      continue;
    }
    if (grade === null) {
      // 첫 등급: 활동 3개월이 차야 평가, D·C·B 중에서만. 아직 등급이 없으면 판매만 못 할 뿐 F 로 치지 않음 (F · 일반 전환은 등급을 받은 뒤의 이야기)
      if (metrics.T < 3 || raw === "F") {
        history.push({ month, metrics, raw, grade: "F", E, price: null });
        continue;
      }
      grade = rank(raw) > rank("B") ? "B" : raw;
      entryPrice = grade === "D" ? 5_000 : roundPrice(Math.min(Math.max(formula, PRICE_ANCHOR[grade as Sellable].L), upperOf(grade as Sellable)));
      price = entryPrice;
    } else if (grade === "F") {
      if (raw !== "F") {
        // 다시 D 이상이면 그 등급 하한가로 (승급과 같게)
        grade = rank(raw) > rank("B") ? "B" : raw;
        entryPrice = PRICE_ANCHOR[grade as Sellable].L;
        price = entryPrice;
        fStreak = 0;
      } else if (++fStreak >= 3) {
        grade = "일반";
        price = null;
      }
    } else if (rank(raw) > rank(grade)) {
      // 승급: 바로, 새 등급 하한가로 다시 시작
      grade = raw;
      missStreak = 0;
      entryPrice = PRICE_ANCHOR[grade as Sellable].L;
      price = entryPrice;
    } else if (rank(raw) < rank(grade)) {
      missStreak++;
      if (missStreak >= 2) {
        missStreak = 0;
        if (raw === "F") {
          grade = "F";
          price = null;
          fStreak = 1;
        } else {
          // 강등: 아래 등급 상한가부터
          grade = raw;
          entryPrice = upperOf(raw as Sellable);
          price = entryPrice;
        }
      } else if (price !== null) price = clampRange(grade as Sellable, formula, price); // 유예 달
    } else {
      missStreak = 0;
      if (price !== null) price = clampRange(grade as Sellable, formula, price);
    }
    aStreak = grade === "A" || grade === "VIP" ? aStreak + 1 : 0;
    history.push({ month, metrics, raw, grade: grade as Grade | "일반", E, price });
  }
  const last = history[history.length - 1];
  const g = last?.grade ?? "F";
  return {
    grade: g,
    unrated: grade === null,
    price: last?.price ?? null,
    fee: g !== "F" && g !== "일반" ? FEE[g as Sellable] : null,
    metrics: last?.metrics ?? { R: 0, SR: 0, PSR: 0.5, MDD: 0, A: 0.5, C: 0.5, T: 0 },
    E: last?.E ?? 0,
    history,
  };
}

/** 일별 평가금 · 시장 지수(같은 거래일) → 주간 수익률 (그 주 마지막 거래일 기준) */
export function weekly(dates: string[], values: number[]) {
  const out: { week: string; v: number }[] = [];
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(`${dates[i]}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    const last = out[out.length - 1];
    if (last && last.week === monday) last.v = values[i];
    else out.push({ week: monday, v: values[i] });
  }
  return out;
}
