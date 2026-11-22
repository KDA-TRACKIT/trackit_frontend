"use client";
// 투자 정보 입력 칸 (마이페이지 · 내 투자 정보, 가입 직후 최초 프로필 생성에서 함께 씀)
// user_metadata.investment 에 저장한다
import { MultiChips } from "../ui";

/** 매매 기법만 (보유 기간 — 단타 · 스윙 · 중장기 — 은 "주요 투자 기간" 칸에) */
export const STYLES = ["추세 추종", "돌파 매매", "눌림목 매매", "역추세(반등)", "가치 투자", "성장주 투자", "배당 투자", "뉴스 · 이벤트 매매", "시스템 매매"] as const;
/** 예전 목록의 보유 기간 항목 → 투자 기간 값 (기간 칸이 비어 있으면 옮겨 넣음) */
const LEGACY_PERIOD: Record<string, string> = { 단타: "단기", 스윙: "중기", 중장기: "장기" };
/** 주요 투자 기간 (여러 개 고를 수 있음, 값은 "단기, 중기" 처럼 저장) */
export const PERIODS = [
  { key: "단기", hint: "며칠 ~ 몇 주" },
  { key: "중기", hint: "몇 주 ~ 몇 달" },
  { key: "장기", hint: "6개월 이상" },
] as const;
export const INDICATORS = ["이동평균선", "거래량", "RSI", "MACD", "볼린저 밴드", "지지·저항", "추세선"] as const;

export type Investment = { market: string; period: string; styles: string[]; indicators: string[]; otherIndicators: string; principle: string };

export const EMPTY_INVESTMENT: Investment = { market: "", period: "", styles: [], indicators: [], otherIndicators: "", principle: "" };

export function readInvestment(meta: Record<string, unknown>): Investment {
  const v = meta.investment;
  if (!v || typeof v !== "object") return EMPTY_INVESTMENT;
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const a = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);
  const styles = a("styles");
  const legacy = styles.filter((x) => x in LEGACY_PERIOD).map((x) => LEGACY_PERIOD[x]);
  return {
    market: s("market"),
    period: s("period") || legacy.join(", "),
    styles: styles.filter((x) => !(x in LEGACY_PERIOD)),
    indicators: a("indicators"),
    otherIndicators: s("otherIndicators"),
    principle: s("principle"),
  };
}

/** showPeriod: "주요 투자 기간" 칸 (기본 보임) */
export function InvestmentFields({ value, onChange, showPeriod = true, variant = "mypage" }: { value: Investment; onChange: (v: Investment) => void; showPeriod?: boolean; variant?: "mypage" | "onboarding" }) {
  const set = (patch: Partial<Investment>) => onChange({ ...value, ...patch });
  const onboarding = variant === "onboarding";
  const my = !onboarding;
  return (
    <div className="mp-form">
      {/* 마이페이지(시안 2026-11-19): 주요 투자 시장 · 주요 투자 기간을 한 줄에 칸 두 개로 */}
      {my && showPeriod ? (
        <div className="mp-row-2">
          <label className="mp-field">
            <span>주요 투자 시장</span>
            <input value={value.market} onChange={(e) => set({ market: e.target.value })} maxLength={60} placeholder="예: 국내 주식, 미국 주식, ETF" />
          </label>
          <label className="mp-field">
            <span>주요 투자 기간</span>
            <input value={value.period} onChange={(e) => set({ period: e.target.value })} maxLength={30} placeholder="예: 단기, 중기, 장기" />
          </label>
        </div>
      ) : (
        <label className="mp-field">
          <span>주요 투자 시장</span>
          <input value={value.market} onChange={(e) => set({ market: e.target.value })} maxLength={60} placeholder="예: 국내 주식, 미국 주식, ETF" />
        </label>
      )}
      {/* 주요 투자 기간 (가입 직후): 단기 · 중기 · 장기 중 고르기 (단타 · 스윙 · 중장기를 매매 방식에서 빼고 여기로) */}
      {showPeriod && !my && (
        <div className="mp-field">
          <span className="mp-label">
            주요 투자 기간 <em className="mp-optional">(선택)</em> {my && <small>복수 선택 가능</small>}
          </span>
          {!my && <small className="mp-field-desc">주로 얼마나 들고 가는지 골라 주세요.</small>}
          <div className="mp-chips multi mp-period-chips">
            {PERIODS.map((p) => {
              const picked = value.period.split(/\s*,\s*/).filter(Boolean);
              const on = picked.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  className={on ? "on" : ""}
                  onClick={() => set({ period: (on ? picked.filter((x) => x !== p.key) : [...picked, p.key]).sort((x, y) => PERIODS.findIndex((q) => q.key === x) - PERIODS.findIndex((q) => q.key === y)).join(", ") })}
                >
                  {p.key} <small>{p.hint}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mp-field">
        <span className="mp-label">
          나의 매매 방식 <em className="mp-optional">(선택)</em> {my && <small>복수 선택 가능</small>}
        </span>
        {!my && <small className="mp-field-desc">주로 쓰는 매매 기법을 골라 주세요. 여러 개 고를 수 있어요.</small>}
        <MultiChips options={STYLES} value={value.styles} onChange={(styles) => set({ styles })} />
      </div>
      <div className="mp-field">
        <span className="mp-label">
          자주 쓰는 참고 지표 <em className="mp-optional">(선택)</em> {my && <small>복수 선택 가능</small>}
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
        {!my && <small className="mp-field-desc">매매 전략이나 손절·익절 원칙을 자유롭게 적어주세요. (선택)</small>}
        <textarea
          value={value.principle}
          onChange={(e) => set({ principle: e.target.value.slice(0, 500) })}
          placeholder={my ? "예: 거래량과 이동평균선을 함께 확인하고, 진입 전 손절선을 정합니다." : "예: 진입 전 손절가를 정하고, 거래량과 추세를 함께 확인해요."}
        />
      </label>
    </div>
  );
}
