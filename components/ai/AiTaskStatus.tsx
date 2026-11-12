import type { AiTaskStatus as Status } from "../../lib/types/ai";

const STEPS: { status: Status; label: string }[] = [
  { status: "QUEUED", label: "접수" },
  { status: "RUNNING", label: "AI 분석" },
  { status: "VALIDATING", label: "위험 검증" },
  { status: "WAITING_APPROVAL", label: "승인 대기" },
  { status: "EXECUTING", label: "주문 실행" },
  { status: "SUCCEEDED", label: "완료" },
];

const MESSAGE: Record<Status, string> = {
  IDLE: "분석을 요청하면 진행 상황이 여기에 보여요.",
  QUEUED: "분석 요청이 접수됐어요.",
  RUNNING: "AI가 차트와 일지를 분석하고 있어요.",
  VALIDATING: "백엔드가 위험 검증을 하고 있어요.",
  WAITING_APPROVAL: "주문 승인을 기다리고 있어요.",
  EXECUTING: "주문을 실행하고 있어요.",
  SUCCEEDED: "완료됐어요.",
  FAILED: "분석에 실패했어요.",
  CANCELED: "취소됐어요.",
};

/** 분석 작업 진행 단계 표시 */
export default function AiTaskStatus({ status, error, onRetry }: { status: Status; error?: string | null; onRetry?: () => void }) {
  const index = STEPS.findIndex((s) => s.status === status);
  const busy = status === "QUEUED" || status === "RUNNING" || status === "VALIDATING" || status === "EXECUTING";
  return (
    <div className={`ai-status ${status.toLowerCase()}`} aria-live="polite">
      {status !== "IDLE" && status !== "FAILED" && status !== "CANCELED" && (
        <ol className="ai-steps">
          {STEPS.map((s, i) => (
            <li key={s.status} className={i < index ? "done" : i === index ? "now" : ""}>
              <i />
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="ai-status-text">
        {busy && <span className="ai-spinner" aria-hidden />}
        {MESSAGE[status]}
      </p>
      {status === "FAILED" && (
        <div className="ai-fail">
          {error && <p>{error}</p>}
          {onRetry && (
            <button className="ai-btn" onClick={onRetry}>
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}
