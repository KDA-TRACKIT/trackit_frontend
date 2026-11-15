"use client";
// 투자 정보 입력 칸 (마이페이지 · 내 투자 정보, 가입 직후 최초 프로필 생성에서 함께 씀)
// user_metadata.investment 에 저장한다
import { MultiChips } from "../ui";

export const STYLES = ["단타", "스윙", "중장기", "추세 추종", "가치 투자", "돌파 매매", "눌림목 매매"] as const;
export const INDICATORS = ["이동평균선", "거래량", "RSI", "MACD", "볼린저 밴드", "지지·저항", "추세선"] as const;

export type Investment = { market: string; period: string; styles: string[]; indicators: string[]; otherIndicators: string; principle: string };

export const EMPTY_INVESTMENT: Investment = { market: "", period: "", styles: [], indicators: [], otherIndicators: "", principle: "" };

export function readInvestment(meta: Record<string, unknown>): Investment {
  const v = meta.investment;
  if (!v || typeof v !== "object") return EMPTY_INVESTMENT;
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const a = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);
  return { market: s("market"), period: s("period"), styles: a("styles"), indicators: a("indicators"), otherIndicators: s("otherIndicators"), principle: s("principle") };
}

/** showPeriod: 마이페이지에만 있는 "주요 투자 기간" 칸 */
export function InvestmentFields({ value, onChange, showPeriod = true, variant = "mypage" }: { value: Investment; onChange: (v: Investment) => void; showPeriod?: boolean; variant?: "mypage" | "onboarding" }) {
  const set = (patch: Partial<Investment>) => onChange({ ...value, ...patch });
  const onboarding = variant === "onboarding";
  return (
    <div className="mp-form">
      <div className={showPeriod ? "mp-row-2" : ""}>
        <label className="mp-field">
          <span>투자 시장</span>
          <input value={value.market} onChange={(e) => set({ market: e.target.value })} maxLength={60} placeholder="국내 주식, 미국 주식, ETF …" />
        </label>
        {showPeriod && (
          <label className="mp-field">
            <span>보유 기간</span>
            <input value={value.period} onChange={(e) => set({ period: e.target.value })} maxLength={30} placeholder="단기, 중기, 장기 …" />
          </label>
        )}
      </div>
      <div className="mp-field">
        <span className="mp-label">
          매매 방식 <small>여러 개 선택</small>
        </span>
        <MultiChips options={STYLES} value={value.styles} onChange={(styles) => set({ styles })} />
      </div>
      <div className="mp-field">
        <span className="mp-label">
          참고 지표 <small>여러 개 선택</small>
        </span>
        <MultiChips options={INDICATORS} value={value.indicators} onChange={(indicators) => set({ indicators })} />
        <input
          className="mp-input"
          value={value.otherIndicators}
          onChange={(e) => set({ otherIndicators: e.target.value })}
          maxLength={100}
          placeholder="직접 입력 (예: VWAP, 일목균형표)"
        />
      </div>
      <div className="mp-sep" />
      <label className="mp-field">
        <span className="mp-label">
          매매 원칙 <small>선택</small>
        </span>
        <textarea
          value={value.principle}
          onChange={(e) => set({ principle: e.target.value.slice(0, 500) })}
          placeholder="예: 진입 전에 손절가부터 정한다"
        />
      </label>
    </div>
  );
}
