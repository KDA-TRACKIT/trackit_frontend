"use client";
// 주문 실행: 승인 id로 POST /trading/orders, 이후 체결·실패까지 조회. 실패해도 자동으로 다시 주문하지 않는다
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/api/client";
import { getOrder, placeOrder } from "../lib/api/trading";
import { ORDER_SETTLED, type OrderResult } from "../lib/types/trading";

export function useOrderExecution(intervalMs = 2000) {
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const follow = useCallback(
    function follow(orderId: string) {
      timer.current = setTimeout(async () => {
        try {
          const next = await getOrder(orderId);
          if (!alive.current) return;
          setOrder(next);
          if (!ORDER_SETTLED.has(next.status)) follow(orderId);
        } catch (e) {
          if (alive.current) setError(errorMessage(e));
        }
      }, intervalMs);
    },
    [intervalMs],
  );

  const execute = useCallback(
    async (approvalId: string) => {
      setPending(true);
      setError(null);
      try {
        const placed = await placeOrder(approvalId);
        if (!alive.current) return null;
        setOrder(placed);
        if (!ORDER_SETTLED.has(placed.status)) follow(placed.orderId);
        return placed;
      } catch (e) {
        if (alive.current) setError(errorMessage(e));
        return null;
      } finally {
        if (alive.current) setPending(false);
      }
    },
    [follow],
  );

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOrder(null);
    setError(null);
  }, []);

  return { order, pending, error, execute, reset };
}
