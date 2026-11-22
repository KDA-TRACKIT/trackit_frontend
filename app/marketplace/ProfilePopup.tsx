"use client";
// 트레이더 프로필 (2026-11-22): 전략 마켓 목록 · 트레이더 화면에서 프로필 사진이나 이름을 누르면 뜸
//   마이페이지 '내 프로필 미리보기'와 같은 모양: 사진 · 이름 / 소개 / 주요 투자 시장 · 기간 · 매매 방식 · 참고 지표 · 매매 원칙
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Trader } from "./data";

export default function ProfilePopup({ trader, onClose }: { trader: Trader; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const rows: [string, string][] = (
    [
      ["주요 투자 시장", trader.market],
      ["주요 투자 기간", trader.type],
      ["나의 매매 방식", trader.styles.join(", ")],
      ["자주 쓰는 참고 지표", trader.indicators.join(", ")],
      ["나의 매매 원칙", trader.quote],
    ] as [string, string][]
  ).filter(([, v]) => !!v?.trim());
  const intro = trader.intro || trader.bio.join(" ");
  // 목록 줄 안에서 그리면 아래 줄이 팝업 위로 비쳐 보여서 페이지 맨 위(body)에 그림 (2026-11-22)
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="mk-pp-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mk-pp" role="dialog" aria-modal="true" aria-label={`${trader.name} 프로필`}>
        <button type="button" className="mk-pp-x" aria-label="닫기" onClick={onClose}>
          ×
        </button>
        <div className="mk-pp-who">
          <span className="mk-pp-avatar" aria-hidden>
            {trader.name.slice(0, 1)}
          </span>
          <div>
            <h2>{trader.name}</h2>
            {trader.tagline && <span>#{trader.tagline.replace(/^#\s*/, "")}</span>}
          </div>
        </div>
        {intro && <p className="mk-pp-bio">{intro}</p>}
        {rows.length > 0 && (
          <dl>
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>,
    document.body,
  );
}
