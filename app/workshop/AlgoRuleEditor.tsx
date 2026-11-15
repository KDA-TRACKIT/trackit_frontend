"use client";
// 알고리즘 규칙 편집기: 프리셋(RSI·이동평균 교차) 또는 조건 조합. 저장하면 백엔드에 규칙(새 버전)이 확정된다.
// 규칙은 확정 후 고칠 수 없고 새 버전으로만 바뀐다 (사전 판정 근거). 만든 규칙은 멈춘 상태로 시작
import { useEffect, useMemo, useState } from "react";
import { addRuleVersion, createRule, renameRule } from "../../lib/api/algo";
import { errorMessage } from "../../lib/api/client";
import { OP_LABEL, describeRule } from "../../lib/algo-text";
import type { AlgoCatalog, AlgoCatalogIndicator, AlgoCondition, AlgoGroup, AlgoOperand, AlgoOperator, AlgoRule, AlgoSource, TradingRule } from "../../lib/types/algo";

const SOURCE_LABEL: Record<string, string> = { close: "종가", open: "시가", high: "고가", low: "저가", volume: "거래량", hl2: "(고+저)/2", hlc3: "(고+저+종)/3" };

const TIMEFRAMES = [1, 3, 5, 10, 15, 30, 60];

type Flat = { mode: "all" | "any"; conds: AlgoCondition[] };

/** 중첩 없는 조건 묶음만 화면 편집 (그 밖은 JSON 편집) */
function toFlat(g?: AlgoGroup): Flat | null {
  if (!g) return { mode: "all", conds: [] };
  if ("left" in g) return { mode: "all", conds: [g] };
  if ("all" in g && g.all.every((c) => "left" in c)) return { mode: "all", conds: g.all as AlgoCondition[] };
  if ("any" in g && g.any.every((c) => "left" in c)) return { mode: "any", conds: g.any as AlgoCondition[] };
  return null;
}

function fromFlat(f: Flat): AlgoGroup | undefined {
  if (!f.conds.length) return undefined;
  if (f.conds.length === 1) return f.conds[0];
  return f.mode === "all" ? { all: f.conds } : { any: f.conds };
}

function defaultOperand(def: AlgoCatalogIndicator): AlgoOperand {
  const params = Object.fromEntries(Object.entries(def.params).map(([k, p]) => [k, p.default]));
  return { indicator: def.name, ...(Object.keys(params).length ? { params } : {}), ...(def.fields ? { field: def.fields.default } : {}) };
}

type Props = {
  catalog: AlgoCatalog;
  symbol: { code: string; name: string };
  accounts: { id: string; label: string }[];
  /** 있으면 새 버전 만들기 */
  editing?: TradingRule;
  onSaved: (rule: TradingRule) => void;
  onClose: () => void;
};

export default function AlgoRuleEditor({ catalog, symbol, accounts, editing, onSaved, onClose }: Props) {
  const base = editing?.currentVersion?.rule;
  const [name, setName] = useState(editing?.name ?? `${symbol.name} 규칙`);
  const [accountId, setAccountId] = useState(editing?.accountId ?? accounts[0]?.id ?? "");
  const [strategy, setStrategy] = useState<AlgoRule["strategy"]>(base?.strategy ?? "RSI");
  const [timeframe, setTimeframe] = useState(base?.timeframe ?? 5);
  const [quantity, setQuantity] = useState(base?.quantity ?? 1);
  const [maxOrders, setMaxOrders] = useState(base?.maxOrdersPerDay ?? 10);
  const [rsi, setRsi] = useState(base?.strategy === "RSI" ? { period: base.period, buyBelow: base.buyBelow, sellAbove: base.sellAbove } : { period: 14, buyBelow: 30, sellAbove: 70 });
  const [sma, setSma] = useState(base?.strategy === "SMA_CROSS" ? { fast: base.fast, slow: base.slow } : { fast: 5, slow: 20 });
  const custom = base?.strategy === "CUSTOM" ? base : null;
  const [entry, setEntry] = useState<Flat>(
    () =>
      toFlat(custom?.entry) ?? {
        mode: "all",
        conds: [],
      },
  );
  const [exit, setExit] = useState<Flat>(() => toFlat(custom?.exit) ?? { mode: "all", conds: [] });
  const [stopLoss, setStopLoss] = useState<number | "">(custom?.stopLossPct ?? 3);
  const [takeProfit, setTakeProfit] = useState<number | "">(custom?.takeProfitPct ?? "");
  // 중첩 조건이라 화면 편집이 안 되거나 직접 고치고 싶을 때
  const nestedOnly = !!custom && (!toFlat(custom.entry) || !toFlat(custom.exit));
  const [jsonMode, setJsonMode] = useState(nestedOnly);
  const [json, setJson] = useState(() => JSON.stringify(base ?? {}, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rule = useMemo<AlgoRule | null>(() => {
    if (jsonMode) {
      try {
        return JSON.parse(json) as AlgoRule;
      } catch {
        return null;
      }
    }
    const common = { timeframe, quantity, maxOrdersPerDay: maxOrders };
    if (strategy === "RSI") return { strategy, ...rsi, ...common };
    if (strategy === "SMA_CROSS") return { strategy, ...sma, ...common };
    const e = fromFlat(entry);
    if (!e) return null;
    return {
      strategy: "CUSTOM",
      entry: e,
      ...(fromFlat(exit) ? { exit: fromFlat(exit) } : {}),
      ...(stopLoss !== "" ? { stopLossPct: Number(stopLoss) } : {}),
      ...(takeProfit !== "" ? { takeProfitPct: Number(takeProfit) } : {}),
      ...common,
    };
  }, [jsonMode, json, strategy, rsi, sma, entry, exit, stopLoss, takeProfit, timeframe, quantity, maxOrders]);

  const summary = rule ? describeRule(rule, catalog) : null;

  async function save() {
    if (!rule) return setError(jsonMode ? "JSON 형식이 올바르지 않아요." : "진입 조건을 하나 이상 넣어 주세요.");
    if (!editing && !accountId) return setError("계좌를 골라 주세요.");
    setSaving(true);
    setError(null);
    try {
      // 수정: 규칙 내용은 새 버전으로 쌓이고(이전 버전은 DB 에 남음), 이름이 바뀌었으면 이름만 고친다
      if (editing && (name.trim() || null) !== (editing.name ?? null)) await renameRule(editing.id, name.trim() || null);
      const saved = editing ? await addRuleVersion(editing.id, rule) : await createRule({ accountId, symbol: symbol.code, name: name.trim() || undefined, rule });
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="algo-modal" role="dialog" aria-modal="true" aria-label="알고리즘 규칙">
        <header>
          <h2>{editing ? `규칙 수정 · v${(editing.currentVersion?.version ?? 0) + 1}로 저장` : "새 알고리즘 규칙"}</h2>
          <button className="ind-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="algo-body">
          <div className="algo-row">
            <label>
              <span>이름</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </label>
            <label>
              <span>종목</span>
              <input value={`${symbol.name} · ${editing?.symbol ?? symbol.code}`} disabled />
            </label>
            <label>
              <span>계좌</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!!editing}>
                {accounts.length === 0 && <option value="">연결된 증권사 계좌 없음</option>}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="algo-row">
            <label>
              <span>봉 간격</span>
              <select value={timeframe} onChange={(e) => setTimeframe(Number(e.target.value))} disabled={jsonMode}>
                {TIMEFRAMES.map((t) => (
                  <option key={t} value={t}>
                    {t}분봉
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>수량(주)</span>
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} disabled={jsonMode} />
            </label>
            <label>
              <span>하루 최대 주문</span>
              <input type="number" min={1} max={100} value={maxOrders} onChange={(e) => setMaxOrders(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} disabled={jsonMode} />
            </label>
          </div>

          <div className="algo-strategy" role="tablist">
            {(["RSI", "SMA_CROSS", "CUSTOM"] as const).map((s) => (
              <button key={s} className={!jsonMode && strategy === s ? "active" : ""} onClick={() => (setStrategy(s), setJsonMode(false))} disabled={nestedOnly}>
                {s === "RSI" ? "RSI 과매도·과매수" : s === "SMA_CROSS" ? "이동평균 교차" : "조건 직접 조합"}
              </button>
            ))}
            <button
              className={jsonMode ? "active" : ""}
              onClick={() => {
                setJson(JSON.stringify(rule ?? base ?? {}, null, 2));
                setJsonMode(true);
              }}
            >
              JSON
            </button>
          </div>

          {jsonMode ? (
            <div className="algo-json">
              <p>중첩 조건(AND/OR/NOT 섞기)·n봉 전 값 등은 여기서 직접 고칠 수 있어요. 형식은 docs/algo.md 와 같아요.</p>
              <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={14} spellCheck={false} />
            </div>
          ) : strategy === "RSI" ? (
            <div className="algo-row">
              <NumberField label="RSI 기간" value={rsi.period} min={2} max={100} onChange={(v) => setRsi({ ...rsi, period: v })} />
              <NumberField label="이 값 아래면 매수" value={rsi.buyBelow} min={1} max={99} onChange={(v) => setRsi({ ...rsi, buyBelow: v })} />
              <NumberField label="이 값 위면 매도" value={rsi.sellAbove} min={1} max={99} onChange={(v) => setRsi({ ...rsi, sellAbove: v })} />
            </div>
          ) : strategy === "SMA_CROSS" ? (
            <div className="algo-row">
              <NumberField label="단기 이동평균" value={sma.fast} min={1} max={200} onChange={(v) => setSma({ ...sma, fast: v })} />
              <NumberField label="장기 이동평균" value={sma.slow} min={2} max={400} onChange={(v) => setSma({ ...sma, slow: v })} />
            </div>
          ) : (
            <>
              <ConditionList title="진입 (보유하지 않을 때 → 매수)" flat={entry} onChange={setEntry} catalog={catalog} />
              <ConditionList title="청산 (보유 중일 때 → 매도)" flat={exit} onChange={setExit} catalog={catalog} optional />
              <div className="algo-row">
                <label>
                  <span>손절 % (선택)</span>
                  <input type="number" min={0.1} max={50} step={0.1} value={stopLoss} onChange={(e) => setStopLoss(e.target.value === "" ? "" : Number(e.target.value))} />
                </label>
                <label>
                  <span>익절 % (선택)</span>
                  <input type="number" min={0.1} max={50} step={0.1} value={takeProfit} onChange={(e) => setTakeProfit(e.target.value === "" ? "" : Number(e.target.value))} />
                </label>
              </div>
            </>
          )}

          {summary && (
            <div className="algo-summary">
              <p>
                <b className="up">매수</b> {summary.entry}
              </p>
              <p>
                <b className="down">매도</b> {summary.exit || "—"}
              </p>
              <small>{summary.base} · 시장가 주문</small>
            </div>
          )}
          <p className="algo-note">
            확정한 규칙은 고칠 수 없고 새 버전으로만 바뀌어요 (기록에 사전 근거로 남음). 새로 만든 규칙은 <b>멈춘 상태</b>로 시작하니 확인 후 실행을 눌러 주세요.
          </p>
          {error && <p className="algo-error">{error}</p>}
        </div>

        <footer>
          <button className="ai-btn ghost" onClick={onClose}>
            취소
          </button>
          <button className="ai-btn primary" onClick={save} disabled={saving || (!editing && accounts.length === 0)}>
            {saving ? "저장 중…" : editing ? "새 버전 확정" : "규칙 만들기"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
    </label>
  );
}

function ConditionList({ title, flat, onChange, catalog, optional }: { title: string; flat: Flat; onChange: (f: Flat) => void; catalog: AlgoCatalog; optional?: boolean }) {
  const rsi = catalog.indicators.find((i) => i.name === "RSI") ?? catalog.indicators[0];
  // 새 조건 기본값: 진입은 RSI < 30, 청산은 RSI > 70
  const add = () => onChange({ ...flat, conds: [...flat.conds, optional ? { left: defaultOperand(rsi), op: ">", right: { value: 70 } } : { left: defaultOperand(rsi), op: "<", right: { value: 30 } }] });
  return (
    <section className="algo-conds">
      <header>
        <h3>{title}</h3>
        {flat.conds.length > 1 && (
          <div className="ws-seg-group" role="group" aria-label="조건 묶기">
            <button className={flat.mode === "all" ? "active" : ""} onClick={() => onChange({ ...flat, mode: "all" })}>
              모두 만족
            </button>
            <button className={flat.mode === "any" ? "active" : ""} onClick={() => onChange({ ...flat, mode: "any" })}>
              하나라도
            </button>
          </div>
        )}
      </header>
      {flat.conds.length === 0 && <p className="algo-note">{optional ? "없으면 손절·익절로만 청산해요." : "조건을 추가하세요."}</p>}
      {flat.conds.map((c, i) => (
        <div key={i} className="algo-cond">
          <OperandEditor value={c.left} catalog={catalog} onChange={(left) => onChange({ ...flat, conds: flat.conds.map((x, j) => (j === i ? { ...x, left } : x)) })} />
          <select value={c.op} onChange={(e) => onChange({ ...flat, conds: flat.conds.map((x, j) => (j === i ? { ...x, op: e.target.value as AlgoOperator } : x)) })}>
            {catalog.operators.map((op) => (
              <option key={op} value={op}>
                {OP_LABEL[op]}
              </option>
            ))}
          </select>
          <OperandEditor value={c.right} catalog={catalog} allowValue onChange={(right) => onChange({ ...flat, conds: flat.conds.map((x, j) => (j === i ? { ...x, right } : x)) })} />
          <button className="algo-del" onClick={() => onChange({ ...flat, conds: flat.conds.filter((_, j) => j !== i) })} aria-label="조건 삭제">
            ✕
          </button>
        </div>
      ))}
      <button className="algo-add" onClick={add} disabled={flat.conds.length >= catalog.limits.maxConditions}>
        ＋ 조건 추가
      </button>
    </section>
  );
}

function OperandEditor({ value, catalog, onChange, allowValue }: { value: AlgoOperand; catalog: AlgoCatalog; onChange: (o: AlgoOperand) => void; allowValue?: boolean }) {
  const isValue = "value" in value;
  const def = !isValue ? catalog.indicators.find((i) => i.name === value.indicator) : undefined;
  return (
    <div className="algo-operand">
      <select
        value={isValue ? "__value" : value.indicator}
        onChange={(e) => {
          if (e.target.value === "__value") return onChange({ value: 30 });
          const next = catalog.indicators.find((i) => i.name === e.target.value);
          if (next) onChange(defaultOperand(next));
        }}
      >
        {allowValue && <option value="__value">값</option>}
        {catalog.indicators.map((i) => (
          <option key={i.name} value={i.name}>
            {i.label}
          </option>
        ))}
      </select>
      {isValue ? (
        <input type="number" value={value.value} onChange={(e) => onChange({ value: Number(e.target.value) })} aria-label="값" />
      ) : (
        <>
          {def &&
            Object.entries(def.params).map(([k, p]) => (
              <input
                key={k}
                type="number"
                title={p.label}
                aria-label={p.label}
                value={value.params?.[k] ?? p.default}
                min={p.min}
                max={p.max}
                onChange={(e) => onChange({ ...value, params: { ...value.params, [k]: Number(e.target.value) } })}
              />
            ))}
          {def?.fields && (
            <select value={value.field ?? def.fields.default} onChange={(e) => onChange({ ...value, field: e.target.value })} aria-label="항목">
              {def.fields.values.map((f) => (
                <option key={f} value={f}>
                  {def.fields!.labels[f] ?? f}
                </option>
              ))}
            </select>
          )}
          {def?.source && (
            <select
              value={value.source ?? "close"}
              onChange={(e) => {
                const rest = { ...value };
                delete rest.source;
                onChange(e.target.value === "close" ? rest : { ...rest, source: e.target.value as AlgoSource });
              }}
              aria-label="계산 기준"
              title="계산 기준 (예: 거래량 평균은 거래량)"
            >
              {catalog.sources.map((src) => (
                <option key={src} value={src}>
                  {SOURCE_LABEL[src] ?? src}
                </option>
              ))}
            </select>
          )}
          <label className="algo-mult" title="배수 (예: 평균 거래량의 1.5배)">
            ×
            <input
              type="number"
              aria-label="배수"
              step={0.1}
              value={value.multiplier ?? 1}
              onChange={(e) => {
                const m = Number(e.target.value);
                const rest = { ...value };
                delete rest.multiplier;
                onChange(m && m !== 1 ? { ...rest, multiplier: m } : rest);
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
