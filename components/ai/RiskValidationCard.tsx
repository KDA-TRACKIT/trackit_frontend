import type { RiskValidation } from "../../lib/types/trading";

const won = (v?: string) => (v === undefined ? "—" : `${Number(v).toLocaleString("ko-KR")}원`);

/** 백엔드 위험 검증 결과. 주문 가능 여부는 allowed 만 따른다 (프론트에서 따로 판단하지 않음) */
export default function RiskValidationCard({ validation }: { validation: RiskValidation }) {
  const state = !validation.allowed ? "blocked" : validation.warnings.length ? "warn" : "pass";
  const title = state === "blocked" ? "주문 차단" : state === "warn" ? "통과 · 경고 있음" : "통과";
  return (
    <section className={`ai-risk ${state}`} aria-label="위험 검증 결과">
      <header>
        <strong>위험 검증 {title}</strong>
      </header>
      {validation.errors.length > 0 && (
        <ul className="ai-risk-errors">
          {validation.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {validation.warnings.length > 0 && (
        <ul className="ai-risk-warnings">
          {validation.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <dl className="ai-grid">
        <dt>예상 주문 금액</dt>
        <dd>{won(validation.estimatedAmount)}</dd>
        <dt>예상 수수료</dt>
        <dd>{won(validation.estimatedFee)}</dd>
        <dt>현재 잔고</dt>
        <dd>{won(validation.currentBalance)}</dd>
        <dt>보유 수량</dt>
        <dd>{validation.currentPosition === undefined ? "—" : `${Number(validation.currentPosition).toLocaleString("ko-KR")}주`}</dd>
        <dt>일일 손실 한도</dt>
        <dd>{won(validation.dailyLossLimit)}</dd>
      </dl>
    </section>
  );
}
