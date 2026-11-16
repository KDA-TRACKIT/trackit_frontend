"use client";
// 최종 승인: 백엔드 미리보기 값을 그대로 POST /trading/approvals 로 보낸다
import { useCallback, useState } from "react";
import { errorMessage } from "../lib/api/client";
import { approvalFromPreview, createApproval } from "../lib/api/trading";
import type { OrderPreview, TradeApproval } from "../lib/types/trading";

export function useOrderApproval() {
  const [approval, setApproval] = useState<TradeApproval | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = useCallback(async (taskId: string, preview: OrderPreview) => {
    setPending(true);
    setError(null);
    try {
      const result = await createApproval(approvalFromPreview(taskId, preview));
      setApproval(result);
      return result;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setApproval(null);
    setError(null);
  }, []);

  return { approval, pending, error, approve, reset };
}
