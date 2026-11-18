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
  const my = !onboarding;
  return (
    <div className="mp-form">
      <div className={showPeriod ? "mp-row-2" : ""}>
        <label className="mp-field">
          <span>주요 투자 시장</span>
          <input value={value.market} onChange={(e) => set({ market: e.target.value })} maxLength={60} placeholder="예: 국내 주식, 미국 주식, ETF" />
        </label>
        {showPeriod && (
          <label className="mp-field">
            <span>{my ? "주요 투자 기간" : "보유 기간"}</span>
            <input value={value.period} onChange={(e) => set({ period: e.target.value })} maxLength={30} placeholder={my ? "예: 단기, 중기, 장기" : "단기, 중기, 장기 …"} />
          </label>
        )}
      </div>
      <div className="mp-field">
        <span className="mp-label">
          나의 매매 방식 {my && <small>복수 선택 가능</small>}
        </span>
        {!my && <small className="mp-field-desc">주로 사용하는 매매 유형을 선택해주세요. 여러 개 선택할 수 있어요.</small>}
        <MultiChips options={STYLES} value={value.styles} onChange={(styles) => set({ styles })} />
      </div>
      <div className="mp-field">
        <span className="mp-label">
          자주 쓰는 참고 지표 {my && <small>복수 선택 가능</small>}
        </span>
        {!my && <small className="mp-field-desc">매수·매도 판단에 참고하는 지표를 선택해주세요.</small>}
        <MultiChips options={INDICATORS} value={value.indicators} onChange={(indicators) => set({ indicators })} />
        <input
          className="mp-input"
          value={value.otherIndicators}
          onChange={(e) => set({ otherIndicators: e.target.value })}
          maxLength={100}
          placeholder={my ? "그 외 참고 지표를 직접 입력하세요. (예: VWAP, 일목균형표)" : "직접 입력하기  예: 스토캐스틱, 일목균형표, VWAP"}
        />
      </div>
      <div className="mp-sep" />
      <label className="mp-field">
        <span className="mp-label">
          {my ? "나의 매매 원칙" : "나의 투자 원칙"}
        </span>
        <small className="mp-field-desc">{my ? "손절·익절 기준, 진입 조건, 리스크 관리 원칙 등을 작성해 주세요." : "매매 전략이나 손절·익절 원칙을 자유롭게 적어주세요. (선택)"}</small>
        <textarea
          value={value.principle}
          onChange={(e) => set({ principle: e.target.value.slice(0, 500) })}
          placeholder={my ? "예: 거래량과 이동평균선을 함께 확인하고, 진입 전 손절선을 정합니다." : "예: 진입 전 손절가를 정하고, 거래량과 추세를 함께 확인해요."}
        />
      </label>
    </div>
  );
}
