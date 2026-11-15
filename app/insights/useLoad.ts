"use client";
// 투자 정보 칸들이 같이 쓰는 불러오기: 불러오는 중 · 오류 · 다시 시도 · (선택) 주기적 새로고침
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../lib/api/client";

export function useLoad<T>(key: string, load: () => Promise<T>, refreshMs?: number) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const reqKey = `${key}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setResult({ key: reqKey, data }))
      .catch((e) => !cancelled && setResult({ key: reqKey, error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
    // load 는 key 가 바뀔 때만 다시 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => setAttempt((n) => n + 1), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);

  const current = result?.key === reqKey ? result : null;
  const prefix = `${key}:`;
  return {
    /** 지금 요청의 결과, 없으면 같은 key 의 예전 결과 (새로고침 중 깜빡이지 않게) */
    data: current?.data ?? (result?.key.startsWith(prefix) ? (result.data ?? null) : null),
    error: current?.error ?? null,
    loading: !current,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
