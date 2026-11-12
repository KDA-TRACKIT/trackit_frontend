"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { OrderPreview } from "../../lib/types/trading";

const won = (v?: string) => (v === undefined ? "시장가" : `${Number(v).toLocaleString("ko-KR")}원`);
const CONSENT = "위 주문 내용을 확인했으며, 실제 주문 실행에 동의합니다.";

type Props = {
  preview: OrderPreview;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * 주문 미리보기 · 최종 승인. 값은 백엔드가 준 그대로 보여주기만 하고 고칠 수 없다.
 * 동의 체크 전에는 승인 버튼이 꺼져 있다.
 */
export default function OrderPreviewModal({ preview, pending, error, onConfirm, onClose }: Props) {
  const [agreed, setAgreed] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const sideLabel = preview.side === "BUY" ? "매수" : "매도";
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !pending && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <h2 id={titleId}>주문 미리보기</h2>
        <dl className="ai-grid modal-grid">
          <dt>계좌</dt>
          <dd>{preview.accountLabel}</dd>
          <dt>종목</dt>
          <dd>
            {preview.symbolName} · {preview.symbol}
          </dd>
          <dt>매수/매도</dt>
          <dd className={preview.side === "BUY" ? "up" : "down"}>{sideLabel}</dd>
          <dt>수량</dt>
          <dd>{Number(preview.quantity).toLocaleString("ko-KR")}주</dd>
          <dt>주문 유형</dt>
          <dd>{preview.orderType === "LIMIT" ? "지정가" : "시장가"}</dd>
          <dt>가격</dt>
          <dd>{won(preview.price)}</dd>
          <dt>예상 주문 금액</dt>
          <dd>{won(preview.estimatedAmount)}</dd>
          <dt>예상 수수료</dt>
          <dd>{won(preview.estimatedFee)}</dd>
          <dt>현재 잔고</dt>
          <dd>{won(preview.currentBalance)}</dd>
          <dt>주문 후 예상 잔고</dt>
          <dd>{won(preview.balanceAfter)}</dd>
        </dl>
        {preview.warnings.length > 0 && (
          <ul className="ai-risk-warnings">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <div className="modal-rationale">
          <b>AI 분석 근거</b>
          <p>{preview.rationale}</p>
        </div>
        <label className="modal-consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={pending} />
          {CONSENT}
        </label>
        {error && <p className="ai-note error">{error}</p>}
        <div className="modal-actions">
          <button className="ai-btn ghost" onClick={onClose} disabled={pending}>
            취소
          </button>
          <button className={`ai-btn ${preview.side === "BUY" ? "buy" : "sell"}`} onClick={onConfirm} disabled={!agreed || pending}>
            {pending ? "승인 처리 중…" : `${sideLabel} 승인하고 주문`}
          </button>
        </div>
      </div>
    </div>
  );
}
