// 모의 백엔드 (AI 분석 → 위험 검증 → 승인 → 주문). 실제 API가 생기면 이 파일은 지운다.
// 실제 서버처럼 상태를 서버 쪽(여기)에서만 바꾸고, 화면은 조회 결과만 본다.
// 실제 주문·외부 AI 호출은 하지 않는다.
import { fetchBars, searchSymbols } from "../../market-data";
import { makeBars, type Bar } from "../../mock/workshop";
import type { AiTask, AnalyzeRequest, TradeAnalysis } from "../../types/ai";
import type { ApprovalRequest, BrokerAccount, OrderPreview, OrderResult, RiskValidation, TradeApproval } from "../../types/trading";
import { ApiError } from "../client";

/** 모의 서버 설정. AI_TRADING_ENABLED 기본값처럼 주문은 꺼져 있음. 화면의 "모의 서버 설정"으로만 켬 */
const FLAG_KEY = "trackit:mock-trading";
export function mockTradingEnabled() {
  return typeof window !== "undefined" && localStorage.getItem(FLAG_KEY) === "on";
}
export function setMockTradingEnabled(on: boolean) {
  localStorage.setItem(FLAG_KEY, on ? "on" : "off");
}

const LIMITS = { maxOrderAmount: 100_000, dailyLossLimit: 50_000, feeRate: 0.0035 };
export const MOCK_ACCOUNT: BrokerAccount = { id: "mock-account", label: "키움 모의 ****-12", mode: "mock", brokerName: "키움증권" };
const MOCK_CASH = 1_000_000;

type TaskRow = { task: AiTask; req: AnalyzeRequest; bornAt: number; plan: Pick<AiTask, "analysis" | "validation" | "orderPreview" | "error"> | null; orderId?: string };
const tasks = new Map<string, TaskRow>();
const approvals = new Map<string, TradeApproval & { preview: OrderPreview }>();
const orders = new Map<string, { result: OrderResult; bornAt: number; taskId: string }>();

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const won = (n: number) => n.toLocaleString("ko-KR");

async function loadBars(symbol: string): Promise<Bar[]> {
  try {
    return (await fetchBars(symbol, "1d")).bars;
  } catch {
    return symbol === "005930" ? makeBars("1d") : [];
  }
}

/** 간단한 규칙으로 AI 분석 흉내: 20봉 평균 대비 위치 + 최근 5봉 흐름 */
function analyze(req: AnalyzeRequest, bars: Bar[]): TradeAnalysis {
  const last = bars[bars.length - 1];
  const ma20 = bars.slice(-20).reduce((s, b) => s + b.close, 0) / 20;
  const gap = (last.close - ma20) / ma20;
  const base = bars[bars.length - 6].close;
  const momentum = (last.close - base) / base;
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
  const action: TradeAnalysis["action"] = gap > 0.01 && momentum > 0 ? "BUY" : gap < -0.01 && momentum < 0 ? "SELL" : "HOLD";
  const context = [req.drawings.length ? `드로잉 ${req.drawings.length}개` : "", req.journalContent?.trim() ? "작성한 매매일지" : ""].filter(Boolean).join("와 ");
  const reason =
    action === "BUY"
      ? `종가가 20일 평균보다 ${pct(gap)} 위에 있고 최근 5일 ${pct(momentum)} 올랐어요. 20일 평균을 손절 기준으로 둔 진입을 제안해요.`
      : action === "SELL"
        ? `종가가 20일 평균보다 ${pct(gap)} 아래이고 최근 5일 ${pct(momentum)} 내렸어요. 보유 중이면 비중 축소를 제안해요.`
        : `20일 평균과 차이(${pct(gap)})가 작고 방향(${pct(momentum)})이 뚜렷하지 않아요. 관망을 제안해요.`;
  return {
    action,
    symbol: req.symbol,
    price: String(last.close),
    quantity: action === "HOLD" ? undefined : String(Math.max(1, Math.floor(LIMITS.maxOrderAmount / last.close))),
    confidence: Math.round(Math.min(0.92, 0.42 + Math.abs(gap) * 4 + Math.abs(momentum) * 2) * 100) / 100,
    rationale: context ? `${reason} ${context}도 함께 반영했어요.` : reason,
  };
}

/** 백엔드 위험 검증 흉내: 1회 한도 · 잔고 · 보유 수량 · 신뢰도 */
function validate(a: TradeAnalysis): RiskValidation {
  const price = Number(a.price ?? 0);
  const qty = Number(a.quantity ?? 0);
  const amount = price * qty;
  const fee = Math.round(amount * LIMITS.feeRate);
  const position = 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (amount > LIMITS.maxOrderAmount) errors.push(`1회 주문 한도 ${won(LIMITS.maxOrderAmount)}원을 넘어요 (${won(amount)}원).`);
  if (a.action === "BUY" && amount + fee > MOCK_CASH) errors.push("주문 가능 금액이 부족해요.");
  if (a.action === "SELL" && qty > position) errors.push(`매도할 보유 수량이 없어요 (보유 ${position}주).`);
  if (a.confidence < 0.6) warnings.push(`AI 신뢰도가 ${Math.round(a.confidence * 100)}%로 낮아요.`);
  warnings.push("모의 계좌 기준 수수료 0.35%를 적용했어요.");
  return {
    allowed: errors.length === 0,
    warnings,
    errors,
    estimatedAmount: String(amount),
    estimatedFee: String(fee),
    currentBalance: String(MOCK_CASH),
    currentPosition: String(position),
    dailyLossLimit: String(LIMITS.dailyLossLimit),
  };
}

function preview(req: AnalyzeRequest, a: TradeAnalysis, v: RiskValidation, symbolName: string): OrderPreview {
  const amount = Number(v.estimatedAmount ?? 0);
  const fee = Number(v.estimatedFee ?? 0);
  return {
    accountId: req.accountId ?? MOCK_ACCOUNT.id,
    accountLabel: MOCK_ACCOUNT.label,
    symbol: req.symbol,
    symbolName,
    side: a.action === "SELL" ? "SELL" : "BUY",
    quantity: a.quantity ?? "0",
    orderType: "LIMIT",
    price: a.price,
    estimatedAmount: String(amount),
    estimatedFee: String(fee),
    currentBalance: String(MOCK_CASH),
    balanceAfter: String(a.action === "SELL" ? MOCK_CASH + amount - fee : MOCK_CASH - amount - fee),
    warnings: v.warnings,
    rationale: a.rationale,
  };
}

/** 나이(ms)에 따라 큐 → 분석 → 검증 → 결과 로 넘어가는 것처럼 보이게 */
function advance(row: TaskRow) {
  const age = Date.now() - row.bornAt;
  const t = row.task;
  if (t.status === "QUEUED" && age > 900) t.status = "RUNNING";
  if (t.status === "RUNNING" && age > 3200 && row.plan) {
    if (row.plan.error) Object.assign(t, { status: "FAILED", error: row.plan.error });
    else Object.assign(t, { status: "VALIDATING", analysis: row.plan.analysis, analyzedAt: new Date().toISOString(), model: "mock-gemini-2.5-flash" });
  }
  if (t.status === "VALIDATING" && age > 4600 && row.plan) {
    const enabled = mockTradingEnabled();
    t.trading = { enabled, requireApproval: true };
    // 관망이면 주문이 없으므로 위험 검증도 하지 않는다
    t.validation = t.analysis?.action === "HOLD" ? undefined : row.plan.validation;
    const canOrder = t.analysis?.action !== "HOLD" && t.validation?.allowed && enabled;
    t.orderPreview = t.analysis?.action !== "HOLD" ? row.plan.orderPreview : undefined;
    t.status = canOrder ? "WAITING_APPROVAL" : "SUCCEEDED";
  }
}

// ---------------------------------------------------------------- "엔드포인트"

export async function postAnalyze(req: AnalyzeRequest): Promise<{ taskId: string }> {
  await delay(200);
  const running = [...tasks.values()].find((r) => r.req.symbol === req.symbol && ["QUEUED", "RUNNING", "VALIDATING"].includes(r.task.status));
  if (running) throw new ApiError(409, "TASK_IN_PROGRESS", "같은 종목 분석이 이미 진행 중이에요.");
  const taskId = uid("task");
  const row: TaskRow = { task: { taskId, kind: req.kind, status: "QUEUED", symbol: req.symbol, createdAt: new Date().toISOString() }, req, bornAt: Date.now(), plan: null };
  tasks.set(taskId, row);
  // 워커가 뒤에서 분석하는 것처럼 미리 계산해 둔다
  Promise.all([loadBars(req.symbol), searchSymbols(req.symbol).catch(() => [])]).then(([bars, found]) => {
    const name = found.find((x) => x.code === req.symbol)?.name ?? req.symbol;
    if (bars.length < 21) {
      row.plan = { error: { code: "NOT_ENOUGH_DATA", message: "일봉이 20개보다 적어서 분석할 수 없어요." } };
      return;
    }
    const analysis = analyze(req, bars);
    const validation = validate(analysis);
    row.plan = { analysis, validation, orderPreview: preview(req, analysis, validation, name) };
  });
  return { taskId };
}

export async function getTask(taskId: string): Promise<AiTask> {
  await delay(120);
  const row = tasks.get(taskId);
  if (!row) throw new ApiError(404, "NOT_FOUND", "분석 작업을 찾을 수 없어요.");
  advance(row);
  if (row.task.status === "EXECUTING" && row.orderId) {
    const order = orders.get(row.orderId);
    if (order) {
      advanceOrder(order);
      if (["FILLED", "CANCELED", "FAILED"].includes(order.result.status)) row.task.status = "SUCCEEDED";
    }
  }
  return structuredClone(row.task);
}

export async function postApproval(body: ApprovalRequest): Promise<TradeApproval> {
  await delay(200);
  const row = tasks.get(body.taskId);
  if (!row) throw new ApiError(404, "NOT_FOUND", "분석 작업을 찾을 수 없어요.");
  if (!mockTradingEnabled()) throw new ApiError(403, "TRADING_DISABLED", "서버에서 AI 주문이 꺼져 있어요 (AI_TRADING_ENABLED).");
  if (body.confirmed !== true) throw new ApiError(422, "NOT_CONFIRMED", "주문 내용 확인에 동의해야 해요.");
  if (row.task.status !== "WAITING_APPROVAL" || !row.task.orderPreview) throw new ApiError(409, "NOT_WAITING", "승인할 수 있는 상태가 아니에요.");
  const p = row.task.orderPreview;
  // 서버는 미리보기와 다른 주문 파라미터를 거절한다
  if (body.accountId !== p.accountId || body.symbol !== p.symbol || body.side !== p.side || body.quantity !== p.quantity || body.orderType !== p.orderType || body.price !== p.price) {
    throw new ApiError(422, "PREVIEW_MISMATCH", "미리보기와 다른 주문 내용이에요. 다시 분석해 주세요.");
  }
  const approval = { approvalId: uid("apv"), taskId: body.taskId, status: "APPROVED" as const, createdAt: new Date().toISOString(), preview: p };
  approvals.set(approval.approvalId, approval);
  return { approvalId: approval.approvalId, taskId: approval.taskId, status: approval.status, createdAt: approval.createdAt };
}

function advanceOrder(entry: { result: OrderResult; bornAt: number }) {
  const age = Date.now() - entry.bornAt;
  const r = entry.result;
  if (r.status === "SUBMITTED" && age > 1500) Object.assign(r, { status: "PARTIALLY_FILLED", filledQuantity: String(Math.ceil(Number(r.quantity) / 2)) });
  if (r.status === "PARTIALLY_FILLED" && age > 3200) Object.assign(r, { status: "FILLED", filledQuantity: r.quantity, message: "모의 체결됐어요. 실제 증권사 주문은 나가지 않았어요." });
}

export async function postOrder(body: { approvalId: string }): Promise<OrderResult> {
  await delay(250);
  const approval = approvals.get(body.approvalId);
  if (!approval) throw new ApiError(404, "NOT_FOUND", "승인 내역을 찾을 수 없어요.");
  if ([...orders.values()].some((o) => o.taskId === approval.taskId)) throw new ApiError(409, "ALREADY_ORDERED", "이 승인으로 이미 주문했어요.");
  const p = approval.preview;
  const result: OrderResult = { orderId: uid("ord"), status: "SUBMITTED", symbol: p.symbol, side: p.side, quantity: p.quantity, price: p.price, createdAt: new Date().toISOString() };
  orders.set(result.orderId, { result, bornAt: Date.now(), taskId: approval.taskId });
  const row = tasks.get(approval.taskId);
  if (row) {
    row.task.status = "EXECUTING";
    row.orderId = result.orderId;
  }
  return structuredClone(result);
}

export async function getOrder(orderId: string): Promise<OrderResult> {
  await delay(120);
  const entry = orders.get(orderId);
  if (!entry) throw new ApiError(404, "NOT_FOUND", "주문을 찾을 수 없어요.");
  advanceOrder(entry);
  return structuredClone(entry.result);
}
