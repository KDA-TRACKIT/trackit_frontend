// 종목 전략 글 다루기 (2026-11-19)
//   - Memo 문장이 매수 · 매도 · 손절 · 목표 중 무엇인지 (비슷한 표현까지)
//   - 쌓인 종목 전략 + 이번 Memo → 정리본: 투자자가 쓴 문장 그대로, 이번에 다시 쓴 칸만 바꾸고 나머지는 이어받음
//     AI 가 정리하면 말을 바꾸거나 없는 조건을 지어내서 규칙으로 함. 예전 노트의 AI 분석 글 · 자동 계획 줄은 전략으로 치지 않음

// Memo 문장 → 계획 칸 판단용 표현 (손절 · 목표 같은 말을 안 써도 비슷한 말로 알아봄)
const SELL_WORDS = /매도|팔[기고아면자겠았]|판다|팜|정리|청산|던[지짐져]|빼[기고]|뺀다|털[기고어]|비중\s*(?:축소|줄)|차익/;
const DOWN_WORDS = /이탈|깨지|깨면|깨질|깨져|무너지|붕괴|하회|밑으로|아래로|빠지면|빠질|내려가|내려오|떨어지|하락하면|못\s*지키|안\s*지키|지지\s*실패/;
const UP_WORDS = /도달|가면|오면|올라가|올라오|오르면|돌파|넘으면|넘기면|넘어가|터치|찍으면|닿으면|상승하면|저항\s*(?:에서|까지)/;
const BUY_WORDS = /매수|사[기고자]|살\s|산다|삼|사야|담[기고아는]|줍[기고]|주워|진입|들어가|들어감|탑승|불타기|물타기|추매|분할\s*매수|베팅/;

/**
 * 문장이 어느 계획 칸인지
 *   손절: '손절 · 스탑' 또는 떨어지는 말(이탈 · 깨지면 · 밑으로 …) + 파는 말(팔기 · 정리 · 던짐 …)
 *   목표: '목표 · 익절 · 수익 실현' 또는 오르는 말(도달 · 가면 · 돌파 …) + 파는 말
 *   매수 조건: 사는 말(사기 · 담기 · 줍기 · 진입 …) 또는 방향 없이 파는 말
 */
export function memoKind(t: string): "stop" | "target" | "condition" | null {
  if (/손절|손실\s*(?:컷|제한)|스탑|스톱/.test(t)) return "stop";
  if (/목표|익절|수익\s*실현|차익\s*실현/.test(t)) return "target";
  const sell = SELL_WORDS.test(t);
  if (sell && DOWN_WORDS.test(t)) return "stop";
  if (sell && UP_WORDS.test(t)) return "target";
  return sell || BUY_WORDS.test(t) ? "condition" : null;
}


export type StrategyKind = "buy" | "sell" | "stop" | "target" | "note";
const LABEL: Record<StrategyKind, string> = { buy: "매수", sell: "매도", stop: "손절", target: "목표", note: "메모" };
const ORDER: StrategyKind[] = ["buy", "sell", "stop", "target", "note"];
const BY_LABEL = new Map(Object.entries(LABEL).map(([k, v]) => [v, k as StrategyKind]));

/** 문장 하나가 어느 칸인지 (사는 말이면 매수, 파는 말이면 매도) */
export function strategyKind(t: string): StrategyKind {
  const k = memoKind(t);
  if (k === "stop" || k === "target") return k;
  if (k === "condition") return BUY_WORDS.test(t) ? "buy" : "sell";
  return "note";
}

/** 숫자 천 단위 쉼표 (243000 → 243,000) */
const comma = (t: string) => t.replace(/\d{4,}(?:\.\d+)?/g, (n) => Number(n).toLocaleString("ko-KR"));

export type StrategyItem = { kind: StrategyKind; text: string };

/**
 * 저장된 메모에서 투자자가 직접 쓴 전략 문장만
 *   빼는 것: AI 분석 문단('○○ 196,900원 기준.' 으로 시작 · '[AI 정리]'), 시나리오 줄, 자동 계획 줄([노트 종류] · [매수 조건] …)
 *   정리본 줄('- 매수: …')은 그 칸 그대로
 */
const AUTO_LINE = /^\[(?:현재가|AI 정리|노트 종류|방향|진입 근거|매수 조건|현재 판단|변경 사유|손절 기준|목표|비중|기준값|기한|계획 대비 차이|원인|다음에 바꿀 점)\]/;

export function ownItems(text: string): StrategyItem[] {
  const out: StrategyItem[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (/^\[AI 정리\]/.test(lines[0]) || /^\S.{0,40}\s[\d,.$]+원?\s*기준\.?$/.test(lines[0])) continue;
    for (let line of lines) {
      // 자동으로 붙는 줄(현재가 · 계획 칸 · AI 정리)과 시나리오 줄은 빼고, 다른 머리표([캘린더 노트 …] 등)는 떼고 문장으로
      if (AUTO_LINE.test(line) || /^(상승|하락) 시나리오\s*:/.test(line)) continue;
      line = line.replace(/^\[[^\]]*\]\s*/, "");
      if (!line) continue;
      const labeled = line.match(/^-\s*(매수|매도|손절|목표|메모)\s*:\s*(.+)$/);
      if (labeled) {
        out.push({ kind: BY_LABEL.get(labeled[1])!, text: labeled[2].trim() });
        continue;
      }
      for (const raw of line.replace(/^-\s*/, "").split(/(?<=[.!?。])\s+/)) {
        const t = comma(raw.trim().replace(/[.。]$/, ""));
        if (t) out.push({ kind: strategyKind(t), text: t });
      }
    }
  }
  return out;
}

/**
 * 쌓인 종목 전략(오래된 것부터) + 이번 Memo → 정리본
 *   이번 Memo 에 있는 칸(매수 · 매도 · 손절 · 목표)은 예전 문장을 빼고 이번 문장으로, 없는 칸은 예전 그대로. 메모 문장은 이어 붙임
 *   글은 '- 매수: …' 처럼 칸 이름을 붙여 한 줄에 하나
 */
export function consolidateStrategy(previous: string[], memo: string): { text: string; dropped: string[] } {
  const prev = previous.flatMap(ownItems);
  const next = ownItems(memo);
  const changed = new Set(next.filter((i) => i.kind !== "note").map((i) => i.kind));
  const dropped = prev.filter((i) => changed.has(i.kind)).map((i) => `${LABEL[i.kind]}: ${i.text}`);
  const kept = [...prev.filter((i) => !changed.has(i.kind)), ...next];
  const seen = new Set<string>();
  const uniq = kept.filter((i) => {
    const k = `${i.kind}:${i.text.replace(/\s/g, "")}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  const text = ORDER.flatMap((k) => uniq.filter((i) => i.kind === k).map((i) => `- ${LABEL[k]}: ${i.text}`)).join("\n");
  return { text, dropped: [...new Set(dropped)] };
}

/** 문장에서 가격 (243,000 · 243000 · 243,000원). 50% 같은 비율은 빼고 1,000 이상만 */
export function priceIn(t: string): number | null {
  const m = t.match(/(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

const AUTO = "(자동 · 그은 선 기준)";
const join = (cur: string, line: string) => (cur ? `${cur} / ${line}` : line);

/**
 * 매매 계획 빈 칸 채우기 (2026-11-19): 투자자가 정한 칸(가격)을 기준으로, 빈 칸만 그은 선에서
 *   매수가 있으면  손절 = 매수가 바로 아래 선, 목표 = 매수가 바로 위 선, 매도 = 목표와 같게
 *   매수 없이 매도 · 목표만 있으면 (보유 관리)  손절 = 지금 가격 바로 아래 선
 *   기준 가격에서 1% 안의 선은 같은 가격으로 보고 건너뜀
 *   아무것도 안 정했으면 채우지 않음 (매매 계획 없음 → 지지 · 저항 반응만 이행률)
 *   맞는 선이 없으면 지어내지 않고 빈 칸. 채운 칸은 '(자동 · 그은 선 기준)' 표시, 이행률에는 정한 칸과 똑같이 들어감
 */
export function autoFillPlan<P extends { condition: string; stop: string; target: string }>(p: P, linePrices: number[], money: (n: number) => string, current?: number): P & { auto: ("stop" | "target" | "sell")[] } {
  const parts = (s: string) => s.split(" / ").map((x) => x.trim()).filter(Boolean);
  const conds = parts(p.condition);
  const buy = conds.find((c) => strategyKind(c) === "buy");
  const sell = conds.find((c) => strategyKind(c) === "sell");
  const buyPx = buy ? priceIn(buy) : null;
  const sellPx = sell ? priceIn(sell) : null;
  const targetPx = p.target ? priceIn(p.target) : null;
  const prices = [...new Set(linePrices.filter((x) => x > 0))].sort((a, b) => a - b);
  // 기준 가격에서 1% 안의 선은 사실상 같은 가격이라 건너뜀
  const below = (x: number) => [...prices].reverse().find((v) => v < x * 0.99) ?? null;
  const above = (x: number) => prices.find((v) => v > x * 1.01) ?? null;
  const out = { ...p, auto: [] as ("stop" | "target" | "sell")[] };
  if (!buyPx && !sellPx && !targetPx) return out;
  if (buyPx) {
    let tgt = targetPx;
    if (!p.target) {
      const a = above(buyPx);
      if (a) {
        out.target = `${money(Math.round(a))} ${AUTO}`;
        out.auto.push("target");
        tgt = a;
      }
    }
    if (!p.stop) {
      const b = below(buyPx);
      if (b) {
        out.stop = `${money(Math.round(b))} 이탈 시 손절 ${AUTO}`;
        out.auto.push("stop");
      }
    }
    if (!sell && tgt) {
      out.condition = join(out.condition, `${money(Math.round(tgt))} 도달 시 매도 (자동 · 목표와 같게)`);
      out.auto.push("sell");
    }
    return out;
  }
  // 매수 없이 매도 · 목표만 (보유 관리): 손절만, 지금 가격(없으면 그 가격) 바로 아래 선으로
  const ref = current && current > 0 ? current : Math.min(...[sellPx, targetPx].filter((x): x is number => !!x));
  if (!p.stop) {
    const b = below(ref);
    if (b) {
      out.stop = `${money(Math.round(b))} 이탈 시 손절 ${AUTO}`;
      out.auto.push("stop");
    }
  }
  return out;
}
