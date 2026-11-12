"use client";
// AI 분석 요청 → taskId 보관 → 상태 조회(useAiTaskStatus)
import { useCallback, useState } from "react";
import { requestAnalysis } from "../lib/api/ai";
import { errorMessage } from "../lib/api/client";
import type { AnalyzeRequest } from "../lib/types/ai";
import { useAiTaskStatus } from "./useAiTaskStatus";

export function useAiAnalysis() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { task, error: pollError, resume } = useAiTaskStatus(taskId);

  const request = useCallback(async (body: AnalyzeRequest) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { taskId: id } = await requestAnalysis(body);
      setTaskId(id);
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setTaskId(null);
    setSubmitError(null);
  }, []);

  return { taskId, task, submitting, error: submitError ?? pollError, request, reset, resume };
}
