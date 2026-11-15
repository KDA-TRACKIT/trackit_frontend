"use client";
// 마이페이지 · 증권사 연결: 키움 앱키·시크릿으로 계좌를 연결하면 매매 창에서 그 계좌로 주문할 수 있다
// 키 값은 입력 즉시 백엔드로만 보내고 화면·브라우저에 남기지 않는다
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../lib/api/client";
import { connectBroker, disconnectBroker, listConnections, type BrokerConnection } from "../../lib/api/orders";

export default function BrokerSection() {
  const [list, setList] = useState<BrokerConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ appKey: "", appSecret: "", mode: "mock" as "mock" | "real", openedAt: "", label: "" });

  const load = useCallback(() => {
    listConnections()
      .then((data) => {
        setList(data);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await connectBroker({ ...form, label: form.label || undefined });
      setForm({ appKey: "", appSecret: "", mode: "mock", openedAt: "", label: "" }); // 키는 바로 지운다
      setAdding(false);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: BrokerConnection) {
    if (!window.confirm(`${c.broker.name} ${c.label ?? ""} 연결을 끊을까요? 이 계좌로는 더 주문할 수 없어요.`)) return;
    try {
      await disconnectBroker(c.id);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="mypage-broker">
      <div className="mypage-broker-head">
        <h2>증권사 연결</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}>
            + 키움 계좌 연결
          </button>
        )}
      </div>
      <p className="mypage-muted">연결한 계좌로 매매 창에서 주문할 수 있어요. 처음엔 모의투자 계좌로 시험해 보세요.</p>

      {list === null && !error && <p className="mypage-muted">불러오는 중…</p>}
      {list && list.length === 0 && !adding && <p className="mypage-muted">연결한 계좌가 없어요.</p>}
      {list?.map((c) => (
        <div key={c.id} className="mypage-conn">
          <div>
            <strong>
              {c.broker.name} {c.label ?? ""} <em className={c.mode}>{c.mode === "mock" ? "모의" : "실전"}</em>
            </strong>
            <small>{c.accounts.map((a) => `${a.accountNoMasked}${a.status === "ACTIVE" ? "" : ` (${a.status})`}`).join(", ") || "계좌 없음"}</small>
          </div>
          <button type="button" onClick={() => void remove(c)}>
            연결 끊기
          </button>
        </div>
      ))}

      {adding && (
        <form className="mypage-conn-form" onSubmit={(e) => void submit(e)} autoComplete="off">
          <label>
            <span>구분</span>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as "mock" | "real" })}>
              <option value="mock">모의투자</option>
              <option value="real">실전투자</option>
            </select>
          </label>
          <label>
            <span>앱키</span>
            <input value={form.appKey} onChange={(e) => setForm({ ...form, appKey: e.target.value })} required spellCheck={false} />
          </label>
          <label>
            <span>시크릿</span>
            <input type="password" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} required autoComplete="new-password" />
          </label>
          <label>
            <span>계좌 개설일</span>
            <input type="date" value={form.openedAt} onChange={(e) => setForm({ ...form, openedAt: e.target.value })} required />
          </label>
          <label>
            <span>이름 (선택)</span>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={50} placeholder="예: 연습 계좌" />
          </label>
          <small className="mypage-muted">앱키·시크릿은 키움 OpenAPI 사이트에서 발급해요. 서버로만 보내고 이 브라우저에는 저장하지 않아요.</small>
          <div>
            <button type="button" onClick={() => setAdding(false)} disabled={busy}>
              취소
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "확인 중…" : "연결"}
            </button>
          </div>
        </form>
      )}
      {error && <p className="mypage-error">{error}</p>}
    </section>
  );
}
