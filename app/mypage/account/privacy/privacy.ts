// 개인정보 및 공개 설정 (user_metadata.privacy)
//   profilePublic · trustConsent · notifications: 계정 설정의 세 줄 (예전과 같은 키)
//   items: 개인정보 공개 설정 화면의 항목별 공개 여부 (닉네임은 항상 공개라 없음)
export const PROFILE_ITEMS = [
  { key: "image", title: "프로필 이미지", desc: "비공개로 하면 기본 이미지로 보여요." },
  { key: "handle", title: "표시 아이디", desc: "@nickname 형식의 아이디" },
  { key: "bio", title: "프로필 소개", desc: "최대 200자 소개 문구" },
] as const;
export const INVEST_ITEMS = [
  { key: "market", title: "주요 투자 시장", desc: "예: 국내 주식, 미국 주식, ETF" },
  { key: "horizon", title: "주요 투자 기간", desc: "예: 단기, 중기, 장기" },
  { key: "styles", title: "나의 매매 방식", desc: "단타, 스윙, 추세 추종 등 선택한 방식" },
  { key: "indicators", title: "자주 쓰는 참고 지표", desc: "이동평균선, 거래량, RSI 등 선택한 지표" },
  { key: "principles", title: "나의 매매 원칙", desc: "손절·익절 기준, 진입 조건 등 직접 작성한 내용" },
] as const;
export type PrivacyItem = (typeof PROFILE_ITEMS)[number]["key"] | (typeof INVEST_ITEMS)[number]["key"];
export type Privacy = { profilePublic: boolean; trustConsent: boolean; notifications: boolean; items: Record<PrivacyItem, boolean> };

/** 처음엔 매매 원칙만 비공개 (직접 쓴 글이라) */
const DEFAULT_ITEMS: Record<PrivacyItem, boolean> = { image: true, handle: true, bio: true, market: true, horizon: true, styles: true, indicators: true, principles: false };

export function readPrivacy(meta: Record<string, unknown>): Privacy {
  const p = (meta.privacy && typeof meta.privacy === "object" ? meta.privacy : {}) as Record<string, unknown>;
  const raw = (p.items && typeof p.items === "object" ? p.items : {}) as Record<string, unknown>;
  const items = Object.fromEntries(Object.entries(DEFAULT_ITEMS).map(([k, v]) => [k, typeof raw[k] === "boolean" ? raw[k] : v])) as Record<PrivacyItem, boolean>;
  return { profilePublic: p.profilePublic !== false, trustConsent: p.trustConsent === true, notifications: p.notifications !== false, items };
}

/** 비즈니스 프로필 전환: 모든 항목 공개 */
export function allPublic(p: Privacy): Privacy {
  return { ...p, profilePublic: true, items: Object.fromEntries(Object.keys(p.items).map((k) => [k, true])) as Record<PrivacyItem, boolean> };
}
