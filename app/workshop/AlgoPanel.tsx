"use client";
// 매매 창 > 알고리즘 탭: 이 종목에 건 규칙 목록 · 실행/중지 · 새 버전 · 최근 신호
// 규칙 실행과 주문은 백엔드 작업 프로그램(npm run algo)이 키움 실시간 시세로 한다. 화면은 설정·상태만
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAlgoCatalog, getRule, listAlgoAccounts, listRules, setRuleStatus } from "../../lib/api/algo";
import { accessToken, errorMessage } from "../../lib/api/client";
import { STRATEGY_LABEL, describeRule } from "../../lib/algo-text";
import type { AlgoCatalog, TradingRule, TradingRuleDetail } from "../../lib/types/algo";
import AlgoRuleEditor from "./AlgoRuleEditor";

const SIGNAL_STATUS: Record<string, string> = { PENDING: "대기", SUBMITTED: "주문 접수", FAILED: "실패", SKIPPED: "건너뜀" };
const REASON: Record<string, string> = { ENTRY: "진입", EXIT: "청산", STOP_LOSS: "손절", TAKE_PROFIT: "익절" };

export default function AlgoPanel({ symbol }: { symbol: { code: string; name: string } }) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<AlgoCatalog | null>(null);
  const [rules, setRules] = useState<TradingRule[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ordersEnabled, setOrdersEnabled] = useState<boolean | null>(null);
  const [editor, setEditor] = useState<{ editing?: TradingRule } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TradingRuleDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, accs] = await Promise.all([listRules(), listAlgoAccounts()]);
      setRules(list);
      setAccounts(accs);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await accessToken();
      if (cancelled) return;
      setLoggedIn(!!token);
      getAlgoCatalog()
        .then((c) => !cancelled && setCatalog(c))
        .catch((e) => !cancelled && setError(errorMessage(e)));
      if (token) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function toggle(rule: TradingRule) {
    setBusy(rule.id);
    try {
      const next = await setRuleStatus(rule.id, rule.status === "ACTIVE" ? "PAUSED" : "ACTIVE");
      setRules((list) => list.map((r) => (r.id === next.id ? { ...r, ...next } : r)));
      if (typeof next.ordersEnabled === "boolean") setOrdersEnabled(next.ordersEnabled);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function openSignals(id: string) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    setDetail(null);
    try {
      setDetail(await getRule(id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (loggedIn === false) {
    return (
      <div className="algo-panel">
        <p className="algo-note">
          알고리즘 매매 규칙은 계정과 증권사 계좌에 묶여서, <Link href="/login">로그인</Link> 후에 만들 수 있어요.
        </p>
      </div>
    );
  }

  const mine = rules.filter((r) => r.symbol === symbol.code);
  const others = rules.length - mine.length;

  return (
    <div className="algo-panel">
      <div className="algo-head">
        <strong>{symbol.name} 규칙</strong>
        <button className="ai-btn primary" onClick={() => setEditor({})} disabled={!catalog}>
          ＋ 새 규칙
        </button>
      </div>
      <p className="algo-note">조건이 맞으면 봉이 끝날 때 시장가로 주문해요. 실행은 백엔드 작업 프로그램이 켜져 있을 때만 돼요.</p>
      {ordersEnabled === false && <p className="algo-warn">서버 주문 기능이 꺼져 있어 신호만 기록돼요 (BROKER_ORDERS_ENABLED).</p>}
      {error && <p className="algo-error">{error}</p>}
      {loggedIn && mine.length === 0 && !error && <p className="algo-empty">이 종목에 건 규칙이 없어요.</p>}

      {mine.map((r) => {
        const rule = r.currentVersion?.rule;
        const text = rule ? describeRule(rule, catalog) : null;
        return (
          <article key={r.id} className={`algo-card ${r.status === "ACTIVE" ? "on" : ""}`}>
            <header>
              <span className={`algo-status ${r.status === "ACTIVE" ? "on" : ""}`}>{r.status === "ACTIVE" ? "실행 중" : "멈춤"}</span>
              <strong>{r.name ?? "이름 없음"}</strong>
              <small>
                v{r.currentVersion?.version ?? "-"} · {rule ? STRATEGY_LABEL[rule.strategy] : ""}
              </small>
            </header>
            {text && (
              <dl>
                <dt className="up">매수</dt>
                <dd>{text.entry}</dd>
                <dt className="down">매도</dt>
                <dd>{text.exit || "—"}</dd>
              </dl>
            )}
            {text && <small className="algo-base">{text.base}</small>}
            <div className="algo-actions">
              <button className={r.status === "ACTIVE" ? "ai-btn ghost" : "ai-btn primary"} onClick={() => toggle(r)} disabled={busy === r.id}>
                {r.status === "ACTIVE" ? "중지" : "실행"}
              </button>
              <button className="ai-btn ghost" onClick={() => setEditor({ editing: r })} disabled={!catalog}>
                새 버전
              </button>
              <button className="ai-btn ghost" onClick={() => openSignals(r.id)} aria-expanded={openId === r.id}>
                신호 {openId === r.id ? "▴" : "▾"}
              </button>
            </div>
            {openId === r.id && (
              <ul className="algo-signals">
                {!detail && <li className="algo-note">불러오는 중…</li>}
                {detail && detail.signals.length === 0 && <li className="algo-note">아직 신호가 없어요.</li>}
                {detail?.signals.map((s) => (
                  <li key={s.id}>
                    <b className={s.side === "BUY" ? "up" : "down"}>{s.side === "BUY" ? "매수" : "매도"}</b>
                    <span>{new Date(s.barTime).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })}</span>
                    <span>{REASON[String(s.snapshot?.reason ?? "")] ?? ""}</span>
                    <em className={s.status === "FAILED" ? "down" : ""} title={s.error ?? undefined}>
                      {SIGNAL_STATUS[s.status] ?? s.status}
                    </em>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
      {others > 0 && <p className="algo-note">다른 종목에 건 규칙 {others}개</p>}

      {editor && catalog && (
        <AlgoRuleEditor
          catalog={catalog}
          symbol={symbol}
          accounts={accounts}
          editing={editor.editing}
          onSaved={(saved) => {
            setEditor(null);
            if (typeof saved.ordersEnabled === "boolean") setOrdersEnabled(saved.ordersEnabled);
            void reload();
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
