"use client";
// 투자 정보 칸들이 같이 쓰는 불러오기: 불러오는 중 · 오류 · 다시 시도 · (선택) 계속 새로고침
//   refresh: 숫자(ms) 또는 받은 값을 보고 정하는 함수 (예: 장중이면 10초, 장 끝나면 2분). null/0 이면 멈춤
//   탭이 안 보이는 동안은 부르지 않고, 다시 보이거나 창에 돌아오거나 인터넷이 다시 붙으면 오래된 값이면 바로 새로
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../lib/api/client";

export type Refresh<T> = number | null | ((data: T | null) => number | null);

export function useLoad<T>(key: string, load: () => Promise<T>, refresh?: Refresh<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: string; at: number } | null>(null);
  const reqKey = `${key}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setResult({ key: reqKey, data, at: Date.now() }))
      .catch((e) => !cancelled && setResult({ key: reqKey, error: errorMessage(e), at: Date.now() }));
    return () => {
      cancelled = true;
    };
    // load 는 key 가 바뀔 때만 다시 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const current = result?.key === reqKey ? result : null;
  const prefix = `${key}:`;
  const data = current?.data ?? (result?.key.startsWith(prefix) ? (result.data ?? null) : null);

  // 다음 새로고침 간격 (매 렌더의 최신 값으로)
  const refreshRef = useRef(refresh);
  const dataRef = useRef(data);
  useEffect(() => {
    refreshRef.current = refresh;
    dataRef.current = data;
  });
  const intervalOf = () => {
    const r = refreshRef.current;
    return (typeof r === "function" ? r(dataRef.current) : r) || 0;
  };

  // 받기가 끝나면 다음 차례 예약 (받는 중에는 겹쳐 부르지 않음)
  const doneAt = current?.at;
  useEffect(() => {
    if (!doneAt) return;
    const ms = intervalOf();
    if (!ms) return;
    const t = setTimeout(() => {
      // 안 보이는 탭이면 미뤄 두고, 보이게 될 때 아래 effect 가 새로 부름
      if (!document.hidden) setAttempt((n) => n + 1);
    }, ms);
    return () => clearTimeout(t);
  }, [doneAt]);

  // 다시 보일 때 · 창에 돌아올 때 · 인터넷이 다시 붙을 때: 값이 간격보다 오래됐으면 바로
  useEffect(() => {
    if (!refresh) return;
    const wake = () => {
      if (document.hidden) return;
      const ms = intervalOf();
      if (ms && doneAt && Date.now() - doneAt >= ms) setAttempt((n) => n + 1);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!refresh, doneAt]);

  return {
    /** 지금 요청의 결과, 없으면 같은 key 의 예전 결과 (새로고침 중 깜빡이지 않게) */
    data,
    error: current?.error ?? null,
    loading: !current,
    /** 마지막으로 받은 시각 */
    updatedAt: result?.key.startsWith(prefix) ? result.at : null,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
