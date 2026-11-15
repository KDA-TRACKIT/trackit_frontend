// 개인정보 및 공개 설정 (user_metadata.privacy)
export type Privacy = { profilePublic: boolean; trustConsent: boolean; notifications: boolean };

export function readPrivacy(meta: Record<string, unknown>): Privacy {
  const p = (meta.privacy && typeof meta.privacy === "object" ? meta.privacy : {}) as Record<string, unknown>;
  return { profilePublic: p.profilePublic !== false, trustConsent: p.trustConsent === true, notifications: p.notifications !== false };
}
