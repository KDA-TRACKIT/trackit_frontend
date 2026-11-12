"use client";

import { useEffect, useRef, useState } from "react";
import { useAiAnalysis } from "../../hooks/useAiAnalysis";
import { useOrderApproval } from "../../hooks/useOrderApproval";
import { useOrderExecution } from "../../hooks/useOrderExecution";
import { USE_MOCK_TRADING } from "../../lib/api/client";
import { mockTradingEnabled, setMockTradingEnabled } from "../../lib/api/mock/trading-server";
import type { AnalyzeRequest } from "../../lib/types/ai";
import type { ChartDrawing } from "../../lib/types/chart";
import type { BrokerAccount, OrderResult } from "../../lib/types/trading";
import AccountSelector from "../trading/AccountSelector";
import OrderApprovalPanel from "../trading/OrderApprovalPanel";
import OrderResultCard from "../trading/OrderResultCard";
import AiResultCard from "./AiResultCard";
import AiTaskStatus from "./AiTaskStatus";
import RiskValidationCard from "./RiskValidationCard";

type Props = {
  symbol: { code: string; name: string; market: string };
  timeframe: string;
  journalId?: string;
  journalContent: string;
  drawings: ChartDrawing[];
  /** 매매일지 입력 영역 (화면 쪽에서 넣음) */
  journalSlot: React.ReactNode;
  onFilled: (order: OrderResult) => void;
  onClose: () => void;
};

/**
 * 차트·일지 → AI 분석 요청 → 진행 상태 → 결과 카드 → 위험 검증 → 주문 미리보기·승인 → 주문 결과
 * AI 결과가 곧바로 주문이 되지 않는다. 승인 API는 모달에서 동의 체크 후에만 부른다.
 */
export default function AiAnalysisPanel({ symbol, timeframe, journalId, journalContent, drawings, journalSlot, onFilled, onClose }: Props) {
  const [account, setAccount] = useState<BrokerAccount | null>(null);
  const [mockTrading, setMockTrading] = useState(() => (USE_MOCK_TRADING ? mockTradingEnabled() : false));
  const [lastRequest, setLastRequest] = useState<AnalyzeRequest | null>(null);
  const analysis = useAiAnalysis();
  const approval = useOrderApproval();
  const execution = useOrderExecution();
  const { task } = analysis;

  // 체결되면 노트 검증 창에 연결 (한 주문에 한 번)
  const reported = useRef<string | null>(null);
  useEffect(() => {
    const o = execution.order;
    if (o && o.status === "FILLED" && reported.current !== o.orderId) {
      reported.current = o.orderId;
      onFilled(o);
    }
  }, [execution.order, onFilled]);

  function submit(body?: AnalyzeRequest) {
    const req: AnalyzeRequest = body ?? {
      kind: "CHART",
      symbol: symbol.code,
      market: symbol.market || "KRX",
      timeframe,
      journalId,
      accountId: account?.id,
      journalContent,
      drawings,
    };
    setLastRequest(req);
    approval.reset();
    execution.reset();
    analysis.request(req);
  }

  async function approveAndExecute() {
    if (!task?.orderPreview) return false;
    const ok = await approval.approve(task.taskId, task.orderPreview);
    if (!ok) return false;
    const placed = await execution.execute(ok.approvalId);
    analysis.resume(); // 작업 상태(EXECUTING → SUCCEEDED) 다시 조회
    return placed !== null;
  }

  const status = task?.status ?? (analysis.submitting ? "QUEUED" : "IDLE");
  const busy = analysis.submitting || status === "QUEUED" || status === "RUNNING" || status === "VALIDATING" || status === "EXECUTING";
  const hold = task?.analysis?.action === "HOLD";
  const validationLabel = hold ? "해당 없음 (관망)" : !task?.validation ? (status === "VALIDATING" ? "검증 중" : "대기") : task.validation.allowed ? (task.validation.warnings.length ? "통과 (경고)" : "통과") : "차단";

  return (
    <section className="ws-panel ai-panel" aria-label="AI 분석">
      <div className="ai-panel-head">
        <h2>
          AI 차트 분석 {USE_MOCK_TRADING && <span className="ai-mock">모의 서버</span>}
        </h2>
        <button className="ai-close" onClick={onClose} aria-label="AI 분석 닫기">
          ✕
        </button>
      </div>

      {journalSlot}

      <div className="ai-request">
        <AccountSelector value={account?.id ?? null} onChange={setAccount} />
        <p className="ai-note">
          {symbol.name} · {timeframe} 차트, 드로잉 {drawings.length}개{journalContent.trim() ? ", 매매일지" : ""}를 함께 보내요.
        </p>
        <button className="ai-btn primary wide" onClick={() => submit()} disabled={busy}>
          {busy ? "분석 진행 중…" : task ? "다시 분석 요청" : "AI 분석 요청"}
        </button>
        {USE_MOCK_TRADING && (
          <label className="ai-dev-flag" title="모의 서버의 AI_TRADING_ENABLED 값. 실제 백엔드에 연결하면 이 설정은 사라져요.">
            <input
              type="checkbox"
              checked={mockTrading}
              onChange={(e) => {
                setMockTradingEnabled(e.target.checked);
                setMockTrading(e.target.checked);
              }}
            />
            모의 서버 설정: AI 주문 허용 (AI_TRADING_ENABLED)
          </label>
        )}
      </div>

      <AiTaskStatus status={status} error={task?.error?.message ?? (status === "IDLE" ? analysis.error : null)} onRetry={lastRequest ? () => submit(lastRequest) : undefined} />
      {analysis.error && status !== "IDLE" && status !== "FAILED" && <p className="ai-note error">{analysis.error}</p>}

      {task?.analysis && (
        <AiResultCard analysis={task.analysis} symbolName={symbol.name} analyzedAt={task.analyzedAt} model={task.model} validationLabel={validationLabel} />
      )}
      {task?.validation && <RiskValidationCard validation={task.validation} />}
      {task?.analysis && (task.validation || (hold && task.status === "SUCCEEDED")) && !execution.order && (
        <OrderApprovalPanel task={task} pending={approval.pending || execution.pending} error={approval.error ?? execution.error} onApprove={approveAndExecute} />
      )}
      {execution.order && <OrderResultCard order={execution.order} onRestart={() => submit()} />}
      {execution.error && execution.order && <p className="ai-note error">{execution.error}</p>}

      <small className="ai-footnote">AI 제안은 참고용이에요. 주문은 백엔드 검증과 직접 승인을 거쳐야만 나가요.</small>
    </section>
  );
}
