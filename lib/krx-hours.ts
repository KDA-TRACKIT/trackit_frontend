/**
 * KRX 정규장 시간 (KST, 0시부터 분). 평소 09:00 ~ 15:30
 *   늦게 여는 날 (거래소 공지):
 *   - 수능일: 1시간 늦게 10:00 ~ 16:30 (NXT 프리마켓 · 애프터마켓 시작도 같이 1시간 밀림)
 *   - 새해 첫 거래일: 10:00 개장, 마감은 15:30 그대로
 *   새 해의 날짜는 거래소 공지가 나오면 아래 표에 더한다
 */
export type KrxHours = { open: number; close: number; /** 평소보다 늦게 연 분 (프리마켓도 이만큼 밀림) */ shift: number };

const NORMAL = { open: 9 * 60, close: 15 * 60 + 30 };
const SPECIAL: Record<string, { open: number; close: number }> = {
  "2025-01-02": { open: 10 * 60, close: 15 * 60 + 30 }, // 새해 첫 거래일
  "2025-11-13": { open: 10 * 60, close: 16 * 60 + 30 }, // 2026학년도 수능
  "2026-01-02": { open: 10 * 60, close: 15 * 60 + 30 }, // 새해 첫 거래일
  "2026-11-19": { open: 10 * 60, close: 16 * 60 + 30 }, // 2027학년도 수능
  "2027-01-04": { open: 10 * 60, close: 15 * 60 + 30 }, // 새해 첫 거래일
};

/** "YYYY-MM-DD"(KST) 의 정규장 시간 */
export function krxHoursOf(day: string): KrxHours {
  const h = SPECIAL[day] ?? NORMAL;
  return { ...h, shift: h.open - NORMAL.open };
}

/** 지금(또는 그 시각) KST 날짜의 정규장 시간 */
export function krxHours(now = new Date()): KrxHours {
  return krxHoursOf(new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10));
}
