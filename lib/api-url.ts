/**
 * 백엔드 주소 (NEXT_PUBLIC_API_URL, 기본 http://localhost:3000)
 * 같은 와이파이의 다른 사람이 http://<내 PC IP>:3001 로 들어오면 그 사람 브라우저의 localhost 는 그 사람 PC 라서,
 * 주소가 localhost 면 ""(같은 주소)로 부른다 → 프론트 개발 서버가 /api/v1/* 를 백엔드로 넘겨 준다 (next.config.ts rewrites).
 * 그래서 다른 사람은 3001 하나만 열면 되고 CORS 도 필요 없다. 배포 주소면 그대로.
 */
export function apiBase() {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  if (typeof window === "undefined") return raw;
  try {
    const url = new URL(raw);
    const here = window.location.hostname;
    if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && here !== "localhost" && here !== "127.0.0.1") return "";
  } catch {}
  return raw;
}
