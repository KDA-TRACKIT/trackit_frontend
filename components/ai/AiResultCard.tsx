import type { TradeAnalysis } from "../../lib/types/ai";

const won = (v: string | number) => Number(v).toLocaleString("ko-KR");
const ACTION: Record<TradeAnalysis["action"], string> = { BUY: "매수", SELL: "매도", HOLD: "관망" };

type Props = {
  analysis: TradeAnalysis;
  symbolName: string;
  analyzedAt?: string;
  model?: string;
  /** 백엔드 검증 상태 문구 (검증 중 / 통과 / 차단) */
  validationLabel: string;
};

/** AI 분석 결과를 구조화된 카드로 (자연어만 보여주지 않는다) */
export default function AiResultCard({ analysis, symbolName, analyzedAt, model, validationLabel }: Props) {
  const confidence = Math.round(analysis.confidence * 100);
  const time = analyzedAt ? new Date(analyzedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  return (
    <article className={`ai-result ${analysis.action.toLowerCase()}`}>
      <header>
        <strong>{ACTION[analysis.action]}</strong>
        <span>
          {symbolName} · {analysis.symbol}
        </span>
      </header>
      <dl className="ai-grid">
        <dt>수량</dt>
        <dd>{analysis.quantity ? `${won(analysis.quantity)}주` : "—"}</dd>
        <dt>예상 가격</dt>
        <dd>{analysis.price ? `${won(analysis.price)}원` : "시장가"}</dd>
        <dt>신뢰도</dt>
        <dd>
          <span className="ai-meter" aria-label={`신뢰도 ${confidence}%`}>
            <i style={{ width: `${confidence}%` }} />
          </span>
          {confidence}%
        </dd>
        <dt>검증</dt>
        <dd>{validationLabel}</dd>
      </dl>
      <p className="ai-rationale">{analysis.rationale}</p>
      <footer>
        분석 {time} · 모델 {model ?? "—"}
      </footer>
    </article>
  );
}
