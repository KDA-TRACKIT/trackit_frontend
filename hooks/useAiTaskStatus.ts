"use client";
// AI 작업 상태 조회. 지금은 2.5초 polling, 나중에 SSE/WebSocket 으로 바꿀 때 이 hook 안만 고치면 된다.
import { useCallback, useEffect, useState } from "react";
import { getAiTask } from "../lib/api/ai";
import { errorMessage } from "../lib/api/client";
import { TASK_SETTLED, type AiTask } from "../lib/types/ai";

export function useAiTaskStatus(taskId: string | null, intervalMs = 2500) {
  const [task, setTask] = useState<AiTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 같은 taskId로 조회를 다시 시작할 때(승인 뒤 실행 상태 추적) 올리는 값
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!taskId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await getAiTask(taskId);
        if (stopped) return;
        setTask(next);
        setError(null);
        if (TASK_SETTLED.has(next.status)) return; // 완료·실패·취소·승인 대기면 멈춤
      } catch (e) {
        if (stopped) return;
        setError(errorMessage(e));
      }
      timer = setTimeout(tick, intervalMs);
    };
    tick();
    // 화면을 떠나거나 taskId가 바뀌면 조회 정리
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId, intervalMs, round]);

  /** 승인·주문 뒤처럼 서버 상태가 다시 바뀔 때 조회 재개 */
  const resume = useCallback(() => setRound((n) => n + 1), []);
  const current = taskId && task?.taskId === taskId ? task : null;
  return { task: current, error: taskId ? error : null, resume };
}
