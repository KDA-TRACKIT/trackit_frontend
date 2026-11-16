"use client";

import { useEffect, useState } from "react";
import { listAccounts } from "../../lib/api/brokers";
import { errorMessage } from "../../lib/api/client";
import type { BrokerAccount } from "../../lib/types/trading";

/** 주문할 증권사 계좌 선택 (GET /brokers/connections) */
export default function AccountSelector({ value, onChange }: { value: string | null; onChange: (account: BrokerAccount) => void }) {
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAccounts()
      .then((list) => {
        if (cancelled) return;
        setAccounts(list);
        if (list[0]) onChange(list[0]);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="ai-note error">계좌를 불러오지 못했어요: {error}</p>;
  if (accounts.length === 0) return <p className="ai-note">연결된 증권사 계좌가 없어요.</p>;
  return (
    <label className="ai-field">
      <span>계좌</span>
      <select value={value ?? ""} onChange={(e) => {
        const next = accounts.find((a) => a.id === e.target.value);
        if (next) onChange(next);
      }}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </label>
  );
}
