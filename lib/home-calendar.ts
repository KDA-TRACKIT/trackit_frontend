const DAY = 86_400_000;
export function shiftDay(date: string, count: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);
}
export function weekDays(date: string, offset = 0): string[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const start = shiftDay(date, -((weekday + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
}
export function koreanDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}
