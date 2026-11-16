"use client";

import { useState } from "react";
import type { AiTask } from "../../lib/types/ai";
import OrderPreviewModal from "./OrderPreviewModal";

type Props = {
  task: AiTask;
  pending: boolean;
  error?: string | null;
  /** 동의 체크 후 승인 → 주문까지. true면 모달을 닫는다 */
  onApprove: () => Promise<boolean>;
};

/**
 * 주문 승인 진입점. 아래 조건을 모두 만족해야만 버튼이 보인다 (전부 서버 응답 기준):
 *  - 작업이 WAITING_APPROVAL
 *  - 서버 AI 주문 기능이 켜져 있음 (task.trading.enabled)
 *  - 위험 검증 통과 (task.validation.allowed)
 *  - 서버가 만든 주문 미리보기가 있음, HOLD 아님
 */
export default function OrderApprovalPanel({ task, pending, error, onApprove }: Props) {
  const [open, setOpen] = useState(false);
  const preview = task.orderPreview;
  const hold = task.analysis?.action === "HOLD";

  let blocked: string | null = null;
  if (hold) blocked = null; // 관망은 버튼 자체를 안 보여줌
  else if (task.validation && !task.validation.allowed) blocked = "위험 검증을 통과하지 못해 주문할 수 없어요.";
  else if (task.trading && !task.trading.enabled) blocked = "서버에서 AI 주문이 꺼져 있어요 (AI_TRADING_ENABLED). 분석만 볼 수 있어요.";

  const canApprove = !hold && !blocked && task.status === "WAITING_APPROVAL" && preview && task.validation?.allowed && task.trading?.enabled;

  if (hold) return <p className="ai-note">관망 제안이라 주문으로 넘어가지 않아요.</p>;
  return (
    <div className="ai-approval">
      {blocked && <p className="ai-note">{blocked}</p>}
      {canApprove && (
        <button className="ai-btn primary" onClick={() => setOpen(true)}>
          주문 미리보기
        </button>
      )}
      {open && preview && (
        <OrderPreviewModal
          preview={preview}
          pending={pending}
          error={error}
          onClose={() => setOpen(false)}
          onConfirm={async () => {
            if (await onApprove()) setOpen(false);
          }}
        />
      )}
    </div>
  );
}
